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
