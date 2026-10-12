import { containsAnyTerm, normalizeFoodName, restrictionTerms } from "./normalize.ts";
import type { GeneratedDish, GeneratedPlan, PlanInput } from "./types.ts";

export type IssueCode =
  // violations: the plan must be regenerated
  | "DAY_MISSING"
  | "DAY_UNEXPECTED"
  | "DAY_DUPLICATED"
  | "DAY_EMPTY"
  | "RESTRICTED_INGREDIENT"
  | "QUICK_TOO_LONG"
  | "COURSE_MISSING"
  | "INVALID_MINUTES"
  // warnings: shown to the user, plan is kept
  | "AVOID_INGREDIENT"
  | "LEFTOVER_UNUSED"
  | "LEFTOVER_LATE"
  | "DUPLICATE_TITLE"
  | "REPEATS_RECENT";

export interface Issue {
  code: IssueCode;
  message: string;
  date?: string;
  dish?: string;
}

export interface PlanMetrics {
  plannedDays: number;
  dishes: number;
  /** Share of input leftovers used somewhere in the plan (1 when there are none). */
  leftoverUsageRate: number;
  /** Distinct titles among main/one_dish dishes, as a rough variety signal. */
  distinctMainTitles: number;
}

export interface ValidationResult {
  violations: Issue[];
  warnings: Issue[];
  metrics: PlanMetrics;
}

/**
 * Checks a generated plan against the hard rules in docs/02_design.md "5.3".
 * Violations mean the plan must not be shown; warnings are shown alongside it.
 */
