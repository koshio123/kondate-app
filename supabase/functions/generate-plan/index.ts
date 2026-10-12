// POST /functions/v1/generate-plan  { "meal_plan_id": "<uuid>" }
//
// Generates (or regenerates) the dinners of a meal plan. Responds 202 right away and runs the
// generation as a background task; the client watches meal_plans.status
// (generating -> proposed, or back to draft with generation_error).
// See docs/02_design.md "5. 献立生成の処理" and docs/04_model_evaluation.md.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { claudeCaller, planModel } from "../_shared/anthropic.ts";
import { corsHeaders, errorResponse, json, userClient } from "../_shared/http.ts";
import { buildPlanInput } from "../_shared/plan/context.ts";
import { loadPlanContext } from "../_shared/planContext.ts";
import { generateTwoStage } from "../_shared/plan/generate.ts";
import { PROMPT_VERSION } from "../_shared/plan/prompt.ts";
import type { PlanInput } from "../_shared/plan/types.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "POST で呼び出してください");

  const db = userClient(req);
  if (!db) return errorResponse(401, "UNAUTHORIZED", "ログインが必要です");

  const body = await req.json().catch(() => null);
  const planId = typeof body?.meal_plan_id === "string" ? body.meal_plan_id : "";
  if (!UUID.test(planId)) return errorResponse(400, "BAD_REQUEST", "meal_plan_id が不正です");

  // RLS limits every read to the caller's household, so "not found" also covers other households.
  const loaded = await loadPlanContext(db, planId);
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
