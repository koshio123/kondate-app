import { describe, expect, it } from "vitest";
import { formatAmount, parseLeftover } from "./leftovers";

describe("parseLeftover", () => {
  it.each([
    ["にんじん 1本", { name: "にんじん", amount: 1, unit: "本" }],
    ["豚こま150g", { name: "豚こま", amount: 150, unit: "g" }],
    ["キャベツ 1/2玉", { name: "キャベツ", amount: 0.5, unit: "玉" }],
    ["卵　３個", { name: "卵", amount: 3, unit: "個" }],
    ["牛乳 0.5", { name: "牛乳", amount: 0.5, unit: "" }],
    ["しめじ", { name: "しめじ", amount: null, unit: "" }],
  ])("parses %s", (text, expected) => {
    expect(parseLeftover(text)).toEqual(expected);
  });

  it("returns null for empty input", () => {
    expect(parseLeftover("   ")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("shows common fractions", () => {
    expect(formatAmount(0.5, "玉")).toBe("1/2玉");
    expect(formatAmount(150, "g")).toBe("150g");
    expect(formatAmount(null, "少々")).toBe("少々");
  });
});
