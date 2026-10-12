// POST /functions/v1/regenerate
//   { "meal_plan_day_id": "<uuid>", "hint": "魚以外で" }                         -> the whole day
//   { "meal_plan_day_id": "<uuid>", "planned_dish_id": "<uuid>", "hint": "..." } -> one dish
//
// Re-suggests part of a proposed or confirmed plan and saves it before responding (about
// 20-40 seconds, well inside the 150-second limit), so the app simply waits on the request.
// The rest of the plan is passed to the model so cross-day rules still hold.
// See docs/02_design.md "4.2 Edge Functions".

import { claudeCaller, planModel } from "../_shared/anthropic.ts";
import { corsHeaders, errorResponse, json, userClient } from "../_shared/http.ts";
import { buildPlanInput } from "../_shared/plan/context.ts";
import { PROMPT_VERSION } from "../_shared/plan/prompt.ts";
import { regenerate } from "../_shared/plan/regenerate.ts";
import { loadCurrentDays, loadPlanContext } from "../_shared/planContext.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_HINT_LENGTH = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "POST で呼び出してください");

  const db = userClient(req);
  if (!db) return errorResponse(401, "UNAUTHORIZED", "ログインが必要です");

  const body = await req.json().catch(() => null);
  const dayId = typeof body?.meal_plan_day_id === "string" ? body.meal_plan_day_id : "";
  const dishId = typeof body?.planned_dish_id === "string" ? body.planned_dish_id : null;
  const hint = typeof body?.hint === "string" ? body.hint.trim().slice(0, MAX_HINT_LENGTH) : "";
  if (!UUID.test(dayId) || (dishId !== null && !UUID.test(dishId))) {
    return errorResponse(400, "BAD_REQUEST", "meal_plan_day_id / planned_dish_id が不正です");
  }

  const day = await db
    .from("meal_plan_days")
    .select("id, meal_plan_id, date, mode")
    .eq("id", dayId)
    .maybeSingle<{ id: string; meal_plan_id: string; date: string; mode: string }>();
  if (day.error) return errorResponse(500, "DB_ERROR", "献立を読み込めませんでした");
  if (!day.data) return errorResponse(404, "NOT_FOUND", "献立が見つかりません");
  if (day.data.mode === "none") return errorResponse(422, "NO_DINNER", "献立なしの日です");
  const planId = day.data.meal_plan_id;

  const [loaded, current] = await Promise.all([
    loadPlanContext(db, planId, { leftovers: "unused" }),
    loadCurrentDays(db, planId),
  ]);
  if ("error" in loaded) return loaded.error;
  if (!current) return errorResponse(500, "DB_ERROR", "献立を読み込めませんでした");
  if (!["proposed", "confirmed"].includes(loaded.plan.status)) {
    return errorResponse(409, "NOT_CHANGEABLE", "この献立は今は作り直せません(作成中か、まだ提案されていません)");
  }

  const target = current.find((d) => d.id === dayId)!;
  let dishIndex: number | undefined;
  if (dishId !== null) {
    dishIndex = target.dishes.findIndex((d) => d.id === dishId);
    if (dishIndex < 0) return errorResponse(404, "NOT_FOUND", "料理が見つかりません");
  }

  const input = buildPlanInput(loaded.rows);
  const model = planModel();
  const result = await regenerate(
    { input, current, date: target.date, dishIndex, hint: hint || undefined },
    claudeCaller(model),
  ).catch((error) => {
    console.error(JSON.stringify({ event: "regenerate_error", planId, error: String(error) }));
    return null;
  });
  if (!result) return errorResponse(502, "LLM_ERROR", "新しい案を作れませんでした。もう一度お試しください。");

  const tokens = result.attempts.reduce(
    (sum, a) => ({ input: sum.input + a.reply.inputTokens, output: sum.output + a.reply.outputTokens }),
    { input: 0, output: 0 },
  );
  console.log(
    JSON.stringify({
      event: "plan_regenerated",
      planId,
      target: dishId ? "dish" : "day",
      model,
      promptVersion: PROMPT_VERSION,
      ok: result.dishes !== null,
      totalMs: result.totalMs,
      retries: result.retries,
      tokens,
    }),
  );
  if (!result.dishes) {
    return errorResponse(422, "REGENERATE_FAILED", result.failure ?? "新しい案を作れませんでした");
  }

  const { error } = await db.rpc("replace_planned_dishes", {
    p_day_id: dayId,
    p_dish_id: dishId,
    p_dishes: result.dishes,
    p_warnings: result.warnings,
    p_servings: input.servings,
  });
  if (error) {
    console.error(JSON.stringify({ event: "replace_planned_dishes_error", planId, error: error.message }));
    return errorResponse(500, "DB_ERROR", "新しい案を保存できませんでした");
  }

  return json({
    meal_plan_id: planId,
    status: loaded.plan.status,
    dishes: result.dishes.map((d) => d.title),
  });
});
