import { describe, expect, it } from "vitest";
import type {
  GeneratedDish,
  GeneratedPlan,
} from "../../../supabase/functions/_shared/plan/types.ts";
import { checkStaples } from "./staples.ts";

const dish = (title: string, ingredients: string[]): GeneratedDish => ({
  title,
  course: "main",
  cook_minutes: 30,
  ingredients: ingredients.map((name) => ({ name, amount: 1, unit: "個", is_pantry: false })),
  steps: [],
  uses_leftovers: [],
});
const plan = (...dishes: GeneratedDish[]): GeneratedPlan => ({
  days: [{ date: "2026-10-29", dishes }],
});

describe("checkStaples", () => {
  it("finds a hamburger without egg", () => {
    const result = checkStaples(
      plan(dish("煮込みハンバーグ", ["合いびき肉", "玉ねぎ", "パン粉", "牛乳"])),
      [],
    );
    expect(result.checked).toBe(1);
    expect(result.misses).toEqual([
      expect.objectContaining({ title: "煮込みハンバーグ", missing: ["卵"] }),
    ]);
  });

  it("accepts other spellings, katakana and pantry items", () => {
    const result = checkStaples(
      plan(
        dish("ハンバーグ", ["合挽き肉", "溶き卵", "玉ねぎ"]),
        dish("トンカツ", ["豚ロース肉", "パン粉", "薄力粉", "たまご"]),
        dish("鶏のから揚げ", ["鶏もも肉", "片栗粉"]),
      ),
      [],
    );
    expect(result).toEqual({ checked: 3, misses: [] });
  });

  it("skips ingredients the family cannot eat", () => {
    const result = checkStaples(
      plan(
        dish("豆腐ハンバーグ", ["木綿豆腐", "鶏ひき肉", "片栗粉"]),
        dish("ポテトサラダ", ["じゃがいも", "きゅうり", "豆乳"]),
      ),
      [{ label: "卵", kind: "allergy" }],
    );
    // The hamburger still needs meat or tofu; mayonnaise hides egg, so it is not required.
    expect(result).toEqual({ checked: 2, misses: [] });
  });

  it("ignores dishes no rule covers and look-alike titles", () => {
    const result = checkStaples(
      plan(
        dish("カツオのたたき", ["かつお", "玉ねぎ"]),
        dish("フライパンで作る鮭のムニエル", ["生鮭", "バター"]),
        dish("きんぴらごぼう", ["ごぼう", "にんじん"]),
      ),
      [],
    );
    expect(result).toEqual({ checked: 0, misses: [] });
  });

  it("lists every missing group", () => {
    const result = checkStaples(plan(dish("アジフライ", ["あじ", "小麦粉"])), []);
    expect(result.misses[0]?.missing).toEqual(["パン粉", "卵"]);
  });
});
