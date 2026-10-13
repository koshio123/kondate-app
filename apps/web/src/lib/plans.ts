import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DayMode } from "@/components/ModeBadge";
import { useHousehold } from "@/auth/useHousehold";
import { supabase } from "./supabase";
import { toIsoDate } from "./date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanStatus = "draft" | "generating" | "proposed" | "confirmed" | "archived";
export type Course = "staple" | "main" | "side" | "soup" | "one_dish";

export const COURSE_LABEL: Record<Course, string> = {
  staple: "主食",
  main: "主菜",
  side: "副菜",
  soup: "汁物",
  one_dish: "一品",
};

export interface PlanDish {
  id: string;
  course: Course;
  position: number;
  recipe: { id: string; title: string; cook_minutes: number; is_favorite: boolean } | null;
}

export interface PlanDay {
  id: string;
  date: string;
  mode: DayMode;
  dishes: PlanDish[];
}

export interface PlanWarning {
  code: string;
  message: string;
  date?: string;
}

export interface Plan {
  id: string;
  start_date: string;
  end_date: string;
  status: PlanStatus;
  request: string;
  generation_error: string | null;
  warnings: PlanWarning[];
  days: PlanDay[];
}

const PLAN_SELECT = `
  id, start_date, end_date, status, request, generation_error, generation_meta,
  meal_plan_days (
    id, date, mode,
    planned_dishes ( id, course, position, recipes ( id, title, cook_minutes, is_favorite ) )
  )
`;

/** Shapes the nested PostgREST row into a Plan with days and dishes in order. */
function toPlan(row: Record<string, unknown>): Plan {
  const days = (row.meal_plan_days as Record<string, unknown>[] | null) ?? [];
  const meta = (row.generation_meta as { warnings?: PlanWarning[] } | null) ?? null;
  return {
    id: row.id as string,
    start_date: row.start_date as string,
    end_date: row.end_date as string,
    status: row.status as PlanStatus,
    request: (row.request as string) ?? "",
    generation_error: (row.generation_error as string | null) ?? null,
    warnings: meta?.warnings ?? [],
    days: days
      .map((d) => ({
        id: d.id as string,
        date: d.date as string,
        mode: d.mode as DayMode,
        dishes: ((d.planned_dishes as Record<string, unknown>[] | null) ?? [])
          .map((p) => ({
            id: p.id as string,
            course: p.course as Course,
            position: p.position as number,
            recipe: (p.recipes as PlanDish["recipe"]) ?? null,
          }))
          .sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const GENERATING_POLL_MS = 3000;

export function usePlan(planId: string | undefined) {
  return useQuery({
    queryKey: ["plan", planId],
    enabled: Boolean(planId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plans")
        .select(PLAN_SELECT)
        .eq("id", planId!)
        .maybeSingle();
      if (error) throw error;
      return data ? toPlan(data as unknown as Record<string, unknown>) : null;
    },
    // While the Edge Function works in the background, check again every few seconds.
    refetchInterval: (query) =>
      query.state.data?.status === "generating" ? GENERATING_POLL_MS : false,
  });
}

/**
 * Plans that have not ended yet, earliest first. Plans never share a date
 * (save_plan_draft gives each date to the plan saved last), so the first one is the plan
 * for today, or the next one when today has none.
 */
export function useActivePlans() {
  return useQuery({
    queryKey: ["plan", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_plans")
        .select(PLAN_SELECT)
        .gte("end_date", toIsoDate(new Date()))
        .neq("status", "archived")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]).map(toPlan);
    },
    refetchInterval: (query) =>
      query.state.data?.some((p) => p.status === "generating") ? GENERATING_POLL_MS : false,
  });
}

/** The plan to show first on the home screen (today's, or the next one). */
export function useCurrentPlan() {
  const active = useActivePlans();
  return { ...active, data: active.data ? (active.data[0] ?? null) : undefined };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useSavePlanDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      planId: string | null;
      start: string;
      end: string;
      days: { date: string; mode: DayMode }[];
    }) => {
      const { data, error } = await supabase.rpc("save_plan_draft", {
        // Generated RPC types do not mark arguments as nullable; null creates a new plan.
        p_plan_id: args.planId as string,
        p_start: args.start,
        p_end: args.end,
        p_days: args.days,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan"] }),
  });
}

/** Saves the S3 request text and asks the Edge Function to generate the plan. */
export function useStartGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { planId: string; request?: string }) => {
      if (args.request !== undefined) {
        const { error } = await supabase
          .from("meal_plans")
          .update({ request: args.request.trim() })
          .eq("id", args.planId);
        if (error) throw error;
      }
      const { error } = await supabase.functions.invoke("generate-plan", {
        body: { meal_plan_id: args.planId },
      });
      if (error) throw new Error(await functionErrorMessage(error));
    },
    onSettled: (_data, _error, args) =>
      queryClient.invalidateQueries({ queryKey: ["plan", args.planId] }),
  });
}

