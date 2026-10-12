/**
 * Compares models (and generation strategies) on the meal-plan prompts.
 *
 *   pnpm eval:plan                                   # all models, two-stage, all scenarios
 *   pnpm eval:plan --models sonnet --strategy both   # one-shot vs two-stage on Sonnet
 *   pnpm eval:plan --repeat 2
 *   pnpm eval:plan --effort-outline high --effort-detail low   # thinking effort per stage
 *   pnpm eval:plan --dry-run                         # print the prompts, no API calls
 *
 * Needs ANTHROPIC_API_KEY (environment or packages/plan-eval/.env).
 * Writes results/<timestamp>/report.md and the raw JSON of every run.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_EFFORT,
  generatePlan,
  type CallModel,
  type Effort,
  type Strategy,
} from "../../../supabase/functions/_shared/plan/generate.ts";
import {
  buildOutlinePrompt,
  buildPlanPrompt,
  PROMPT_VERSION,
} from "../../../supabase/functions/_shared/plan/prompt.ts";
import { MODELS, type ModelCandidate } from "./models.ts";
import { renderReport, type RunRecord } from "./report.ts";
import { SCENARIOS } from "./scenarios.ts";

const { values } = parseArgs({
  options: {
    models: { type: "string", default: MODELS.map((m) => m.key).join(",") },
    scenarios: { type: "string", default: SCENARIOS.map((s) => s.id).join(",") },
    strategy: { type: "string", default: "two-stage" },
    repeat: { type: "string", default: "1" },
    "effort-plan": { type: "string", default: DEFAULT_EFFORT.plan },
    "effort-outline": { type: "string", default: DEFAULT_EFFORT.outline },
    "effort-detail": { type: "string", default: DEFAULT_EFFORT.detail },
    "dry-run": { type: "boolean", default: false },
  },
});

const models = pick(MODELS, values.models!.split(","), (m) => m.key);
const scenarios = pick(SCENARIOS, values.scenarios!.split(","), (s) => s.id);
const strategies = parseStrategies(values.strategy!);
const repeat = Math.max(1, Number(values.repeat));
const effort = {
  plan: parseEffort(values["effort-plan"]!),
  outline: parseEffort(values["effort-outline"]!),
  detail: parseEffort(values["effort-detail"]!),
};

if (values["dry-run"]) {
  const input = scenarios[0]!.input;
  for (const strategy of strategies) {
    const { system, user } =
      strategy === "two-stage" ? buildOutlinePrompt(input) : buildPlanPrompt(input);
    const label = strategy === "two-stage" ? "two-stage: outline" : "one-shot";
    console.log(
      `=== ${label} (${PROMPT_VERSION}) ===\n--- system ---\n${system}\n\n--- user ---\n${user}\n`,
    );
  }
  process.exit(0);
}

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Copy packages/plan-eval/.env.example to .env.");
  process.exit(1);
}
const client = new Anthropic();

function callerFor(model: ModelCandidate): CallModel {
  return async ({ system, messages, schema, effort }) => {
    const res = await client.messages.create({
      model: model.id,
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort, format: { type: "json_schema", schema } },
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return {
      text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      thinkingTokens: res.usage.output_tokens_details?.thinking_tokens,
      stopReason: res.stop_reason,
    };
  };
}

const startedAt = new Date();
const outDir = new URL(
  `../results/${startedAt.toISOString().replace(/[:.]/g, "-")}/`,
  import.meta.url,
);
mkdirSync(outDir, { recursive: true });

const records: RunRecord[] = [];
for (const scenario of scenarios) {
  for (const model of models) {
    for (const strategy of strategies) {
      for (let i = 1; i <= repeat; i++) {
        process.stdout.write(`${scenario.id} / ${model.label} / ${strategy} #${i} ... `);
        try {
          const result = await generatePlan(strategy, scenario.input, callerFor(model), {
            effort,
          });
          const variant =
            strategy === "two-stage"
              ? `two-stage (${effort.outline}/${effort.detail})`
              : `one-shot (${effort.plan})`;
          records.push({ scenario, model, repeat: i, variant, result });
          writeFileSync(
            new URL(`${scenario.id}__${model.key}__${strategy}__${i}.json`, outDir),
            JSON.stringify({ scenario: scenario.id, model: model.id, result }, null, 2),
          );
          const status = result.plan ? "ok" : `failed: ${result.failure}`;
          console.log(
            `${status} (${(result.totalMs / 1000).toFixed(1)}s, retries ${result.retries})`,
          );
        } catch (error) {
          console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
}

const report = renderReport(records, {
  promptVersion: PROMPT_VERSION,
  startedAt: startedAt.toISOString(),
});
writeFileSync(new URL("report.md", outDir), report);
console.log(`\nReport: ${join(outDir.pathname, "report.md")}`);

function parseEffort(value: string): Effort {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`Unknown effort "${value}". Use low, medium or high.`);
}

function parseStrategies(value: string): Strategy[] {
  if (value === "both") return ["one-shot", "two-stage"];
  if (value === "one-shot" || value === "two-stage") return [value];
  throw new Error(`Unknown strategy "${value}". Use one-shot, two-stage or both.`);
}

function pick<T>(items: T[], keys: string[], keyOf: (item: T) => string): T[] {
  return keys.map((k) => {
    const found = items.find((item) => keyOf(item) === k.trim());
    if (!found) throw new Error(`Unknown key "${k}". Available: ${items.map(keyOf).join(", ")}`);
    return found;
  });
}
