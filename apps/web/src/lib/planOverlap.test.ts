import { describe, expect, it } from "vitest";
import { containingPlan, defaultStart, overlapEffects, type PeriodPlan } from "./planOverlap";

const plan = (id: string, start: string, end: string, status = "confirmed"): PeriodPlan => ({
  id,
  start_date: start,
  end_date: end,
  status,
});

const week = plan("w", "2026-10-14", "2026-10-18");

describe("overlapEffects", () => {
  it("archives a plan that starts inside the new period", () => {
    expect(overlapEffects("2026-10-14", "2026-10-14", [week], null)).toEqual([
      { kind: "archive", plan: week },
    ]);
  });

  it("trims a plan that started earlier", () => {
    expect(overlapEffects("2026-10-16", "2026-10-20", [week], null)).toEqual([
      { kind: "trim", plan: week, keepUntil: "2026-10-15", dropFrom: "2026-10-16" },
    ]);
  });

  it("ignores the plan being edited, archived plans and plans that do not overlap", () => {
    const later = plan("l", "2026-10-19", "2026-10-21");
    const old = plan("o", "2026-10-14", "2026-10-15", "archived");
    expect(overlapEffects("2026-10-14", "2026-10-18", [week, later, old], "w")).toEqual([]);
  });
});

describe("containingPlan", () => {
  it("finds a proposed or confirmed plan that holds the whole period", () => {
    expect(containingPlan("2026-10-14", "2026-10-14", [week], null)).toBe(week);
    expect(containingPlan("2026-10-17", "2026-10-19", [week], null)).toBeNull();
    expect(
      containingPlan(
        "2026-10-14",
        "2026-10-14",
        [plan("d", "2026-10-14", "2026-10-18", "draft")],
        null,
      ),
    ).toBeNull();
  });
});

describe("defaultStart", () => {
  it("starts after the last plan, or tomorrow", () => {
    expect(defaultStart("2026-10-14", [week])).toBe("2026-10-19");
    expect(defaultStart("2026-10-14", [])).toBe("2026-10-14");
    expect(defaultStart("2026-10-20", [week])).toBe("2026-10-20");
  });
});
