import { describe, expect, it } from "vitest";
import { formatMonthDayLong, formatMonthDayShort, parseIsoDate } from "./date";

describe("date formatting", () => {
  it("formats the long Japanese month/day with weekday", () => {
    expect(formatMonthDayLong(new Date(2026, 9, 12))).toBe("10月12日(月)");
  });

  it("formats the short month/day with weekday", () => {
    expect(formatMonthDayShort(new Date(2026, 9, 17))).toBe("10/17(土)");
  });

  it("parses Postgres dates as local dates", () => {
    const date = parseIsoDate("2026-10-13");
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getDay()]).toEqual([
      2026, 9, 13, 2,
    ]);
  });

  it("rejects malformed dates", () => {
    expect(() => parseIsoDate("2026/10/13")).toThrow();
  });
});
