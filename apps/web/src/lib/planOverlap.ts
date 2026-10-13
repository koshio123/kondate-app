// What saving a plan period does to other plans (mirrors claim_plan_dates in
// supabase/migrations/20261013000800_one_plan_per_date.sql), so S2 can warn first.

import { addDays } from "./date";

export interface PeriodPlan {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
}

export type OverlapEffect<P extends PeriodPlan = PeriodPlan> =
  /** The other plan keeps its days up to `keepUntil`; `dropFrom`..its end are removed. */
  | { kind: "trim"; plan: P; keepUntil: string; dropFrom: string }
  /** The other plan starts inside the new period and is archived. */
  | { kind: "archive"; plan: P };

export function overlapEffects<P extends PeriodPlan>(
  start: string,
  end: string,
  plans: P[],
  selfId: string | null,
): OverlapEffect<P>[] {
  return plans
    .filter(
      (p) =>
        p.id !== selfId && p.status !== "archived" && p.start_date <= end && p.end_date >= start,
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((plan) =>
      plan.start_date < start
        ? { kind: "trim" as const, plan, keepUntil: addDays(start, -1), dropFrom: start }
        : { kind: "archive" as const, plan },
    );
}

/**
 * When the whole new period lies inside one plan that already has dinners, changing those
 * days in that plan is usually what is wanted. Returns that plan, if any.
 */
export function containingPlan<P extends PeriodPlan>(
  start: string,
  end: string,
  plans: P[],
  selfId: string | null,
): P | null {
  return (
    plans.find(
      (p) =>
        p.id !== selfId &&
        (p.status === "proposed" || p.status === "confirmed") &&
        p.start_date <= start &&
        p.end_date >= end,
    ) ?? null
  );
}

/** First day of a new plan: tomorrow, or the day after the last plan that is still on. */
export function defaultStart(tomorrow: string, plans: PeriodPlan[]): string {
  const lastEnd = plans
    .filter((p) => p.status !== "archived")
    .map((p) => p.end_date)
    .sort()
    .at(-1);
  if (!lastEnd) return tomorrow;
  const next = addDays(lastEnd, 1);
  return next > tomorrow ? next : tomorrow;
}
