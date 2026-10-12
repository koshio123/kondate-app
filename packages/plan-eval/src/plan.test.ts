import { describe, expect, it } from "vitest";
import {
  generateOneShot,
  generateTwoStage,
  type ModelReply,
  type ModelRequest,
} from "../../../supabase/functions/_shared/plan/generate.ts";
import {
  containsAnyTerm,
  normalizeFoodName,
  restrictionTerms,
} from "../../../supabase/functions/_shared/plan/normalize.ts";
import {
  buildDayDetailPrompt,
  buildOutlinePrompt,
} from "../../../supabase/functions/_shared/plan/prompt.ts";
import {
  DAY_DETAIL_SCHEMA,
  OUTLINE_SCHEMA,
} from "../../../supabase/functions/_shared/plan/schema.ts";
import type {
  DayDetail,
  GeneratedDish,
  GeneratedPlan,
  PlanInput,
  PlanOutline,
} from "../../../supabase/functions/_shared/plan/types.ts";
import {
  mergeOutline,
  validateDayDetail,
  validatePlan,
} from "../../../supabase/functions/_shared/plan/validate.ts";
import { buildPlanInput } from "../../../supabase/functions/_shared/plan/context.ts";
import { MODELS } from "./models.ts";
import { renderReport } from "./report.ts";
import { SCENARIOS } from "./scenarios.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
  mainIngredients = ["豚こま切れ肉", "キャベツ"],
) => ({
  date,
  dishes: [
    dish("ご飯", "staple", 0, ["米"]),
    dish(
      main,
      "main",
      20,
      mainIngredients,
      mainIngredients.includes("キャベツ") ? ["キャベツ"] : [],
    ),
    dish(`${date}の小松菜のおひたし`, "side", 10, ["小松菜"]),
    dish(`${date}の豆腐とわかめの味噌汁`, "soup", 10, ["絹ごし豆腐", "乾燥わかめ"]),
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
    normalDay("2026-10-16", "鶏の照り焼き", ["鶏もも肉"]),
  ],
});

const outlineOf = (plan: GeneratedPlan): PlanOutline => ({
  days: plan.days.map((day) => ({
    date: day.date,
    dishes: day.dishes.map((d) => ({
      title: d.title,
      course: d.course,
      cook_minutes: d.cook_minutes,
      main_ingredients: d.ingredients.map((i) => i.name),
      uses_leftovers: d.uses_leftovers,
    })),
  })),
});

/** Deep copy so a test can tamper with one reply without changing the source plan. */
const detailOf = (plan: GeneratedPlan, date: string): DayDetail =>
  structuredClone({
    dishes: plan.days
      .find((d) => d.date === date)!
      .dishes.map((d) => ({ title: d.title, ingredients: d.ingredients, steps: d.steps })),
  });

