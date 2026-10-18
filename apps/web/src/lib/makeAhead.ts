// Make-ahead (作り置き): cook a dish once and eat it again on later days of the same plan.
// Pure helpers for S4 / S1 / S5; the rules are enforced by the make_ahead RPC.

import { daysBetween } from "./date";
import type { Course, PlanDay, PlanDish } from "./plans";

/** Minutes counted for a make-ahead dish: warming it up (same as the Edge Functions). */
export const REHEAT_MINUTES = 5;

/** A dish can be eaten again on at most this many days (3 meals from one cooking). */
export const MAKE_AHEAD_MAX_DAYS = 2;

/** From this many days later, suggest freezing rather than the fridge. */
export const FREEZE_FROM_DAYS = 4;

export function dishMinutes(dish: PlanDish): number {
  return dish.madeOn ? REHEAT_MINUTES : (dish.recipe?.cook_minutes ?? 0);
}

/** Dishes that lose their texture or freshness when kept; shown as a caution, not refused. */
const POOR_KEEPERS =
  /揚げ|フライ(?!パン)|天ぷら|天丼|カツ(?!オ)|かつ丼|刺身|刺し身|たたき|カルパッチョ|サラダ|浅漬け|冷奴/;

export function makeAheadCaution(title: string): string | null {
  return POOR_KEEPERS.test(title)
    ? "揚げ物・生もの・サラダは、時間がたつと食感や鮮度が落ちやすい料理です"
    : null;
}

export interface MakeAheadOption {
  day: PlanDay;
  daysLater: number;
  /** The dish it replaces on that day (same course; a one-dish meal and a main stand in for each other). */
  replaces: PlanDish;
}

/** main and one_dish fill the same role (the centre of the meal). */
const SAME_ROLE: Partial<Record<Course, Course>> = { main: "one_dish", one_dish: "main" };

/** How many more days the dish can be eaten on. */
export function remainingDays(days: PlanDay[], dish: PlanDish): number {
  const followers = days
    .flatMap((d) => d.dishes)
    .filter((d) => d.madeOn?.dishId === dish.id).length;
  return Math.max(0, MAKE_AHEAD_MAX_DAYS - followers);
}

/**
 * Later days with dinner that do not have this dish yet and have a dish of the same course
 * for it to replace. Days without one are not offered.
 */
export function makeAheadOptions(
  days: PlanDay[],
  source: PlanDay,
  dish: PlanDish,
): MakeAheadOption[] {
  if (dish.madeOn || dish.course === "staple") return [];
  return days.flatMap((day) => {
    if (
      day.date <= source.date ||
      day.mode === "none" ||
      day.dishes.some((d) => d.madeOn?.dishId === dish.id)
    ) {
      return [];
    }
    const replaces =
      day.dishes.find((d) => d.course === dish.course) ??
      day.dishes.find((d) => d.course === SAME_ROLE[dish.course]);
    return replaces ? [{ day, daysLater: daysBetween(source.date, day.date), replaces }] : [];
  });
}

/** Link to S5 with what the dish detail needs to know about make-ahead. */
export function dishLink(dish: PlanDish): string {
  if (!dish.recipe) return "#";
  const base = `/dishes/${dish.recipe.id}`;
  if (dish.madeOn) return `${base}?madeOn=${dish.madeOn.date}`;
  if (dish.alsoOn.length > 0) return `${base}?meals=${dish.alsoOn.length + 1}`;
  return base;
}
