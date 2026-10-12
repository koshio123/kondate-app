import { describe, expect, it } from "vitest";
import type {
  ModelReply,
  ModelRequest,
} from "../../../supabase/functions/_shared/plan/generate.ts";
import {
  buildRegenerateOutlinePrompt,
  type CurrentDay,
  regenerate,
  type RegenerateRequest,
} from "../../../supabase/functions/_shared/plan/regenerate.ts";
import { DISHES_OUTLINE_SCHEMA } from "../../../supabase/functions/_shared/plan/schema.ts";
import type { OutlineDish, PlanInput } from "../../../supabase/functions/_shared/plan/types.ts";

const input: PlanInput = {
  days: [
    { date: "2026-10-13", mode: "normal" },
    { date: "2026-10-14", mode: "quick" },
    { date: "2026-10-15", mode: "none" },
    { date: "2026-10-16", mode: "normal" },
  ],
  servings: 2,
  quickMaxMinutes: 15,
  restrictions: [{ label: "卵", kind: "allergy", aliases: ["たまご"] }],
  leftovers: [],
  recentTitles: [],
};

const current: CurrentDay[] = [
  {
    date: "2026-10-13",
    mode: "normal",
    dishes: [
      { title: "ご飯", course: "staple", cook_minutes: 0, main_ingredients: ["米"] },
      {
        title: "豚こまとキャベツの味噌炒め",
        course: "main",
        cook_minutes: 15,
        main_ingredients: ["豚こま切れ肉", "キャベツ"],
      },
      {
        title: "ほうれん草のおひたし",
        course: "side",
        cook_minutes: 10,
        main_ingredients: ["ほうれん草"],
      },
      {
        title: "玉ねぎの味噌汁",
        course: "soup",
        cook_minutes: 10,
        main_ingredients: ["玉ねぎ", "油揚げ"],
      },
    ],
  },
  {
    date: "2026-10-14",
    mode: "quick",
    dishes: [
      { title: "鶏そぼろ丼", course: "one_dish", cook_minutes: 10, main_ingredients: ["鶏ひき肉"] },
      {
        title: "きゅうりの浅漬け",
        course: "side",
        cook_minutes: 3,
        main_ingredients: ["きゅうり"],
      },
    ],
  },
  { date: "2026-10-15", mode: "none", dishes: [] },
  {
    date: "2026-10-16",
    mode: "normal",
    dishes: [
      { title: "ご飯", course: "staple", cook_minutes: 0, main_ingredients: ["米"] },
      { title: "鶏の照り焼き", course: "main", cook_minutes: 20, main_ingredients: ["鶏もも肉"] },
      {
        title: "にんじんしりしり",
        course: "side",
        cook_minutes: 10,
        main_ingredients: ["にんじん", "ツナ缶"],
      },
      { title: "大根の味噌汁", course: "soup", cook_minutes: 10, main_ingredients: ["大根"] },
    ],
  },
];

const outlineDish = (
  title: string,
  course: OutlineDish["course"],
  minutes: number,
  main: string[],
): OutlineDish => ({
  title,
  course,
  cook_minutes: minutes,
  main_ingredients: main,
  uses_leftovers: [],
});

const reply = (value: unknown, stopReason = "end_turn"): ModelReply => ({
  text: JSON.stringify(value),
  inputTokens: 100,
  outputTokens: 50,
  stopReason,
});

/** Answers outlines from a queue and details by echoing the requested dishes. */
function fakeModel(
  outlines: OutlineDish[][],
  ingredientsFor: (title: string) => string[] = (t) => [t],
) {
  const requests: ModelRequest[] = [];
  const call = async (request: ModelRequest) => {
    requests.push(request);
    if (request.schema === DISHES_OUTLINE_SCHEMA) return reply({ dishes: outlines.shift() });
    const payload = JSON.parse(request.messages[0]!.content.split("\n\n")[1]!) as {
      dishes: OutlineDish[];
    };
    return reply({
      dishes: payload.dishes.map((d) => ({
        title: d.title,
        ingredients: ingredientsFor(d.title).map((name) => ({
          name,
          amount: 1,
          unit: "個",
          is_pantry: false,
        })),
        steps: ["作る"],
      })),
    });
  };
  return { call, requests };
}

const request = (overrides: Partial<RegenerateRequest> = {}): RegenerateRequest => ({
  input,
  current,
  date: "2026-10-13",
  ...overrides,
});

