import { describe, expect, it } from "vitest";
import {
  generatePlanWithRetries,
  type ModelReply,
} from "../../../supabase/functions/_shared/plan/generate.ts";
import {
  containsAnyTerm,
  normalizeFoodName,
  restrictionTerms,
} from "../../../supabase/functions/_shared/plan/normalize.ts";
import { buildPlanPrompt } from "../../../supabase/functions/_shared/plan/prompt.ts";
import type {
  GeneratedDish,
  GeneratedPlan,
  PlanInput,
} from "../../../supabase/functions/_shared/plan/types.ts";
import { validatePlan } from "../../../supabase/functions/_shared/plan/validate.ts";
import { MODELS } from "./models.ts";
import { renderReport } from "./report.ts";
import { SCENARIOS } from "./scenarios.ts";

const dish = (
  title: string,
  course: GeneratedDish["course"],
  minutes: number,
  ingredients: string[] = [],
  usesLeftovers: string[] = [],
): GeneratedDish => ({
  title,
  course,
  cook_minutes: minutes,
  ingredients: ingredients.map((name) => ({ name, amount: 1, unit: "個", is_pantry: false })),
  steps: ["作る"],
  uses_leftovers: usesLeftovers,
});

const input: PlanInput = {
  days: [
    { date: "2026-10-13", mode: "normal" },
    { date: "2026-10-14", mode: "quick" },
    { date: "2026-10-15", mode: "none" },
    { date: "2026-10-16", mode: "normal" },
  ],
  servings: 2,
  quickMaxMinutes: 15,
  restrictions: [
    { label: "卵", kind: "allergy", aliases: ["たまご"] },
    { label: "レバー", kind: "avoid" },
  ],
  leftovers: [{ name: "キャベツ", amount: 0.5, unit: "玉" }],
  recentTitles: ["肉じゃが"],
};

const normalDay = (
  date: string,
  main = "豚こまとキャベツの味噌炒め",
): GeneratedPlan["days"][number] => ({
  date,
  dishes: [
    dish("ご飯", "staple", 0, ["米"]),
    dish(main, "main", 20, ["豚こま切れ肉", "キャベツ"], ["キャベツ"]),
    dish("小松菜のおひたし", "side", 10, ["小松菜"]),
    dish("豆腐とわかめの味噌汁", "soup", 10, ["絹ごし豆腐", "乾燥わかめ"]),
  ],
});

const goodPlan = (): GeneratedPlan => ({
  days: [
    normalDay("2026-10-13"),
    {
      date: "2026-10-14",
      dishes: [
        dish("鶏そぼろ丼", "one_dish", 12, ["鶏ひき肉"]),
        dish("もやしナムル", "side", 3, ["もやし"]),
      ],
    },
    normalDay("2026-10-16", "鮭の塩焼き"),
  ],
});

describe("normalizeFoodName", () => {
  it("treats katakana, hiragana and full-width spellings alike", () => {
    expect(normalizeFoodName("タマゴ")).toBe(normalizeFoodName("たまご"));
    expect(normalizeFoodName("ｷｬﾍﾞﾂ ")).toBe("きゃべつ");
  });

  it("adds hidden sources for allergens", () => {
    const terms = restrictionTerms({ label: "卵", kind: "allergy" });
    expect(containsAnyTerm("マヨネーズ", terms)).toBe(true);
    expect(containsAnyTerm("鶏もも肉", terms)).toBe(false);
  });

  it("does not add hidden sources for plain dislikes", () => {
    const terms = restrictionTerms({ label: "卵", kind: "never" });
    expect(containsAnyTerm("マヨネーズ", terms)).toBe(false);
  });
});

