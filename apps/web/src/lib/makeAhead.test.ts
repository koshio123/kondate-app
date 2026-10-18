import { describe, expect, it } from "vitest";
import {
  dishLink,
  dishMinutes,
  makeAheadCaution,
  makeAheadOptions,
  remainingDays,
} from "./makeAhead";
import type { Course, PlanDay, PlanDish } from "./plans";

const dish = (
  id: string,
  course: Course,
  title: string,
  extra: Partial<PlanDish> = {},
): PlanDish => ({
  id,
  course,
  position: 0,
  recipe: { id: `r-${id}`, title, cook_minutes: 30, is_favorite: false },
  madeOn: null,
  alsoOn: [],
  ...extra,
});

const curry = dish("a-main", "main", "ポークカレー");
const days: PlanDay[] = [
  {
    id: "d1",
    date: "2026-10-13",
    mode: "normal",
    dishes: [dish("a-rice", "staple", "ご飯"), curry, dish("a-side", "side", "コールスロー")],
  },
  {
    id: "d2",
    date: "2026-10-14",
    mode: "normal",
    dishes: [dish("b-rice", "staple", "ご飯"), dish("b-main", "main", "鯖の味噌煮")],
  },
  { id: "d3", date: "2026-10-15", mode: "none", dishes: [] },
  {
    id: "d4",
    date: "2026-10-17",
    mode: "quick",
    dishes: [dish("c-one", "one_dish", "親子丼")],
  },
];

describe("makeAheadOptions", () => {
  it("lists later days with dinner and the dish of the same course it replaces", () => {
    const options = makeAheadOptions(days, days[0]!, curry);
    expect(options.map((o) => [o.day.date, o.daysLater, o.replaces.recipe?.title])).toEqual([
      ["2026-10-14", 1, "鯖の味噌煮"],
      ["2026-10-17", 4, "親子丼"], // a one-dish meal stands in for the main on a quick day
    ]);
  });

  it("skips days without a dish of that course to replace", () => {
    const side = days[0]!.dishes[2]!; // コールスロー: only 10/13 has a side
    expect(makeAheadOptions(days, days[0]!, side)).toEqual([]);
  });

  it("skips days that already have it, and refuses staples and make-ahead dishes", () => {
    const withFollower = days.map((d) =>
      d.id === "d2"
        ? {
            ...d,
            dishes: [
              d.dishes[0]!,
              dish("b-curry", "main", "ポークカレー", {
                madeOn: { dishId: "a-main", date: "2026-10-13" },
              }),
            ],
          }
        : d,
    );
    expect(makeAheadOptions(withFollower, days[0]!, curry).map((o) => o.day.id)).toEqual(["d4"]);
    expect(remainingDays(withFollower, curry)).toBe(1);
    expect(makeAheadOptions(days, days[0]!, days[0]!.dishes[0]!)).toEqual([]);
    expect(makeAheadOptions(withFollower, days[1]!, withFollower[1]!.dishes[1]!)).toEqual([]);
  });
});

describe("display helpers", () => {
  it("counts a make-ahead dish as warming up", () => {
    expect(dishMinutes(curry)).toBe(30);
    expect(dishMinutes({ ...curry, madeOn: { dishId: "x", date: "2026-10-13" } })).toBe(5);
  });

  it("links the dish detail with the batch size or the cooking day", () => {
    expect(dishLink(curry)).toBe("/dishes/r-a-main");
    expect(dishLink({ ...curry, alsoOn: ["2026-10-14", "2026-10-17"] })).toBe(
      "/dishes/r-a-main?meals=3",
    );
    expect(dishLink({ ...curry, madeOn: { dishId: "x", date: "2026-10-13" } })).toBe(
      "/dishes/r-a-main?madeOn=2026-10-13",
    );
  });

  it("cautions about dishes that do not keep well", () => {
    expect(makeAheadCaution("鶏の唐揚げ")).not.toBeNull();
    expect(makeAheadCaution("トンカツ")).not.toBeNull();
    expect(makeAheadCaution("カツオのたたき")).not.toBeNull(); // たたき
    expect(makeAheadCaution("フライパンで作る鶏の照り焼き")).toBeNull();
    expect(makeAheadCaution("ポークカレー")).toBeNull();
  });
});
