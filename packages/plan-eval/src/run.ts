/**
 * Compares models on the meal-plan prompt.
 *
 *   pnpm eval:plan                         # all models x all scenarios, once each
 *   pnpm eval:plan --models sonnet,haiku --repeat 2
 *   pnpm eval:plan --dry-run               # print the prompt, no API calls
 *
 * Needs ANTHROPIC_API_KEY (environment or packages/plan-eval/.env).
 * Writes results/<timestamp>/report.md and the raw JSON of every run.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import {
  generatePlanWithRetries,
  type CallModel,
} from "../../../supabase/functions/_shared/plan/generate.ts";
import {
  buildPlanPrompt,
  PROMPT_VERSION,
} from "../../../supabase/functions/_shared/plan/prompt.ts";
import { PLAN_OUTPUT_SCHEMA } from "../../../supabase/functions/_shared/plan/schema.ts";
import { MODELS, type ModelCandidate } from "./models.ts";
import { renderReport, type RunRecord } from "./report.ts";
import { SCENARIOS } from "./scenarios.ts";

const { values } = parseArgs({
  options: {
    models: { type: "string", default: MODELS.map((m) => m.key).join(",") },
    scenarios: { type: "string", default: SCENARIOS.map((s) => s.id).join(",") },
    repeat: { type: "string", default: "1" },
    "dry-run": { type: "boolean", default: false },
  },
});

const models = pick(MODELS, values.models!.split(","), (m) => m.key);
const scenarios = pick(SCENARIOS, values.scenarios!.split(","), (s) => s.id);
const repeat = Math.max(1, Number(values.repeat));

if (values["dry-run"]) {
  const { system, user } = buildPlanPrompt(scenarios[0]!.input);
  console.log(`--- system (${PROMPT_VERSION}) ---\n${system}\n\n--- user ---\n${user}`);
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
  return async (system, messages) => {
    const res = await client.messages.create({
      model: model.id,
      max_tokens: 16000,
      system,
      messages,
      output_config: { format: { type: "json_schema", schema: PLAN_OUTPUT_SCHEMA } },
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return {
      text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
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
    for (let i = 1; i <= repeat; i++) {
      process.stdout.write(`${scenario.id} / ${model.label} #${i} ... `);
      try {
        const result = await generatePlanWithRetries(scenario.input, callerFor(model));
        records.push({ scenario, model, repeat: i, result });
        writeFileSync(
          new URL(`${scenario.id}__${model.key}__${i}.json`, outDir),
          JSON.stringify({ scenario: scenario.id, model: model.id, result }, null, 2),
        );
        const status = result.plan ? "ok" : "failed";
        console.log(`${status} (${result.attempts.length} attempt(s))`);
      } catch (error) {
        console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

const report = renderReport(records, {
  promptVersion: PROMPT_VERSION,
  startedAt: startedAt.toISOString(),
});
const reportPath = new URL("report.md", outDir);
writeFileSync(reportPath, report);
console.log(`\nReport: ${join(outDir.pathname, "report.md")}`);

function pick<T>(items: T[], keys: string[], keyOf: (item: T) => string): T[] {
  const picked = keys.map((k) => {
    const found = items.find((item) => keyOf(item) === k.trim());
    if (!found) throw new Error(`Unknown key "${k}". Available: ${items.map(keyOf).join(", ")}`);
    return found;
  });
  return picked;
}
