import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import type { CallModel } from "./plan/generate.ts";

/** Default model for meal plans; override with the PLAN_MODEL secret (docs/04_model_evaluation.md). */
export const DEFAULT_PLAN_MODEL = "claude-sonnet-5-5";

export function planModel(): string {
  return Deno.env.get("PLAN_MODEL") || DEFAULT_PLAN_MODEL;
}

/** CallModel backed by the Claude API with structured outputs. */
export function claudeCaller(model: string): CallModel {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });

  return async ({ system, messages, schema }) => {
    const res = await client.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages,
      output_config: { format: { type: "json_schema", schema } },
    });
    return {
      text: res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""),
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      stopReason: res.stop_reason,
    };
  };
}