const reply = (value: unknown, stopReason = "end_turn"): ModelReply => ({
  text: JSON.stringify(value),
  inputTokens: 1000,
  outputTokens: 2000,
  stopReason,
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("normalizeFoodName", () => {
  it("treats katakana, hiragana and full-width spellings alike", () => {
    expect(normalizeFoodName("タマゴ")).toBe(normalizeFoodName("たまご"));
    expect(normalizeFoodName("ｷｬﾍﾞﾂ ")).toBe("きゃべつ");
  });

  it("ignores 'free of X' notes but keeps other notes", () => {
    const celery = restrictionTerms({ label: "セロリ", kind: "never" });
    expect(containsAnyTerm("固形コンソメ(セロリ不使用のもの)", celery)).toBe(false);
    expect(containsAnyTerm("固形コンソメ(セロリ入り)", celery)).toBe(true);
    const egg = restrictionTerms({ label: "卵", kind: "allergy" });
    expect(containsAnyTerm("ドレッシング（卵入り）", egg)).toBe(true);
  });

  it("adds hidden sources for allergens only", () => {
    expect(containsAnyTerm("マヨネーズ", restrictionTerms({ label: "卵", kind: "allergy" }))).toBe(
      true,
    );
    expect(containsAnyTerm("鶏もも肉", restrictionTerms({ label: "卵", kind: "allergy" }))).toBe(
      false,
    );
    expect(containsAnyTerm("マヨネーズ", restrictionTerms({ label: "卵", kind: "never" }))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Plan validation
// ---------------------------------------------------------------------------

describe("validatePlan", () => {
  it("accepts a plan that follows every rule", () => {
    const result = validatePlan(input, goodPlan());
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
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
    expect(validatePlan(input, plan).violations.map((v) => v.code)).toEqual([
      "RESTRICTED_INGREDIENT",
    ]);
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
    const codes = validatePlan(input, plan)
      .violations.map((v) => v.code)
      .sort();
    expect(codes).toEqual(["COURSE_MISSING", "QUICK_TOO_LONG"]);
  });

  it("warns about late leftovers and repeats of recent dishes", () => {
    const plan = goodPlan();
    plan.days[0] = normalDay("2026-10-13", "肉じゃが", ["牛肉", "じゃがいも"]);
    plan.days[2] = normalDay("2026-10-16", "回鍋肉", ["豚バラ肉", "キャベツ"]);
    const codes = validatePlan(input, plan).warnings.map((w) => w.code);
    expect(codes).toContain("LEFTOVER_LATE");
    expect(codes).toContain("REPEATS_RECENT");
  });

  it("warns about raw fish on day 4 or later, but not canned fish", () => {
    const plan = goodPlan();
    plan.days[2] = normalDay("2026-10-16", "さばの味噌煮", ["さば"]);
    expect(validatePlan(input, plan).warnings.map((w) => w.code)).toContain("PERISHABLE_LATE");

    plan.days[2] = normalDay("2026-10-16", "さば缶の味噌煮", ["さば缶"]);
    expect(validatePlan(input, plan).warnings.map((w) => w.code)).not.toContain("PERISHABLE_LATE");
  });
});

describe("validateDayDetail / mergeOutline", () => {
  it("rejects a detail with a different number of dishes", () => {
    const plan = goodPlan();
    const day = outlineOf(plan).days[0]!;
    const detail = detailOf(plan, "2026-10-13");
    detail.dishes.pop();
    expect(validateDayDetail(input, day, detail).map((i) => i.code)).toEqual(["DETAIL_MISMATCH"]);
  });

  it("catches an allergen that only shows up in the full ingredient list", () => {
    const plan = goodPlan();
    const day = outlineOf(plan).days[0]!;
    const detail = detailOf(plan, "2026-10-13");
    detail.dishes[1]!.ingredients.push({
      name: "マヨネーズ",
      amount: 1,
      unit: "大さじ",
      is_pantry: false,
    });
    expect(validateDayDetail(input, day, detail).map((i) => i.code)).toEqual([
      "RESTRICTED_INGREDIENT",
    ]);
  });

  it("merges outline and details, keeping the outline titles", () => {
    const plan = goodPlan();
    const details = new Map(plan.days.map((d) => [d.date, detailOf(plan, d.date)]));
    details.get("2026-10-13")!.dishes[1]!.title = "別名";
    const merged = mergeOutline(outlineOf(plan), details);
    expect(merged.days[0]!.dishes[1]!.title).toBe("豚こまとキャベツの味噌炒め");
    expect(merged.days[0]!.dishes[1]!.uses_leftovers).toEqual(["キャベツ"]);
  });
});

// ---------------------------------------------------------------------------
// Generation loops
// ---------------------------------------------------------------------------

describe("generateOneShot", () => {
  it("retries with the violations and returns the first valid plan", async () => {
    const bad = goodPlan();
    bad.days.pop();
    const seen: string[] = [];
    const replies = [reply(bad), reply(goodPlan())];
    const result = await generateOneShot(input, async ({ messages }) => {
      seen.push(messages.at(-1)!.content);
      return replies.shift()!;
    });
    expect(result.plan).not.toBeNull();
    expect(result.retries).toBe(1);
    expect(seen[1]).toContain("2026-10-16 の献立がありません");
  });

  it("gives up after the retry limit, keeping the last plan", async () => {
    const bad = goodPlan();
    bad.days.pop();
    const result = await generateOneShot(input, async () => reply(bad), { maxRetries: 2 });
    expect(result.plan).toBeNull();
    expect(result.lastPlan).not.toBeNull();
    expect(result.attempts).toHaveLength(3);
  });

  it("stops on a truncated reply and on a malformed one", async () => {
    const truncated = await generateOneShot(input, async () => reply({}, "max_tokens"));
    expect(truncated.attempts[0]!.error).toContain("max_tokens");
    const malformed = await generateOneShot(input, async () => reply({ nope: 1 }), {
      maxRetries: 0,
    });
    expect(malformed.plan).toBeNull();
  });
});

describe("generateTwoStage", () => {
  /** A fake model that answers outline and detail requests from a known-good plan. */
  function fakeModel(
    plan: GeneratedPlan,
    overrides: { detailFor?: (date: string, call: number) => DayDetail } = {},
  ) {
    const calls: ModelRequest[] = [];
    const detailCalls = new Map<string, number>();
    const call = async (request: ModelRequest): Promise<ModelReply> => {
      calls.push(request);
      if (request.schema === OUTLINE_SCHEMA) return reply(outlineOf(plan));
      expect(request.schema).toBe(DAY_DETAIL_SCHEMA);
      const date = JSON.parse(request.messages[0]!.content.split("\n\n")[1]!).date as string;
      const n = (detailCalls.get(date) ?? 0) + 1;
      detailCalls.set(date, n);
      return reply(overrides.detailFor?.(date, n) ?? detailOf(plan, date));
    };
    return { call, calls };
  }

  it("builds the plan from an outline and one detail call per day", async () => {
    const plan = goodPlan();
    const model = fakeModel(plan);
    const result = await generateTwoStage(input, model.call);
    expect(result.failure).toBeNull();
    expect(result.plan).toEqual(plan);
    expect(model.calls).toHaveLength(1 + plan.days.length);
    expect(result.retries).toBe(0);
    expect(model.calls.map((c) => c.effort)).toEqual(["medium", "low", "low", "low"]);
  });

  it("retries only the day whose details break a restriction", async () => {
    const plan = goodPlan();
    const model = fakeModel(plan, {
      detailFor: (date, n) => {
        const detail = detailOf(plan, date);
        if (date === "2026-10-13" && n === 1) {
          detail.dishes[2]!.ingredients.push({
            name: "卵",
            amount: 1,
            unit: "個",
            is_pantry: false,
          });
        }
        return detail;
      },
    });
    const result = await generateTwoStage(input, model.call);
    expect(result.plan).not.toBeNull();
    expect(result.retries).toBe(1);
    expect(result.attempts.filter((a) => a.violations.length > 0).map((a) => a.stage)).toEqual([
      "detail:2026-10-13",
    ]);
  });

  it("fails when a day's details keep breaking the rules", async () => {
    const plan = goodPlan();
    const model = fakeModel(plan, {
      detailFor: (date) => {
        const detail = detailOf(plan, date);
        if (date === "2026-10-16") detail.dishes.pop();
        return detail;
      },
    });
    const result = await generateTwoStage(input, model.call);
    expect(result.plan).toBeNull();
    expect(result.failure).toContain("2026-10-16");
  });
});

// ---------------------------------------------------------------------------
// Prompts and report
// ---------------------------------------------------------------------------

describe("prompts and report", () => {
  it("passes restrictions without aliases and keeps 'none' days in the input", () => {
    const { user } = buildOutlinePrompt(input);
    expect(user).toContain('"mode": "none"');
    expect(user).not.toContain("たまご");
  });

  it("gives the detail prompt only the leftovers used that day", () => {
    const outline = outlineOf(goodPlan());
    expect(buildDayDetailPrompt(input, outline.days[0]!).user).toContain("キャベツ");
    expect(buildDayDetailPrompt(input, outline.days[1]!).user).not.toContain('"name": "キャベツ"');
  });

  it("renders a report with the menus", async () => {
    const plan = goodPlan();
    const result = await generateTwoStage(input, async (request) =>
      request.schema === OUTLINE_SCHEMA
        ? reply(outlineOf(plan))
        : reply(detailOf(plan, JSON.parse(request.messages[0]!.content.split("\n\n")[1]!).date)),
    );
    const report = renderReport(
      [
        {
          scenario: { ...SCENARIOS[0]!, input },
          model: MODELS[0]!,
          repeat: 1,
          variant: "two-stage (medium/low)",
          result,
        },
      ],
      { promptVersion: "test", startedAt: "2026-10-12T00:00:00Z" },
    );
    expect(report).toContain("| Claude Sonnet 5.5 | two-stage (medium/low) | 1 | 1/1 | 1/1 |");
    expect(report).toContain("主菜: 豚こまとキャベツの味噌炒め(20分) [余: キャベツ]");
  });
});

describe("buildPlanInput", () => {
  it("merges restrictions, keeping the strictest rule, and sorts days", () => {
    const result = buildPlanInput({
      days: [
        { date: "2026-10-14", mode: "quick" },
        { date: "2026-10-13", mode: "normal" },
      ],
      memberCount: 2,
      quickMaxMinutes: null,
      restrictions: [
        { label: "卵", kind: "avoid", aliases: null },
        { label: "卵 ", kind: "allergy", aliases: ["たまご", "玉子"] },
        { label: "セロリ", kind: "never", aliases: null },
      ],
      leftovers: [{ raw_name: "キャベツ", amount: 0.5, unit: "玉" }],
      recentTitles: ["肉じゃが", "肉じゃが"],
      request: "  ",
    });
    expect(result.days.map((d) => d.date)).toEqual(["2026-10-13", "2026-10-14"]);
    expect(result.quickMaxMinutes).toBe(15);
    expect(result.restrictions).toEqual([
      { label: "卵", kind: "allergy", aliases: ["たまご", "玉子"] },
      { label: "セロリ", kind: "never", aliases: [] },
    ]);
    expect(result.leftovers).toEqual([{ name: "キャベツ", amount: 0.5, unit: "玉" }]);
    expect(result.recentTitles).toEqual(["肉じゃが"]);
    expect(result.request).toBeUndefined();
  });

  it("cooks for at least one person", () => {
    const result = buildPlanInput({
      days: [],
      memberCount: 0,
      quickMaxMinutes: 20,
      restrictions: [],
      leftovers: [],
      recentTitles: [],
      request: "魚多めで",
    });
    expect(result.servings).toBe(1);
    expect(result.request).toBe("魚多めで");
  });
});
