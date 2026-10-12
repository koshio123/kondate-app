import type { GenerationResult } from "../../../supabase/functions/_shared/plan/generate.ts";
import type { Course } from "../../../supabase/functions/_shared/plan/types.ts";
import { costUsd, JPY_PER_USD, type ModelCandidate } from "./models.ts";
import type { Scenario } from "./scenarios.ts";

export interface RunRecord {
  scenario: Scenario;
  model: ModelCandidate;
  repeat: number;
  result: GenerationResult;
}

const COURSE_LABEL: Record<Course, string> = {
  staple: "主食",
  main: "主菜",
  side: "副菜",
  soup: "汁物",
  one_dish: "一品",
};

/** Plans a month: about 6 plans (one every 5 days). */
const PLANS_PER_MONTH = 6;

export function summarize(records: RunRecord[]) {
  const byModel = new Map<string, RunRecord[]>();
  for (const r of records) byModel.set(r.model.key, [...(byModel.get(r.model.key) ?? []), r]);

  return [...byModel.values()].map((runs) => {
    const model = runs[0]!.model;
    const attempts = runs.flatMap((r) => r.result.attempts);
    const inputTokens = attempts.reduce((n, a) => n + a.reply.inputTokens, 0);
    const outputTokens = attempts.reduce((n, a) => n + a.reply.outputTokens, 0);
    const firstTryOk = runs.filter(
      (r) => r.result.attempts[0]?.validation?.violations.length === 0,
    ).length;
    const finalOk = runs.filter((r) => r.result.plan !== null).length;
    const warnings = runs.reduce((n, r) => n + (r.result.validation?.warnings.length ?? 0), 0);
    const leftoverRates = runs.map((r) => r.result.validation?.metrics.leftoverUsageRate ?? 0);
    const firstAttemptMs = runs.map((r) => r.result.attempts[0]?.elapsedMs ?? 0);
    const costPerRun = costUsd(model, inputTokens, outputTokens) / runs.length;
    return {
      model,
      runs: runs.length,
      firstTryOk,
      finalOk,
      avgAttempts: attempts.length / runs.length,
      avgWarnings: warnings / runs.length,
      avgLeftoverUsage: average(leftoverRates),
      avgFirstAttemptSec: average(firstAttemptMs) / 1000,
      avgInputTokens: inputTokens / runs.length,
      avgOutputTokens: outputTokens / runs.length,
      costPerRunUsd: costPerRun,
      monthlyJpy: costPerRun * PLANS_PER_MONTH * JPY_PER_USD,
    };
  });
}

/** Markdown report: a comparison table, then every menu for a taste check by a person. */
export function renderReport(
  records: RunRecord[],
  meta: { promptVersion: string; startedAt: string },
): string {
  const lines: string[] = [];
  lines.push(`# 献立生成モデル比較`, "");
  lines.push(`- 実行日時: ${meta.startedAt}`, `- プロンプト版: ${meta.promptVersion}`, "");

  lines.push("## 集計", "");
  lines.push(
    "| モデル | 実行数 | 1回目で合格 | 最終合格 | 平均試行 | 平均警告 | 余り物使用率 | 1回目の応答(秒) | 入力tok | 出力tok | 1回あたり | 月額目安(6回) |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  );
  for (const s of summarize(records)) {
    lines.push(
      `| ${s.model.label} | ${s.runs} | ${s.firstTryOk}/${s.runs} | ${s.finalOk}/${s.runs} | ${s.avgAttempts.toFixed(1)} | ${s.avgWarnings.toFixed(1)} | ${pct(s.avgLeftoverUsage)} | ${s.avgFirstAttemptSec.toFixed(1)} | ${Math.round(s.avgInputTokens)} | ${Math.round(s.avgOutputTokens)} | $${s.costPerRunUsd.toFixed(4)} | 約${Math.round(s.monthlyJpy)}円 |`,
    );
  }
  lines.push("", `為替は 1 USD = ${JPY_PER_USD} 円で概算。`, "");

  lines.push("## 献立(味・バランスの目視確認用)", "");
  for (const r of records) {
    lines.push(
      `### ${r.scenario.title} / ${r.model.label}${r.repeat > 1 ? ` (#${r.repeat})` : ""}`,
      "",
    );
    const last = r.result.attempts.at(-1);
    const plan = r.result.plan ?? last?.plan ?? null;
    if (!plan) {
      lines.push(`生成失敗: ${last?.error ?? "不明"}`, "");
      continue;
    }
    if (!r.result.plan) lines.push("**ルール違反が解消されなかった最後の案**", "");
    const modes = new Map(r.scenario.input.days.map((d) => [d.date, d.mode]));
    lines.push("| 日付 | モード | 料理 | 合計(分) |", "|---|---|---|---|");
    for (const day of plan.days) {
      const dishes = day.dishes
        .map(
          (d) =>
            `${COURSE_LABEL[d.course]}: ${d.title}(${d.cook_minutes}分)${d.uses_leftovers.length ? ` [余: ${d.uses_leftovers.join("・")}]` : ""}`,
        )
        .join("<br>");
      const total = day.dishes.reduce((n, d) => n + d.cook_minutes, 0);
      lines.push(`| ${day.date} | ${modes.get(day.date) ?? "?"} | ${dishes} | ${total} |`);
    }
    const issues = [
      ...r.result.attempts.flatMap((a, i) =>
        (a.validation?.violations ?? []).map((v) => `- 違反(${i + 1}回目): ${v.message}`),
      ),
      ...(r.result.validation?.warnings ?? []).map((w) => `- 警告: ${w.message}`),
    ];
    lines.push("", ...(issues.length ? issues : ["- 違反・警告なし"]), "");
  }
  return lines.join("\n");
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
