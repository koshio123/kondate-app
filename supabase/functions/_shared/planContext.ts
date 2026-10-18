// Reads what a generation needs from the database (Deno / Edge Functions only).
// Every query runs as the caller, so RLS limits it to their household.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { errorResponse } from "./http.ts";
import type { PlanContextRows } from "./plan/context.ts";
import type { Course, DayMode, RestrictionKind } from "./plan/types.ts";

const RECENT_DAYS = 14;

export interface PlanRow {
  id: string;
  household_id: string;
  start_date: string;
  status: string;
  request: string;
}

// Embedded many-to-one rows come back as objects; without generated DB types supabase-js
// types them as arrays, so accept both shapes.
type One<T> = T | T[] | null;

export function one<T>(value: One<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface MemberRow {
  id: string;
  member_food_restrictions: {
    label: string;
    kind: RestrictionKind;
    ingredients: One<{ aliases: string[] }>;
  }[];
}

interface RecentDayRow {
  planned_dishes: { course: string; recipes: One<{ title: string }> }[];
}

export interface LoadOptions {
  /**
   * "available": leftovers not used yet, plus those this plan already uses (a full regeneration
   * gives them back). "unused": only those no plan uses (re-suggesting part of a plan).
   */
  leftovers: "available" | "unused";
}

export async function loadPlanContext(
  db: SupabaseClient,
  planId: string,
  options: LoadOptions = { leftovers: "available" },
): Promise<{ plan: PlanRow; rows: PlanContextRows } | { error: Response }> {
  const plan = await db
    .from("meal_plans")
    .select("id, household_id, start_date, status, request")
    .eq("id", planId)
    .maybeSingle<PlanRow>();
  if (plan.error) return { error: errorResponse(500, "DB_ERROR", "献立を読み込めませんでした") };
  if (!plan.data) return { error: errorResponse(404, "NOT_FOUND", "献立が見つかりません") };
  const { household_id: householdId, start_date: startDate } = plan.data;

  let leftoverQuery = db
    .from("leftovers")
    .select("raw_name, amount, unit")
    .eq("household_id", householdId);
  leftoverQuery =
    options.leftovers === "unused"
      ? leftoverQuery.is("used_in_plan_id", null)
      : leftoverQuery.or(`used_in_plan_id.is.null,used_in_plan_id.eq.${planId}`);

  const [days, settings, members, leftovers, recent] = await Promise.all([
    db.from("meal_plan_days").select("date, mode").eq("meal_plan_id", planId).eq("meal_type", "dinner"),
    db
      .from("household_settings")
      .select("quick_mode_max_minutes")
      .eq("household_id", householdId)
      .maybeSingle<{ quick_mode_max_minutes: number }>(),
    db
      .from("members")
      .select("id, member_food_restrictions(label, kind, ingredients(aliases))")
      .eq("household_id", householdId),
    leftoverQuery.order("created_at"),
    db
      .from("meal_plan_days")
      .select("planned_dishes(course, recipes(title))")
      .gte("date", addDays(startDate, -RECENT_DAYS))
      .lt("date", startDate),
  ]);
  const failed = [days, settings, members, leftovers, recent].find((r) => r.error);
  if (failed) return { error: errorResponse(500, "DB_ERROR", "献立の条件を読み込めませんでした") };

  const memberRows = (members.data ?? []) as unknown as MemberRow[];
  return {
    plan: plan.data,
    rows: {
      days: (days.data ?? []) as { date: string; mode: DayMode }[],
      memberCount: memberRows.length,
      quickMaxMinutes: settings.data?.quick_mode_max_minutes ?? null,
      restrictions: memberRows.flatMap((m) =>
        m.member_food_restrictions.map((r) => ({
          label: r.label,
          kind: r.kind,
          aliases: one(r.ingredients)?.aliases ?? null,
        })),
      ),
      leftovers: (leftovers.data ?? []) as PlanContextRows["leftovers"],
      recentTitles: ((recent.data ?? []) as unknown as RecentDayRow[]).flatMap((d) =>
        d.planned_dishes.flatMap((p) => {
          const title = one(p.recipes)?.title;
          return p.course !== "staple" && title ? [title] : [];
        }),
      ),
      request: plan.data.request ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// The plan's current dishes (for re-suggesting part of it)
// ---------------------------------------------------------------------------

export interface CurrentDishRow {
  id: string;
  position: number;
  /** Make-ahead (作り置き): the dish of the day it is cooked. */
  madeOn?: { id: string; date: string };
  title: string;
  course: Course;
  cook_minutes: number;
  /** Non-pantry ingredient names. */
  main_ingredients: string[];
}

export interface CurrentDayRow {
  id: string;
  date: string;
  mode: DayMode;
  dishes: CurrentDishRow[];
}

interface DayQueryRow {
  id: string;
  date: string;
  mode: DayMode;
  planned_dishes: {
    id: string;
    position: number;
    course: Course;
    made_on: string | null;
    recipes: One<{
      title: string;
      cook_minutes: number;
      recipe_ingredients: { raw_name: string; is_pantry: boolean; position: number }[];
    }>;
  }[];
}

export async function loadCurrentDays(db: SupabaseClient, planId: string): Promise<CurrentDayRow[] | null> {
  const { data, error } = await db
    .from("meal_plan_days")
    .select(
      "id, date, mode, planned_dishes(id, position, course, made_on, recipes(title, cook_minutes, recipe_ingredients(raw_name, is_pantry, position)))",
    )
    .eq("meal_plan_id", planId)
    .eq("meal_type", "dinner")
    .order("date");
  if (error) return null;
  const rows = (data ?? []) as unknown as DayQueryRow[];
  const dateOfDish = new Map(rows.flatMap((day) => day.planned_dishes.map((p) => [p.id, day.date] as const)));
  return rows.map((day) => ({
    id: day.id,
    date: day.date,
    mode: day.mode,
    dishes: day.planned_dishes
      .map((p) => {
        const recipe = one(p.recipes);
        const madeOnDate = p.made_on ? dateOfDish.get(p.made_on) : undefined;
        return {
          id: p.id,
          position: p.position,
          madeOn: p.made_on && madeOnDate ? { id: p.made_on, date: madeOnDate } : undefined,
          title: recipe?.title ?? "",
          course: p.course,
          cook_minutes: recipe?.cook_minutes ?? 0,
          main_ingredients: [...(recipe?.recipe_ingredients ?? [])]
            .sort((a, b) => a.position - b.position)
            .filter((i) => !i.is_pantry)
            .map((i) => i.raw_name),
        };
      })
      .sort((a, b) => a.position - b.position),
  }));
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