export function validatePlan(input: PlanInput, plan: GeneratedPlan): ValidationResult {
  const violations: Issue[] = [];
  const warnings: Issue[] = [];

  const expected = new Map(input.days.filter((d) => d.mode !== "none").map((d) => [d.date, d.mode]));
  const noneDays = new Set(input.days.filter((d) => d.mode === "none").map((d) => d.date));
  const seenDates = new Set<string>();

  // --- days -------------------------------------------------------------
  for (const day of plan.days) {
    if (seenDates.has(day.date)) {
      violations.push({ code: "DAY_DUPLICATED", date: day.date, message: `${day.date} が2回出力されています` });
    }
    seenDates.add(day.date);

    if (!expected.has(day.date)) {
      const why = noneDays.has(day.date) ? "献立なしの日です" : "計画期間外の日付です";
      violations.push({ code: "DAY_UNEXPECTED", date: day.date, message: `${day.date} は${why}` });
    }
    if (day.dishes.length === 0) {
      violations.push({ code: "DAY_EMPTY", date: day.date, message: `${day.date} に料理がありません` });
    }
  }
  for (const date of expected.keys()) {
    if (!seenDates.has(date)) {
      violations.push({ code: "DAY_MISSING", date, message: `${date} の献立がありません` });
    }
  }

  // --- per day rules ----------------------------------------------------
  for (const day of plan.days) {
    const mode = expected.get(day.date);
    for (const dish of day.dishes) {
      if (!Number.isInteger(dish.cook_minutes) || dish.cook_minutes < 0 || dish.cook_minutes > 240) {
        violations.push({
          code: "INVALID_MINUTES",
          date: day.date,
          dish: dish.title,
          message: `${day.date}「${dish.title}」の調理時間 ${dish.cook_minutes} 分が不正です`,
        });
      }
    }
    if (mode === "quick") {
      const total = day.dishes.reduce((sum, d) => sum + d.cook_minutes, 0);
      if (total > input.quickMaxMinutes) {
        violations.push({
          code: "QUICK_TOO_LONG",
          date: day.date,
          message: `${day.date} は時短の日ですが、調理時間の合計が ${total} 分です(上限 ${input.quickMaxMinutes} 分)`,
        });
      }
    }
    if (mode === "normal") {
      const missing = missingCourses(day.dishes);
      if (missing.length > 0) {
        violations.push({
          code: "COURSE_MISSING",
          date: day.date,
          message: `${day.date} は通常の日ですが、${missing.join("・")}がありません`,
        });
      }
    }
  }

  // --- restrictions -----------------------------------------------------
  for (const restriction of input.restrictions) {
    const terms = restrictionTerms(restriction);
    for (const day of plan.days) {
      for (const dish of day.dishes) {
        const hits = [dish.title, ...dish.ingredients.map((i) => i.name)].filter((name) =>
          containsAnyTerm(name, terms),
        );
        if (hits.length === 0) continue;
        const where = `${day.date}「${dish.title}」(${[...new Set(hits)].join("、")})`;
        if (restriction.kind === "avoid") {
          warnings.push({
            code: "AVOID_INGREDIENT",
            date: day.date,
            dish: dish.title,
            message: `なるべく避けたい「${restriction.label}」が ${where} に入っています`,
          });
        } else {
          violations.push({
            code: "RESTRICTED_INGREDIENT",
            date: day.date,
            dish: dish.title,
            message: `使えない食材「${restriction.label}」が ${where} に入っています`,
          });
        }
      }
    }
  }

  // --- leftovers --------------------------------------------------------
  const plannedDates = [...expected.keys()].sort();
  const firstHalfEnd = plannedDates[Math.max(0, Math.ceil(plannedDates.length / 2) - 1)];
  let usedLeftovers = 0;
  for (const leftover of input.leftovers) {
    const key = normalizeFoodName(leftover.name);
    const usedOn = plan.days
      .filter((day) =>
        day.dishes.some(
          (dish) =>
            dish.uses_leftovers.some((u) => normalizeFoodName(u) === key) ||
            dish.ingredients.some((i) => normalizeFoodName(i.name).includes(key)),
        ),
      )
      .map((day) => day.date)
      .sort();
    if (usedOn.length === 0) {
      warnings.push({ code: "LEFTOVER_UNUSED", message: `余り物「${leftover.name}」が使われていません` });
      continue;
    }
    usedLeftovers += 1;
    const firstUse = usedOn[0];
    if (firstHalfEnd && firstUse && firstUse > firstHalfEnd) {
      warnings.push({
        code: "LEFTOVER_LATE",
        date: firstUse,
        message: `余り物「${leftover.name}」を最初に使うのが ${firstUse} で、期間の後半です`,
      });
    }
  }

  // --- repetition -------------------------------------------------------
  const titles = plan.days.flatMap((day) => day.dishes.filter((d) => d.course !== "staple").map((d) => d.title));
  const counts = new Map<string, number>();
  for (const title of titles) counts.set(title, (counts.get(title) ?? 0) + 1);
  for (const [title, count] of counts) {
    if (count > 1) {
      warnings.push({ code: "DUPLICATE_TITLE", dish: title, message: `「${title}」が期間内に ${count} 回あります` });
    }
  }
  const recent = new Set(input.recentTitles.map(normalizeFoodName));
  for (const title of new Set(titles)) {
    if (recent.has(normalizeFoodName(title))) {
      warnings.push({ code: "REPEATS_RECENT", dish: title, message: `「${title}」は最近作った料理です` });
    }
  }

  const mains = plan.days.flatMap((day) =>
    day.dishes.filter((d) => d.course === "main" || d.course === "one_dish").map((d) => d.title),
  );

  return {
    violations,
    warnings,
    metrics: {
      plannedDays: plan.days.length,
      dishes: plan.days.reduce((n, d) => n + d.dishes.length, 0),
      leftoverUsageRate: input.leftovers.length === 0 ? 1 : usedLeftovers / input.leftovers.length,
      distinctMainTitles: new Set(mains).size,
    },
  };
}

const COURSE_LABELS = { staple: "主食", main: "主菜", side: "副菜", soup: "汁物" } as const;

/** Courses a normal day lacks. A one_dish counts as both staple and main. */
function missingCourses(dishes: GeneratedDish[]): string[] {
  const courses = new Set(dishes.map((d) => d.course));
  const oneDish = courses.has("one_dish");
  const missing: string[] = [];
  if (!courses.has("staple") && !oneDish) missing.push(COURSE_LABELS.staple);
  if (!courses.has("main") && !oneDish) missing.push(COURSE_LABELS.main);
  if (!courses.has("side")) missing.push(COURSE_LABELS.side);
  if (!courses.has("soup")) missing.push(COURSE_LABELS.soup);
  return missing;
}