export function useConfirmPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from("meal_plans")
        .update({ status: "confirmed" })
        .eq("id", planId)
        .eq("status", "proposed");
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan"] }),
  });
}

/**
 * Re-suggests one day (dishId omitted) or one dish. The Edge Function saves the new dishes
 * before answering, so the request takes 20-40 seconds.
 */
export function useRegenerate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { planId: string; dayId: string; dishId?: string; hint?: string }) => {
      const { error } = await supabase.functions.invoke("regenerate", {
        body: {
          meal_plan_day_id: args.dayId,
          planned_dish_id: args.dishId,
          hint: args.hint?.trim() || undefined,
        },
      });
      if (error) throw new Error(await functionErrorMessage(error, REGENERATE_FALLBACK));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["plan"] }),
  });
}

const REGENERATE_FALLBACK = "新しい案を作れませんでした。電波の良い場所でもう一度お試しください。";

/** Puts a favourite recipe in place of a dish. */
export function useSwapDish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { dishId: string; recipeId: string }) => {
      const { error } = await supabase.rpc("swap_planned_dish", {
        p_dish_id: args.dishId,
        p_recipe_id: args.recipeId,
      });
      if (error) throw error;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["plan"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}

/** The Edge Function answers errors as { error: { code, message } }; show its message. */
async function functionErrorMessage(
  error: unknown,
  fallback = "献立の作成を始められませんでした。電波の良い場所でもう一度お試しください。",
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await (error.context as Response).json().catch(() => null);
    if (body?.error?.message) return body.error.message as string;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Leftovers
// ---------------------------------------------------------------------------

export interface Leftover {
  id: string;
  raw_name: string;
  amount: number | null;
  unit: string;
}

/** Leftovers still in the fridge, plus those already used by this plan (for regeneration). */
export function useLeftovers(planId: string | undefined) {
  return useQuery({
    queryKey: ["leftovers", planId],
    queryFn: async () => {
      let query = supabase
        .from("leftovers")
        .select("id, raw_name, amount, unit")
        .order("created_at");
      query = planId
        ? query.or(`used_in_plan_id.is.null,used_in_plan_id.eq.${planId}`)
        : query.is("used_in_plan_id", null);
      const { data, error } = await query;
      if (error) throw error;
      return data as Leftover[];
    },
  });
}

export function useAddLeftover() {
  const queryClient = useQueryClient();
  const household = useHousehold();
  return useMutation({
    mutationFn: async (item: { name: string; amount: number | null; unit: string }) => {
      if (!household.data) throw new Error("household is not loaded");
      const { error } = await supabase.from("leftovers").insert({
        household_id: household.data,
        raw_name: item.name,
        amount: item.amount,
        unit: item.unit,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leftovers"] }),
  });
}

export function useDeleteLeftover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leftovers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leftovers"] }),
  });
}

// ---------------------------------------------------------------------------
// Recipes (S5)
// ---------------------------------------------------------------------------

export function useRecipe(recipeId: string | undefined) {
  return useQuery({
    queryKey: ["recipe", recipeId],
    enabled: Boolean(recipeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, title, course, cook_minutes, servings, steps, is_favorite, rating, note, recipe_ingredients ( id, raw_name, amount, unit, is_pantry, position )",
        )
        .eq("id", recipeId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        course: data.course as Course,
        steps: Array.isArray(data.steps) ? (data.steps as string[]) : [],
        recipe_ingredients: [...data.recipe_ingredients].sort((a, b) => a.position - b.position),
      };
    },
  });
}

export function useUpdateRecipe(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { is_favorite?: boolean; rating?: number | null; note?: string }) => {
      const { error } = await supabase.from("recipes").update(patch).eq("id", recipeId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] });
      void queryClient.invalidateQueries({ queryKey: ["plan"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}
