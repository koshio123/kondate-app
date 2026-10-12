import { describe, expect, it } from "vitest";
import {
  buildShoppingList,
  formatQuantity,
  type Category,
  type IngredientMaster,
  type UsageRow,
} from "./shopping";

const categories: Category[] = [
  { id: "veg", name: "野菜・果物", sort_order: 10 },
  { id: "meat", name: "肉", sort_order: 20 },
  { id: "fish", name: "魚", sort_order: 30 },
  { id: "egg", name: "卵・乳製品", sort_order: 40 },
  { id: "tofu", name: "豆腐・練り物", sort_order: 50 },
  { id: "staple", name: "パン・米・麺", sort_order: 60 },
  { id: "season", name: "調味料・乾物", sort_order: 70 },
  { id: "frozen", name: "冷凍食品", sort_order: 80 },
  { id: "other", name: "その他", sort_order: 90 },
];

const onion: IngredientMaster = {
  id: "onion",
  name: "玉ねぎ",
  category_id: "veg",
  base_unit: "個",
  grams_per_piece: 200,
};
const chicken: IngredientMaster = {
  id: "chicken",
  name: "鶏もも肉",
  category_id: "meat",
  base_unit: "g",
  grams_per_piece: null,
};
const cabbage: IngredientMaster = {
  id: "cabbage",
  name: "キャベツ",
  category_id: "veg",
  base_unit: "玉",
  grams_per_piece: 1200,
};
const egg: IngredientMaster = {
  id: "egg",
  name: "卵",
  category_id: "egg",
  base_unit: "個",
  grams_per_piece: 60,
};

const use = (
  dishTitle: string,
  raw_name: string,
  amount: number | null,
  unit: string,
  ingredient: IngredientMaster | null = null,
  is_pantry = false,
): UsageRow => ({ dishTitle, raw_name, amount, unit, is_pantry, ingredient });

describe("buildShoppingList", () => {
  it("adds up the same ingredient across dishes and notes the dishes", () => {
    const items = buildShoppingList(
      [
        use("親子丼", "鶏もも肉", 200, "g", chicken),
        use("照り焼き", "鶏もも肉", 0.4, "kg", chicken),
      ],
      [],
      categories,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      display_name: "鶏もも肉",
      amount: 600,
      unit: "g",
      note: "親子丼・照り焼きの2品分",
    });
  });

  it("converts grams to pieces with the master weight and rounds up to quarters", () => {
    const items = buildShoppingList(
      [use("親子丼", "玉ねぎ", 0.5, "個", onion), use("スープ", "たまねぎ", 100, "g", onion)],
      [],
      categories,
    );
    expect(items[0]).toMatchObject({ amount: 1, unit: "個" });
  });

  it("keeps units that cannot be converted side by side", () => {
    const items = buildShoppingList(
      [use("A", "しょうが", 1, "かけ"), use("B", "しょうが", 10, "g")],
      [],
      categories,
    );
    expect(items[0]).toMatchObject({ amount: null, unit: "1片+10g" });
  });

  it("subtracts leftovers and drops what is fully covered", () => {
    const items = buildShoppingList(
      [
        use("親子丼", "卵", 4, "個", egg),
        use("スープ", "卵", 1, "個", egg),
        use("炒め", "キャベツ", 0.25, "玉", cabbage),
      ],
      [
        { raw_name: "卵", amount: 3, unit: "個" },
        { raw_name: "キャベツ", amount: 0.5, unit: "玉" },
      ],
      categories,
    );
    expect(items.map((i) => i.display_name)).toEqual(["卵"]);
    expect(items[0]).toMatchObject({ amount: 2, unit: "個" });
    expect(items[0]!.note).toContain("必要5個のうち3個は家にあり");
  });

  it("flags leftovers of unknown amount instead of subtracting", () => {
    const items = buildShoppingList(
      [use("汁物", "しめじ", 1, "袋")],
      [{ raw_name: "しめじ", amount: null, unit: "" }],
      categories,
    );
    expect(items[0]).toMatchObject({ amount: 1, unit: "袋", note: "余り物が家にあるかも" });
  });

  it("lists pantry items last without amounts, unless a dish needs to buy them", () => {
    const items = buildShoppingList(
      [
        use("A", "醤油", 1, "大さじ", null, true),
        use("B", "醤油", 2, "小さじ", null, true),
        use("A", "鶏もも肉", 200, "g", chicken),
        use("C", "牛乳", 200, "ml", null, true),
        use("D", "牛乳", 100, "ml"),
      ],
      [],
      categories,
    );
    expect(items.map((i) => [i.display_name, i.is_pantry, i.amount, i.unit])).toEqual([
      ["鶏もも肉", false, 200, "g"],
      ["牛乳", false, 300, "ml"],
      ["醤油", true, null, ""],
    ]);
  });

  it("ignores vague amounts and guesses the section of unregistered items", () => {
    const items = buildShoppingList(
      [
        use("A", "さば", 2, "切れ"),
        use("B", "ごぼう", 1, "本"),
        use("C", "塩", null, "少々", null, true),
        use("D", "絹ごし豆腐(充填)", 1, "丁"),
      ],
      [],
      categories,
    );
    expect(items.map((i) => [i.display_name, i.category_id])).toEqual([
      ["ごぼう", "veg"],
      ["さば", "fish"],
      ["絹ごし豆腐", "tofu"],
      ["塩", "season"],
    ]);
    expect(items.map((i) => i.position)).toEqual([0, 1, 2, 3]);
  });

  it("uses stable keys so a rebuilt list keeps its checks", () => {
    const a = buildShoppingList(
      [use("A", "ごぼう", 1, "本"), use("B", "玉ねぎ", 1, "個", onion)],
      [],
      categories,
    );
    const b = buildShoppingList(
      [use("X", "ゴボウ", 2, "本"), use("Y", "玉ねぎ", 2, "個", onion)],
      [],
      categories,
    );
    expect(a.map((i) => i.key).sort()).toEqual(b.map((i) => i.key).sort());
  });
});

describe("formatQuantity", () => {
  it("writes fractions the way a shopper reads them", () => {
    expect(formatQuantity(0.5, "玉")).toBe("1/2玉");
    expect(formatQuantity(1.5, "個")).toBe("1と1/2個");
    expect(formatQuantity(300, "g")).toBe("300g");
  });
});
