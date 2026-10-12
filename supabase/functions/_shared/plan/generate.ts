import { buildPlanPrompt, buildRetryMessage } from "./prompt.ts";
import type { GeneratedPlan, PlanInput } from "./types.ts";
import { validatePlan, type ValidationResult } from "./validate.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ModelReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** e.g. "end_turn", "max_tokens", "refusal" */
  stopReason: string | null;
}

/** Calls the model with the plan schema as structured output. Injected so it can be mocked. */
export type CallModel = (system: string, messages: ChatMessage[]) => Promise<ModelReply>;

export interface Attempt {
  reply: ModelReply;
  elapsedMs: number;
  plan: GeneratedPlan | null;
  /** Set when the reply could not be used (truncated, refused, not JSON). */
  error: string | null;
  validation: ValidationResult | null;
}

export interface GenerationResult {
  attempts: Attempt[];
  /** The first plan without violations, or null if every attempt failed. */
  plan: GeneratedPlan | null;
  validation: ValidationResult | null;
}

/**
 * Generates a plan and regenerates (up to `maxRetries` times) while hard rules are broken,
 * telling the model what was wrong. Mirrors docs/02_design.md "5. 献立生成の処理".
 */
export async function generatePlanWithRetries(
  input: PlanInput,
  callModel: CallModel,
  options: { maxRetries?: number; now?: () => number } = {},
): Promise<GenerationResult> {
  const maxRetries = options.maxRetries ?? 2;
  const now = options.now ?? Date.now;
  const { system, user } = buildPlanPrompt(input);
  const messages: ChatMessage[] = [{ role: "user", content: user }];
  const attempts: Attempt[] = [];

  for (let i = 0; i <= maxRetries; i++) {
    const started = now();
    const reply = await callModel(system, messages);
    const elapsedMs = now() - started;

    const parsed = parseReply(reply);
    if (parsed.error !== null) {
      attempts.push({ reply, elapsedMs, plan: null, error: parsed.error, validation: null });
      // A truncated or refused reply is not something a corrective message can fix reliably.
      break;
    }

    const validation = validatePlan(input, parsed.plan);
    attempts.push({ reply, elapsedMs, plan: parsed.plan, error: null, validation });
    if (validation.violations.length === 0) {
      return { attempts, plan: parsed.plan, validation };
    }
    messages.push({ role: "assistant", content: reply.text });
    messages.push({ role: "user", content: buildRetryMessage(validation.violations) });
  }

  const last = attempts.at(-1);
  return { attempts, plan: null, validation: last?.validation ?? null };
}

function parseReply(reply: ModelReply): { plan: GeneratedPlan; error: null } | { plan: null; error: string } {
  if (reply.stopReason === "max_tokens") return { plan: null, error: "出力が途中で切れました(max_tokens)" };
  if (reply.stopReason === "refusal") return { plan: null, error: "モデルが応答を拒否しました" };
  try {
    const plan = JSON.parse(reply.text) as GeneratedPlan;
    if (!plan || !Array.isArray(plan.days)) return { plan: null, error: "days がありません" };
    return { plan, error: null };
  } catch {
    return { plan: null, error: "JSON として読めませんでした" };
  }
}
