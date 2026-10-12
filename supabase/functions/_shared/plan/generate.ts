import {
  buildDayDetailPrompt,
  buildOutlinePrompt,
  buildPlanPrompt,
  buildRetryMessage,
} from "./prompt.ts";
import { DAY_DETAIL_SCHEMA, OUTLINE_SCHEMA, PLAN_OUTPUT_SCHEMA } from "./schema.ts";
import type { DayDetail, GeneratedPlan, PlanInput, PlanOutline } from "./types.ts";
import {
  type Issue,
  mergeOutline,
  validateDayDetail,
  validateOutline,
  validatePlan,
  type ValidationResult,
} from "./validate.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type Effort = "low" | "medium" | "high";

export interface ModelRequest {
  system: string;
  messages: ChatMessage[];
  /** JSON schema for structured output. */
  schema: Record<string, unknown>;
  /** How much the model may think (output_config.effort). */
  effort: Effort;
}

export interface ModelReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** Part of outputTokens spent on thinking, when the API reports it. */
  thinkingTokens?: number;
  /** e.g. "end_turn", "max_tokens", "refusal" */
  stopReason: string | null;
}

/** Calls the model with a structured-output schema. Injected so it can be mocked. */
export type CallModel = (request: ModelRequest) => Promise<ModelReply>;

export type Strategy = "one-shot" | "two-stage";

export interface Attempt {
  /** "plan" (one-shot), "outline", or "detail:<date>" */
  stage: string;
  reply: ModelReply;
  elapsedMs: number;
  /** Set when the reply could not be used (truncated, refused, not JSON). */
  error: string | null;
  violations: Issue[];
}

export interface GenerationResult {
  strategy: Strategy;
  attempts: Attempt[];
  /** Attempts beyond the minimum needed (one per stage call). */
  retries: number;
  /** Wall-clock time of the whole generation. */
  totalMs: number;
  /** The final plan without violations, or null if generation failed. */
  plan: GeneratedPlan | null;
  /** Last plan produced even if it still had violations (for reports and debugging). */
  lastPlan: GeneratedPlan | null;
  validation: ValidationResult | null;
  /** Human-readable reason when plan is null. */
  failure: string | null;
}

/**
 * Default effort per stage. Deciding the menu benefits from some thinking; writing out
 * ingredients and steps for fixed dishes is mechanical. Measured in docs/04_model_evaluation.md.
 */
export const DEFAULT_EFFORT = { plan: "medium", outline: "medium", detail: "low" } as const satisfies Record<
  string,
  Effort
>;

export interface GenerateOptions {
  effort?: Partial<Record<keyof typeof DEFAULT_EFFORT, Effort>>;
  /** Retries after the first attempt, per stage call. */
  maxRetries?: number;
  now?: () => number;
}

export function generatePlan(
  strategy: Strategy,
  input: PlanInput,
  callModel: CallModel,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  return strategy === "two-stage"
    ? generateTwoStage(input, callModel, options)
    : generateOneShot(input, callModel, options);
}

// ---------------------------------------------------------------------------
// One-shot: all days with ingredients and steps in a single structured reply
// ---------------------------------------------------------------------------

export async function generateOneShot(
  input: PlanInput,
  callModel: CallModel,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const now = options.now ?? Date.now;
  const started = now();
  const { system, user } = buildPlanPrompt(input);
  let validation: ValidationResult | null = null;

  const loop = await retryLoop<GeneratedPlan>({
    stage: "plan",
    effort: options.effort?.plan ?? DEFAULT_EFFORT.plan,
    system,
    user,
    schema: PLAN_OUTPUT_SCHEMA,
    callModel,
    maxRetries: options.maxRetries ?? 2,
    now,
    check: (plan) => {
      if (!Array.isArray(plan.days)) return [MALFORMED];
      validation = validatePlan(input, plan);
      return validation.violations;
    },
  });

  return {
    strategy: "one-shot",
    attempts: loop.attempts,
    retries: loop.attempts.length - 1,
    totalMs: now() - started,
    plan: loop.value,
    lastPlan: loop.last,
    validation,
    failure: loop.value ? null : loop.failure,
  };
}

// ---------------------------------------------------------------------------
// Two-stage: outline for all days, then details per day in parallel
// ---------------------------------------------------------------------------

