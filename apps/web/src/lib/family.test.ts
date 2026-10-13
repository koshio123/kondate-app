import { describe, expect, it } from "vitest";
import {
  ageOn,
  cleanLabel,
  describeMember,
  groupRestrictions,
  type Member,
  type Restriction,
  stepQuickMinutes,
} from "./family";

const ken: Member = {
  id: "m1",
  name: "Ken",
  birth_date: "1995-04-01",
  sex: null,
  activity_level: "normal",
};
const partner: Member = {
  id: "m2",
  name: "パートナー",
  birth_date: null,
  sex: "female",
  activity_level: "high",
};

describe("ageOn / describeMember", () => {
  it("counts full years, turning a year older on the birthday", () => {
    expect(ageOn("1995-04-01", "2026-03-31")).toBe(30);
    expect(ageOn("1995-04-01", "2026-04-01")).toBe(31);
    expect(ageOn(null, "2026-04-01")).toBeNull();
  });

  it("describes a member in one line", () => {
    expect(describeMember(ken, "2026-10-13")).toBe("31歳・活動量 ふつう・性別 未設定");
    expect(describeMember(partner, "2026-10-13")).toBe("年齢 未設定・活動量 多い・女性");
  });
});

describe("groupRestrictions", () => {
  const row = (
    id: string,
    member_id: string,
    label: string,
    kind: Restriction["kind"],
  ): Restriction => ({
    id,
    member_id,
    label,
    kind,
  });

  it("merges the same food across members and keeps the strictest kind", () => {
    const groups = groupRestrictions(
      [
        row("r1", "m2", "セロリ", "avoid"),
        row("r2", "m1", "せろり", "never"),
        row("r3", "m1", "レバー", "avoid"),
        row("r4", "m2", "えび", "allergy"),
      ],
      [ken, partner],
    );
    expect(groups.map((g) => [g.label, g.kind])).toEqual([
      ["えび", "allergy"],
      ["セロリ", "never"],
      ["レバー", "avoid"],
    ]);
    const celery = groups[1]!;
    expect(celery.members.map((m) => m.name)).toEqual(["Ken", "パートナー"]);
    expect(celery.ids.sort()).toEqual(["r1", "r2"]);
  });
});

describe("input helpers", () => {
  it("cleans food names", () => {
    expect(cleanLabel("  ｾﾛﾘ　 ")).toBe("セロリ");
    expect(cleanLabel("   ")).toBe("");
  });

  it("steps the quick-day minutes by 5 within 5-60", () => {
    expect(stepQuickMinutes(15, 1)).toBe(20);
    expect(stepQuickMinutes(5, -1)).toBe(5);
    expect(stepQuickMinutes(60, 1)).toBe(60);
    expect(stepQuickMinutes(12, -1)).toBe(5);
  });
});
