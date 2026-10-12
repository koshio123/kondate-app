import { describe, expect, it } from "vitest";
import { type Favorite, filterFavorites, sortFavorites, toFavorite } from "./favorites";

const fav = (overrides: Partial<Favorite>): Favorite => ({
  id: overrides.title ?? "x",
  title: "料理",
  course: "main",
  cook_minutes: 20,
  rating: null,
  ingredients: [],
  lastDate: null,
  ...overrides,
});

const list = [
  fav({
    title: "鮭のちゃんちゃん焼き",
    course: "main",
    cook_minutes: 25,
    rating: 5,
    ingredients: ["生鮭", "キャベツ"],
  }),
  fav({
    title: "きのこの和風パスタ",
    course: "one_dish",
    cook_minutes: 15,
    rating: 4,
    ingredients: ["しめじ", "パスタ"],
  }),
  fav({
    title: "ほうれん草の胡麻和え",
    course: "side",
    cook_minutes: 10,
    rating: 4,
    ingredients: ["ほうれん草"],
  }),
];

describe("filterFavorites", () => {
  it("matches titles and ingredients, ignoring kana and width", () => {
    expect(filterFavorites(list, "きゃべつ", "all").map((f) => f.title)).toEqual([
      "鮭のちゃんちゃん焼き",
    ]);
    expect(filterFavorites(list, "ﾊﾟｽﾀ", "all").map((f) => f.title)).toEqual([
      "きのこの和風パスタ",
    ]);
    expect(filterFavorites(list, "", "all")).toHaveLength(3);
  });

  it("needs every word to match", () => {
    expect(filterFavorites(list, "鮭 キャベツ", "all")).toHaveLength(1);
    expect(filterFavorites(list, "鮭 パスタ", "all")).toHaveLength(0);
  });

  it("filters by course and by quick dishes", () => {
    expect(filterFavorites(list, "", "side").map((f) => f.title)).toEqual(["ほうれん草の胡麻和え"]);
    expect(filterFavorites(list, "", "quick").map((f) => f.title)).toEqual([
      "きのこの和風パスタ",
      "ほうれん草の胡麻和え",
    ]);
  });
});

describe("sortFavorites / toFavorite", () => {
  it("puts the best rated, then the most recent, first", () => {
    const sorted = sortFavorites([
      fav({ title: "A", rating: 4, lastDate: "2026-09-01" }),
      fav({ title: "B", rating: 5 }),
      fav({ title: "C", rating: 4, lastDate: "2026-10-01" }),
      fav({ title: "D" }),
    ]);
    expect(sorted.map((f) => f.title)).toEqual(["B", "C", "A", "D"]);
  });

  it("takes the latest date up to today and drops pantry items", () => {
    const f = toFavorite(
      {
        id: "1",
        title: "肉じゃが",
        course: "main",
        cook_minutes: 30,
        rating: 4,
        recipe_ingredients: [
          { raw_name: "じゃがいも", is_pantry: false },
          { raw_name: "醤油", is_pantry: true },
        ],
        planned_dishes: [
          { meal_plan_days: { date: "2026-09-20" } },
          { meal_plan_days: [{ date: "2026-10-12" }] },
          { meal_plan_days: { date: "2026-10-20" } },
        ],
      },
      "2026-10-13",
    );
    expect(f.lastDate).toBe("2026-10-12");
    expect(f.ingredients).toEqual(["じゃがいも"]);
  });
});
