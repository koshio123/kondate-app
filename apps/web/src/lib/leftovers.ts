export interface ParsedLeftover {
  name: string;
  amount: number | null;
  unit: string;
}

/**
 * Parses free text such as "にんじん 1本", "豚こま150g", "キャベツ 1/2玉" or "しめじ".
 * Full-width digits are accepted. Returns null for empty input.
 */
export function parseLeftover(text: string): ParsedLeftover | null {
  const value = text.normalize("NFKC").trim();
  if (!value) return null;
  const match = /^(.+?)\s*(\d+(?:\.\d+)?(?:\/\d+)?)\s*([^\d\s]*)$/.exec(value);
  if (!match) return { name: value, amount: null, unit: "" };
  const [, name, rawAmount, unit] = match;
  const amount = parseAmount(rawAmount!);
  if (amount === null || !name!.trim()) return { name: value, amount: null, unit: "" };
  return { name: name!.trim(), amount, unit: unit ?? "" };
}

function parseAmount(raw: string): number | null {
  if (raw.includes("/")) {
    const [n, d] = raw.split("/").map(Number);
    return n && d ? n / d : null;
  }
  const amount = Number(raw);
  return amount > 0 ? amount : null;
}

/** 0.5 + "玉" -> "1/2玉", 150 + "g" -> "150g" */
export function formatAmount(amount: number | null, unit: string): string {
  if (amount === null) return unit;
  const fractions: Record<string, string> = { "0.5": "1/2", "0.25": "1/4", "0.75": "3/4" };
  const text = fractions[String(amount)] ?? String(Math.round(amount * 100) / 100);
  return `${text}${unit}`;
}
