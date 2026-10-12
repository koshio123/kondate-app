import { describe, expect, it } from "vitest";
import {
  addDays,
  datesInRange,
  daysBetween,
  formatIsoShort,
  formatMonthDayLong,
  formatMonthDayShort,
  parseIsoDate,
  toIsoDate,
} from "./date";

describe("date formatting", () => {
  it("formats the long Japanese month/day with weekday", () => {
    expect(formatMonthDayLong(new Date(2026, 9, 12))).toBe("10月12日(月)");
  });

  it("formats the short month/day with weekday", () => {
    expect(formatMonthDayShort(new Date(2026, 9, 17))).toBe("10/17(土)");
    expect(formatIsoShort("2026-10-13")).toBe("10/13(火)");
  });

  it("parses Postgres dates as local dates", () => {
    const date = parseIsoDate("2026-10-13");
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getDay()]).toEqual([
      2026, 9, 13, 2,
    ]);
    expect(toIsoDate(date)).toBe("2026-10-13");
  });

  it("rejects malformed dates", () => {
    expect(() => parseIsoDate("2026/10/13")).toThrow();
  });
});

describe("date arithmetic", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("counts and lists the days of a range", () => {
    expect(daysBetween("2026-10-13", "2026-10-17")).toBe(4);
    expect(datesInRange("2026-10-30", "2026-11-01")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(datesInRange("2026-10-17", "2026-10-13")).toEqual([]);
  });
});
