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
}

export interface GeneratedDay {
  date: string;
  dishes: GeneratedDish[];
}

export interface GeneratedPlan {
  days: GeneratedDay[];
}
