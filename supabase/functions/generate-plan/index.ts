// POST /functions/v1/generate-plan  { "meal_plan_id": "<uuid>" }
//
// Generates (or regenerates) the dinners of a meal plan. Responds 202 right away and runs the
// generation as a background task; the client watches meal_plans.status
// (generating -> proposed, or back to draft with generation_error).
// See docs/02_design.md "5. 献立生成の処理" and docs/04_model_evaluation.md.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { claudeCaller, planModel } from "../_shared/anthropic.ts";
import { corsHeaders, errorResponse, json, userClient } from "../_shared/http.ts";
import { buildPlanInput, type PlanContextRows } from "../_shared/plan/context.ts";
import { generateTwoStage } from "../_shared/plan/generate.ts";
import { PROMPT_VERSION } from "../_shared/plan/prompt.ts";
import type { DayMode, PlanInput, RestrictionKind } from "../_shared/plan/types.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "POST で呼び出してください");

  const db = userClient(req);
  if (!db) return errorResponse(401, "UNAUTHORIZED", "ログインが必要です");

  const body = await req.json().catch(() => null);
  const planId = typeof body?.meal_plan_id === "string" ? body.meal_plan_id : "";
  if (!UUID.test(planId)) return errorResponse(400, "BAD_REQUEST", "meal_plan_id が不正です");

  // RLS limits every read to the caller's household, so "not found" also covers other households.
  const loaded = await loadContext(db, planId);
  if ("error" in loaded) return loaded.error;
  const input = buildPlanInput(loaded.rows);
  if (!input.days.some((d) => d.mode !== "none")) {
    return errorResponse(422, "NO_DAYS", "献立を作る日がありません(すべて「なし」です)");
  }

  const { data: claimed, error: claimError } = await db.rpc("claim_plan_generation", {
    p_plan_id: planId,
  });
  if (claimError) return errorResponse(500, "DB_ERROR", "献立の状態を更新できませんでした");
  if (!claimed) {
    return errorResponse(409, "ALREADY_GENERATING", "この献立は生成中か、すでに確定しています");
  }

  const task = generateAndSave(db, planId, input);
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(task);
    return json({ meal_plan_id: planId, status: "generating" }, 202);
  }
  await task; // e.g. plain `deno run`: no background tasks, so finish before responding
  return json({ meal_plan_id: planId, status: "done" }, 200);
});

async function generateAndSave(db: SupabaseClient, planId: string, input: PlanInput): Promise<void> {
  const model = planModel();
  try {
    const result = await generateTwoStage(input, claudeCaller(model));
    const tokens = result.attempts.reduce(
      (sum, a) => ({ input: sum.input + a.reply.inputTokens, output: sum.output + a.reply.outputTokens }),
      { input: 0, output: 0 },
    );
    console.log(
      JSON.stringify({
        event: "plan_generated",
        planId,
        model,
        ok: result.plan !== null,
        totalMs: result.totalMs,
        retries: result.retries,
        tokens,
      }),
    );

    if (!result.plan) {
      await fail(db, planId, result.failure ?? "献立を作れませんでした");
      return;
    }

    const meta = {
      servings: input.servings,
      model,
      prompt_version: PROMPT_VERSION,
      strategy: result.strategy,
      total_ms: result.totalMs,
      retries: result.retries,
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      warnings: result.validation?.warnings ?? [],
    };
    const { error } = await db.rpc("save_generated_plan", {
      p_plan_id: planId,
      p_days: result.plan.days,
      p_meta: meta,
    });
    if (error) throw new Error(`save_generated_plan: ${error.message}`);
  } catch (error) {
    console.error(JSON.stringify({ event: "plan_generation_error", planId, error: String(error) }));
    await fail(db, planId, "献立の作成中にエラーが発生しました。もう一度お試しください。");
  }
}

async function fail(db: SupabaseClient, planId: string, message: string): Promise<void> {
  const { error } = await db.rpc("fail_plan_generation", { p_plan_id: planId, p_error: message });
  if (error) console.error(JSON.stringify({ event: "fail_plan_generation_error", planId, error: error.message }));
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PlanRow {
  id: string;
  household_id: string;
  start_date: string;
  status: string;
  request: string;
}

// Embedded many-to-one rows come back as objects; without generated DB types supabase-js
// types them as arrays, so accept both shapes.
type One<T> = T | T[] | null;

function one<T>(value: One<T>): T | null {
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

async function loadContext(
  db: SupabaseClient,
  planId: string,
): Promise<{ rows: PlanContextRows } | { error: Response }> {
  const plan = await db
    .from("meal_plans")
    .select("id, household_id, start_date, status, request")
    .eq("id", planId)
    .maybeSingle<PlanRow>();
  if (plan.error) return { error: errorResponse(500, "DB_ERROR", "献立を読み込めませんでした") };
  if (!plan.data) return { error: errorResponse(404, "NOT_FOUND", "献立が見つかりません") };
  const { household_id: householdId, start_date: startDate } = plan.data;

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
    db
      .from("leftovers")
      .select("raw_name, amount, unit")
      .eq("household_id", householdId)
      .or(`used_in_plan_id.is.null,used_in_plan_id.eq.${planId}`)
      .order("created_at"),
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

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