describe("validatePlan", () => {
  it("accepts a plan that follows every rule", () => {
    const result = validatePlan(input, goodPlan());
    expect(result.violations).toEqual([]);
    expect(result.metrics.leftoverUsageRate).toBe(1);
  });

  it("flags a missing day and a plan for a 'none' day", () => {
    const plan = goodPlan();
    plan.days[2] = { ...plan.days[2]!, date: "2026-10-15" };
    const codes = validatePlan(input, plan).violations.map((v) => v.code);
    expect(codes).toContain("DAY_UNEXPECTED");
    expect(codes).toContain("DAY_MISSING");
  });

  it("flags allergens, including hidden sources, as violations", () => {
    const plan = goodPlan();
    plan.days[0]!.dishes[2] = dish("ポテトサラダ", "side", 15, ["じゃがいも", "マヨネーズ"]);
    const result = validatePlan(input, plan);
    expect(result.violations.map((v) => v.code)).toEqual(["RESTRICTED_INGREDIENT"]);
  });

  it("treats 'avoid' foods as warnings only", () => {
    const plan = goodPlan();
    plan.days[2]!.dishes[1] = dish("レバニラ炒め", "main", 15, ["豚レバー", "にら"]);
    const result = validatePlan(input, plan);
    expect(result.violations).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toContain("AVOID_INGREDIENT");
  });

  it("enforces the quick-day time limit and the normal-day courses", () => {
    const plan = goodPlan();
    plan.days[1]!.dishes[0]!.cook_minutes = 20;
    plan.days[0]!.dishes = plan.days[0]!.dishes.filter((d) => d.course !== "soup");
    const result = validatePlan(input, plan);
    expect(result.violations.map((v) => v.code).sort()).toEqual([
      "COURSE_MISSING",
      "QUICK_TOO_LONG",
    ]);
  });

  it("warns about unused or late leftovers and repeats", () => {
    const plan = goodPlan();
    plan.days[0] = normalDay("2026-10-13", "肉じゃが");
    plan.days[0]!.dishes[1]!.ingredients = [
      { name: "牛肉", amount: 150, unit: "g", is_pantry: false },
    ];
    plan.days[0]!.dishes[1]!.uses_leftovers = [];
    const result = validatePlan(input, plan);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain("LEFTOVER_LATE");
    expect(codes).toContain("REPEATS_RECENT");
  });
});

describe("generatePlanWithRetries", () => {
  const reply = (plan: unknown, stopReason = "end_turn"): ModelReply => ({
    text: JSON.stringify(plan),
    inputTokens: 1000,
    outputTokens: 2000,
    stopReason,
  });

  it("retries with the violations and returns the first valid plan", async () => {
    const bad = goodPlan();
    bad.days.pop();
    const seen: string[] = [];
    const replies = [reply(bad), reply(goodPlan())];
    const result = await generatePlanWithRetries(input, async (_system, messages) => {
      seen.push(messages.at(-1)!.content);
      return replies.shift()!;
    });
    expect(result.plan).not.toBeNull();
    expect(result.attempts).toHaveLength(2);
    expect(seen[1]).toContain("2026-10-16 の献立がありません");
  });

  it("gives up after the retry limit", async () => {
    const bad = goodPlan();
    bad.days.pop();
    const result = await generatePlanWithRetries(input, async () => reply(bad), { maxRetries: 2 });
    expect(result.plan).toBeNull();
    expect(result.attempts).toHaveLength(3);
  });

  it("stops on a truncated reply", async () => {
    const result = await generatePlanWithRetries(input, async () => ({
      ...reply({}),
      stopReason: "max_tokens",
    }));
    expect(result.plan).toBeNull();
    expect(result.attempts[0]!.error).toContain("max_tokens");
  });
});

describe("prompt and report", () => {
  it("passes restrictions without aliases and keeps 'none' days in the input", () => {
    const { user } = buildPlanPrompt(input);
    expect(user).toContain('"mode": "none"');
    expect(user).not.toContain("たまご");
  });

  it("renders a report with the menus", async () => {
    const result = await generatePlanWithRetries(input, async () => ({
      text: JSON.stringify(goodPlan()),
      inputTokens: 1000,
      outputTokens: 2000,
      stopReason: "end_turn",
    }));
    const report = renderReport(
      [{ scenario: { ...SCENARIOS[0]!, input }, model: MODELS[0]!, repeat: 1, result }],
      {
        promptVersion: "test",
        startedAt: "2026-10-12T00:00:00Z",
      },
    );
    expect(report).toContain("| Claude Sonnet 5.5 | 1 | 1/1 | 1/1 |");
    expect(report).toContain("主菜: 豚こまとキャベツの味噌炒め(20分) [余: キャベツ]");
  });
});