export async function generateTwoStage(
  input: PlanInput,
  callModel: CallModel,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const now = options.now ?? Date.now;
  const maxRetries = options.maxRetries ?? 2;
  const started = now();
  const attempts: Attempt[] = [];

  // Stage 1
  const outlinePrompt = buildOutlinePrompt(input);
  const outlineLoop = await retryLoop<PlanOutline>({
    stage: "outline",
    effort: options.effort?.outline ?? DEFAULT_EFFORT.outline,
    system: outlinePrompt.system,
    user: outlinePrompt.user,
    schema: OUTLINE_SCHEMA,
    callModel,
    maxRetries,
    now,
    check: (outline) =>
      Array.isArray(outline.days) ? validateOutline(input, outline).violations : [MALFORMED],
  });
  attempts.push(...outlineLoop.attempts);
  const outline = outlineLoop.value;
  if (!outline) {
    return {
      strategy: "two-stage",
      attempts,
      retries: attempts.length - 1,
      totalMs: now() - started,
      plan: null,
      lastPlan: null,
      validation: null,
      failure: `献立の骨組みを作れませんでした: ${outlineLoop.failure}`,
    };
  }

  // Stage 2 (parallel)
  const detailLoops = await Promise.all(
    outline.days.map(async (day) => {
      const prompt = buildDayDetailPrompt(input, day);
      const loop = await retryLoop<DayDetail>({
        stage: `detail:${day.date}`,
        effort: options.effort?.detail ?? DEFAULT_EFFORT.detail,
        system: prompt.system,
        user: prompt.user,
        schema: DAY_DETAIL_SCHEMA,
        callModel,
        maxRetries: Math.min(1, maxRetries),
        now,
        check: (detail) =>
          Array.isArray(detail.dishes) ? validateDayDetail(input, day, detail) : [MALFORMED],
      });
      return { date: day.date, loop };
    }),
  );

  const details = new Map<string, DayDetail>();
  const failures: string[] = [];
  for (const { date, loop } of detailLoops) {
    attempts.push(...loop.attempts);
    if (loop.value) details.set(date, loop.value);
    else failures.push(`${date}: ${loop.failure}`);
  }

  const merged = mergeOutline(outline, details);
  const validation = validatePlan(input, merged);
  const ok = failures.length === 0 && validation.violations.length === 0;
  return {
    strategy: "two-stage",
    attempts,
    retries: attempts.length - (1 + outline.days.length),
    totalMs: now() - started,
    plan: ok ? merged : null,
    lastPlan: merged,
    validation,
    failure: ok
      ? null
      : failures.length > 0
        ? `材料と手順を作れなかった日があります(${failures.join(" / ")})`
        : validation.violations.map((v) => v.message).join(" / "),
  };
}

// ---------------------------------------------------------------------------
// Shared retry loop

/** Structured outputs guarantee the shape, but a malformed reply must never crash validation. */
const MALFORMED: Issue = { code: "DETAIL_MISMATCH", message: "出力の形がスキーマと一致しません" };

// ---------------------------------------------------------------------------

interface RetryLoopArgs<T> {
  stage: string;
  effort: Effort;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  callModel: CallModel;
  maxRetries: number;
  now: () => number;
  /** Returns hard-rule violations; an empty list accepts the value. */
  check: (value: T) => Issue[];
}

async function retryLoop<T>(args: RetryLoopArgs<T>): Promise<{
  value: T | null;
  last: T | null;
  attempts: Attempt[];
  failure: string;
}> {
  const messages: ChatMessage[] = [{ role: "user", content: args.user }];
  const attempts: Attempt[] = [];
  let last: T | null = null;
  let failure = "";

  for (let i = 0; i <= args.maxRetries; i++) {
    const started = args.now();
    const reply = await args.callModel({
      system: args.system,
      messages,
      schema: args.schema,
      effort: args.effort,
    });
    const elapsedMs = args.now() - started;

    const parsed = parseReply<T>(reply);
    if (parsed.error !== null) {
      attempts.push({ stage: args.stage, reply, elapsedMs, error: parsed.error, violations: [] });
      failure = parsed.error;
      // A truncated or refused reply is not something a corrective message can fix reliably.
      break;
    }

    last = parsed.value;
    const violations = args.check(parsed.value);
    attempts.push({ stage: args.stage, reply, elapsedMs, error: null, violations });
    if (violations.length === 0) return { value: parsed.value, last, attempts, failure: "" };

    failure = violations.map((v) => v.message).join(" / ");
    messages.push({ role: "assistant", content: reply.text });
    messages.push({ role: "user", content: buildRetryMessage(violations) });
  }
  return { value: null, last, attempts, failure };
}

function parseReply<T>(reply: ModelReply): { value: T; error: null } | { value: null; error: string } {
  if (reply.stopReason === "max_tokens") return { value: null, error: "出力が途中で切れました(max_tokens)" };
  if (reply.stopReason === "refusal") return { value: null, error: "モデルが応答を拒否しました" };
  try {
    const value = JSON.parse(reply.text) as T;
    if (value === null || typeof value !== "object") return { value: null, error: "JSON の形が不正です" };
    return { value, error: null };
  } catch {
    return { value: null, error: "JSON として読めませんでした" };
  }
}
