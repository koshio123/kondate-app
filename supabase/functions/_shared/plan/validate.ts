import { containsAnyTerm, normalizeFoodName, restrictionTerms } from "./normalize.ts";
import type {
  DayDetail,
  GeneratedDish,
  GeneratedPlan,
  OutlineDay,
  PlanInput,
  PlanOutline,
} from "./types.ts";

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
  | "REPEATS_RECENT"
  | "PERISHABLE_LATE"
  // stage 2 (per-day details) only
  | "DETAIL_MISMATCH"
  // re-suggesting one day or dish
  | "COURSE_MISMATCH"
  | "SAME_AS_BEFORE";

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

/** Minutes counted for a make-ahead dish: warming it up. */
export const REHEAT_MINUTES = 5;

const minutesOf = (dish: GeneratedDish) => (dish.made_ahead ? REHEAT_MINUTES : dish.cook_minutes);

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
      const total = day.dishes.reduce((sum, d) => sum + minutesOf(d), 0);
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
        if (dish.made_ahead) continue; // checked on the day it is cooked
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
  // A make-ahead dish is the same cooking eaten again, not a repeat.
  const titles = plan.days.flatMap((day) =>
    day.dishes.filter((d) => d.course !== "staple" && !d.made_ahead).map((d) => d.title),
  );
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

  // --- perishables ------------------------------------------------------
  const start = [...input.days.map((d) => d.date)].sort()[0];
  if (start) {
    for (const day of plan.days) {
      const dayIndex = daysBetween(start, day.date);
      if (dayIndex < PERISHABLE_LAST_DAY_INDEX + 1) continue;
      for (const dish of day.dishes) {
        if (dish.made_ahead) continue; // bought and cooked on an earlier day
        const hits = dish.ingredients
          .filter((i) => !i.is_pantry)
          .map((i) => i.name)
          .filter((name) => isPerishable(name));
        if (hits.length > 0) {
          warnings.push({
            code: "PERISHABLE_LATE",
            date: day.date,
            dish: dish.title,
            message: `${day.date}「${dish.title}」の${hits.join("、")}は傷みやすく、期間の${dayIndex + 1}日目です`,
          });
        }
      }
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

// ---------------------------------------------------------------------------
// Two-stage helpers
// ---------------------------------------------------------------------------

/** Stage 1 check: the outline is validated as a plan whose ingredients are the main ingredients. */
export function validateOutline(input: PlanInput, outline: PlanOutline): ValidationResult {
  return validatePlan(input, outlineAsPlan(outline));
}

/**
 * Stage 2 check for one day: the dishes must match the outline (same count and order) and
 * the full ingredient lists, seasonings included, must respect allergy/never restrictions.
 */
export function validateDayDetail(input: PlanInput, day: OutlineDay, detail: DayDetail): Issue[] {
  const issues: Issue[] = [];
  if (detail.dishes.length !== day.dishes.length) {
    issues.push({
      code: "DETAIL_MISMATCH",
      date: day.date,
      message: `料理は ${day.dishes.length} 品のはずが ${detail.dishes.length} 品です(${day.dishes.map((d) => d.title).join("、")})`,
    });
    return issues;
  }
  for (const restriction of input.restrictions) {
    if (restriction.kind === "avoid") continue;
    const terms = restrictionTerms(restriction);
    detail.dishes.forEach((dish, i) => {
      const title = day.dishes[i]?.title ?? dish.title;
      const hits = dish.ingredients.map((x) => x.name).filter((name) => containsAnyTerm(name, terms));
      if (hits.length > 0) {
        issues.push({
          code: "RESTRICTED_INGREDIENT",
          date: day.date,
          dish: title,
          message: `使えない食材「${restriction.label}」が「${title}」(${hits.join("、")})に入っています`,
        });
      }
    });
  }
  return issues;
}

/** Combines the outline with per-day details into a full plan (outline titles win). */
export function mergeOutline(outline: PlanOutline, details: Map<string, DayDetail>): GeneratedPlan {
  return {
    days: outline.days.map((day) => {
      const detail = details.get(day.date);
      return {
        date: day.date,
        dishes: day.dishes.map((dish, i) => ({
          title: dish.title,
          course: dish.course,
          cook_minutes: dish.cook_minutes,
          ingredients: detail?.dishes[i]?.ingredients ?? [],
          steps: detail?.dishes[i]?.steps ?? [],
          uses_leftovers: dish.uses_leftovers,
        })),
      };
    }),
  };
}

export function outlineAsPlan(outline: PlanOutline): GeneratedPlan {
  return {
    days: outline.days.map((day) => ({
      date: day.date,
      dishes: day.dishes.map((dish) => ({
        title: dish.title,
        course: dish.course,
        cook_minutes: dish.cook_minutes,
        ingredients: dish.main_ingredients.map((name) => ({ name, amount: null, unit: "", is_pantry: false })),
        steps: [],
        uses_leftovers: dish.uses_leftovers,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Perishables
// ---------------------------------------------------------------------------

/** Raw seafood and minced meat should be eaten within the first 3 days after shopping. */
const PERISHABLE_LAST_DAY_INDEX = 2;

const PERISHABLE_TERMS = [
  "鮭", "さけ", "サーモン", "鯖", "さば", "鰤", "ぶり", "鱈", "たら", "鯵", "あじ", "鰯", "いわし",
  "秋刀魚", "さんま", "かじき", "鮪", "まぐろ", "鯛", "かれい", "ほっけ", "刺身", "えび", "海老",
  "いか", "たこ", "あさり", "しじみ", "ほたて", "牡蠣", "ひき肉", "挽き肉", "ミンチ",
].map(normalizeFoodName);

/** Canned, frozen, dried or salted-and-processed forms keep; fresh ones do not. */
const KEEPS_TERMS = ["缶", "冷凍", "干し", "乾燥", "フレーク", "ツナ", "かにかま", "ちくわ", "桜えび"].map(normalizeFoodName);

function isPerishable(name: string): boolean {
  const n = normalizeFoodName(name);
  if (KEEPS_TERMS.some((t) => n.includes(t))) return false;
  return PERISHABLE_TERMS.some((t) => n.includes(t));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
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
