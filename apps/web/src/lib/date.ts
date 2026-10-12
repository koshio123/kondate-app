const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 2026-10-12 -> "10月12日(月)" */
export function formatMonthDayLong(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]})`;
}

/** 2026-10-13 -> "10/13(火)" */
export function formatMonthDayShort(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

/** Parses a Postgres `date` ("2026-10-13") as a local date, avoiding the UTC shift of `new Date(str)`. */
export function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Local Date -> "2026-10-13" */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Number of days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);
}

/** Every date from start to end inclusive; empty if end is before start. */
export function datesInRange(start: string, end: string): string[] {
  const count = daysBetween(start, end) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(start, i));
}

/** "2026-10-13" -> "10/13(火)" */
export function formatIsoShort(isoDate: string): string {
  return formatMonthDayShort(parseIsoDate(isoDate));
}