describe("regenerate one dish", () => {
  it("returns one new dish of the same course", async () => {
    const model = fakeModel([
      [outlineDish("鮭のちゃんちゃん焼き", "main", 20, ["鮭", "キャベツ"])],
    ]);
    const result = await regenerate(request({ dishIndex: 1, hint: "魚にして" }), model.call);
    expect(result.failure).toBeNull();
    expect(result.dishes?.map((d) => d.title)).toEqual(["鮭のちゃんちゃん焼き"]);
    expect(result.dishes?.[0]?.ingredients.map((i) => i.name)).toEqual(["鮭のちゃんちゃん焼き"]);
    expect(model.requests).toHaveLength(2);
    // The model sees what to replace, what stays, the hint and the other days.
    const payload = JSON.parse(model.requests[0]!.messages[0]!.content.split("\n\n")[1]!);
    expect(payload.replaceDish.title).toBe("豚こまとキャベツの味噌炒め");
    expect(payload.keepDishes).toHaveLength(3);
    expect(payload.hint).toBe("魚にして");
    expect(payload.otherDays.map((d: { date: string }) => d.date)).toEqual([
      "2026-10-14",
      "2026-10-16",
    ]);
  });

  it("retries when the course changes or the dish is the same as before", async () => {
    const model = fakeModel([
      [outlineDish("豚こまとキャベツの味噌炒め", "main", 15, ["豚こま切れ肉"])],
      [outlineDish("ほうれん草とベーコンのソテー", "side", 10, ["ほうれん草"])],
      [outlineDish("麻婆豆腐", "main", 20, ["豆腐", "豚ひき肉"])],
    ]);
    const result = await regenerate(request({ dishIndex: 1 }), model.call);
    expect(result.dishes?.[0]?.title).toBe("麻婆豆腐");
    const codes = result.attempts.flatMap((a) => a.violations.map((v) => v.code));
    expect(codes).toContain("SAME_AS_BEFORE");
    expect(codes).toContain("COURSE_MISMATCH");
    expect(result.retries).toBe(2);
  });

  it("counts the kept dishes against the quick-day time limit", async () => {
    const model = fakeModel([
      [outlineDish("豚キムチ丼", "one_dish", 13, ["豚こま切れ肉", "キムチ"])], // 13 + 3 > 15
      [outlineDish("ツナ缶の和風パスタ", "one_dish", 12, ["パスタ", "ツナ缶"])],
    ]);
    const result = await regenerate(request({ date: "2026-10-14", dishIndex: 0 }), model.call);
    expect(result.attempts[0]?.violations.map((v) => v.code)).toEqual(["QUICK_TOO_LONG"]);
    expect(result.dishes?.[0]?.title).toBe("ツナ缶の和風パスタ");
  });

  it("rejects allergens found in the detailed ingredients", async () => {
    const model = fakeModel([[outlineDish("鶏むね肉のピカタ", "main", 20, ["鶏むね肉"])]], () => [
      "鶏むね肉",
      "溶き卵",
    ]);
    const result = await regenerate(request({ dishIndex: 1 }), model.call, { maxRetries: 2 });
    expect(result.dishes).toBeNull();
    expect(result.failure).toContain("卵");
  });
});

describe("regenerate a whole day", () => {
  it("replaces every dish and warns about perishables late in the period", async () => {
    const model = fakeModel([
      [
        outlineDish("ご飯", "staple", 0, ["米"]),
        outlineDish("鯖の味噌煮", "main", 25, ["鯖", "生姜"]),
        outlineDish("ひじきの煮物", "side", 15, ["ひじき", "にんじん"]),
        outlineDish("なめこの味噌汁", "soup", 5, ["なめこ"]),
      ],
    ]);
    const result = await regenerate(request({ date: "2026-10-16" }), model.call);
    expect(result.dishes?.map((d) => d.course)).toEqual(["staple", "main", "side", "soup"]);
    expect(result.warnings.map((w) => w.code)).toContain("PERISHABLE_LATE");
  });

  it("needs every course on a normal day and does not flag other days", async () => {
    const model = fakeModel([
      [outlineDish("ご飯", "staple", 0, ["米"]), outlineDish("鯖の塩焼き", "main", 15, ["鯖"])],
      [
        outlineDish("ご飯", "staple", 0, ["米"]),
        outlineDish("鶏肉と大根の煮物", "main", 25, ["鶏もも肉", "大根"]),
        outlineDish("小松菜の煮びたし", "side", 10, ["小松菜"]),
        outlineDish("豆腐とわかめの味噌汁", "soup", 5, ["豆腐", "わかめ"]),
      ],
    ]);
    const result = await regenerate(request(), model.call);
    expect(result.attempts[0]?.violations.map((v) => v.code)).toEqual(["COURSE_MISSING"]);
    expect(result.dishes).toHaveLength(4);
    expect(result.warnings.every((w) => w.date === "2026-10-13" || w.date === undefined)).toBe(
      true,
    );
  });

  it("refuses a day without dinner", async () => {
    const model = fakeModel([]);
    const result = await regenerate(request({ date: "2026-10-15" }), model.call);
    expect(result.dishes).toBeNull();
    expect(model.requests).toHaveLength(0);
  });

  it("tells the model which day of the period it is", () => {
    const { user } = buildRegenerateOutlinePrompt(request({ date: "2026-10-16" }), current[3]!);
    expect(JSON.parse(user.split("\n\n")[1]!).dayNumber).toBe(4);
  });
});
