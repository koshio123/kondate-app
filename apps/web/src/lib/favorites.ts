import type { Course } from "./plans";
import { normalizeName } from "./shopping";

export interface Favorite {
  id: string;
  title: string;
  course: Course;
  cook_minutes: number;
  rating: number | null;
  ingredients: string[];
  /** Latest plan date up to today on which it was (or is) dinner, if any. */
  lastDate: string | null;
}

/** "all", a course, or "quick" (fits a quick day on its own). */
export type FavoriteFilter = "all" | Course | "quick";

/** Default limit of a quick day; the household setting overrides it. */
export const QUICK_MINUTES = 15;

export interface FavoriteRow {
  id: string;
  title: string;
  course: string;
  cook_minutes: number;
  rating: number | null;
  recipe_ingredients: { raw_name: string; is_pantry: boolean }[];
  planned_dishes: { meal_plan_days: { date: string } | { date: string }[] | null }[];
}

export function toFavorite(row: FavoriteRow, today: string): Favorite {
  const dates = row.planned_dishes
    .flatMap((p) =>
      Array.isArray(p.meal_plan_days)
        ? p.meal_plan_days
        : p.meal_plan_days
          ? [p.meal_plan_days]
          : [],
    )
    .map((d) => d.date)
    .filter((d) => d <= today)
    .sort();
  return {
    id: row.id,
    title: row.title,
    course: row.course as Course,
    cook_minutes: row.cook_minutes,
    rating: row.rating,
    ingredients: row.recipe_ingredients.filter((i) => !i.is_pantry).map((i) => i.raw_name),
    lastDate: dates.at(-1) ?? null,
  };
}

/** Best rated first, then the ones made most recently. */
export function sortFavorites(list: Favorite[]): Favorite[] {
  return [...list].sort(
    (a, b) =>
      (b.rating ?? 0) - (a.rating ?? 0) ||
      (b.lastDate ?? "").localeCompare(a.lastDate ?? "") ||
      a.title.localeCompare(b.title, "ja"),
  );
}

/** Search matches the title or an ingredient; katakana/hiragana and width are ignored. */
export function filterFavorites(
  list: Favorite[],
  query: string,
  filter: FavoriteFilter,
  quickMinutes = QUICK_MINUTES,
): Favorite[] {
  const words = query
    .split(/[\s\u3000]+/)
    .map(normalizeName)
    .filter(Boolean);
  return list.filter((f) => {
    if (
      filter === "quick" ? f.cook_minutes > quickMinutes : filter !== "all" && f.course !== filter
    ) {
      return false;
    }
    const haystack = [f.title, ...f.ingredients].map(normalizeName);
    return words.every((w) => haystack.some((h) => h.includes(w)));
  });
}
