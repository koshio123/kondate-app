// Shared by the generate-plan Edge Function (Deno) and packages/plan-eval (Node).
// Keep this folder free of runtime-specific imports; use relative imports with `.ts`.

export type DayMode = "normal" | "quick" | "none";
export type Course = "staple" | "main" | "side" | "soup" | "one_dish";
export type RestrictionKind = "allergy" | "never" | "avoid";

export interface PlanDayInput {
  /** ISO date, e.g. "2026-10-13" */
  date: string;
  mode: DayMode;
}

export interface RestrictionInput {
  label: string;
  kind: RestrictionKind;
  /** Other spellings from the ingredient master (e.g. 卵 -> たまご, 玉子). */
  aliases?: string[];
}

export interface LeftoverInput {
  name: string;
  amount?: number | null;
  unit?: string;
}

export interface PlanInput {
  days: PlanDayInput[];
  /** Number of people eating (portions). */
  servings: number;
  quickMaxMinutes: number;
  restrictions: RestrictionInput[];
  leftovers: LeftoverInput[];
  /** Dish titles from the last couple of weeks, to avoid repeats. */
  recentTitles: string[];
  /** Free-text wish from the S3 screen, e.g. "魚料理を1回入れて". */
  request?: string;
}

export interface GeneratedIngredient {
  name: string;
  amount: number | null;
  unit: string;
  is_pantry: boolean;
}

export interface GeneratedDish {
  title: string;
  course: Course;
  cook_minutes: number;
  ingredients: GeneratedIngredient[];
  steps: string[];
  /** Names from the leftovers input that this dish uses. */
  uses_leftovers: string[];
  /**
   * Cooked on an earlier day and eaten again (作り置き). Never in model output; set when an
   * existing plan is checked. Counts as REHEAT_MINUTES and is not checked again for repeats,
   * restrictions or perishables.
   */
  made_ahead?: boolean;
}

export interface GeneratedDay {
  date: string;
  dishes: GeneratedDish[];
}

export interface GeneratedPlan {
  days: GeneratedDay[];
}

// --- two-stage generation ---------------------------------------------------
// Stage 1 decides every day's dishes at once (cheap, fast, keeps cross-day rules);
// stage 2 fills in ingredients and steps for each day in parallel.

export interface OutlineDish {
  title: string;
  course: Course;
  cook_minutes: number;
  /** Main ingredients only (3-5), no seasonings. Used for restriction and leftover checks. */
  main_ingredients: string[];
  uses_leftovers: string[];
}

export interface OutlineDay {
  date: string;
  dishes: OutlineDish[];
}

export interface PlanOutline {
  days: OutlineDay[];
}

export interface DishDetail {
  title: string;
  ingredients: GeneratedIngredient[];
  steps: string[];
}

export interface DayDetail {
  dishes: DishDetail[];
}
