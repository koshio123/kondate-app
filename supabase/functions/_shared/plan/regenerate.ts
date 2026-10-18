// Re-suggests one day, or one dish of a day, of a plan that is already proposed or confirmed.
// The rest of the plan stays as it is and is given to the model as context, so the
// cross-day rules (no repeats, protein and cooking method vary, perishables early) still hold.
// Same two stages as a full generation: decide the dishes, then write ingredients and steps.

import { type CallModel, DEFAULT_EFFORT, type Effort, MALFORMED, retryLoop, type Attempt } from "./generate.ts";
import { normalizeFoodName } from "./normalize.ts";
import { buildDayDetailPrompt } from "./prompt.ts";
import { DAY_DETAIL_SCHEMA, DISHES_OUTLINE_SCHEMA } from "./schema.ts";
import type { Course, DayDetail, DayMode, GeneratedDish, OutlineDay, OutlineDish, PlanInput } from "./types.ts";
import {
  type Issue,
  mergeOutline,
  outlineAsPlan,
  REHEAT_MINUTES,
  validateDayDetail,
  validatePlan,
} from "./validate.ts";

/** A dish already in the plan. main_ingredients are its non-pantry ingredients. */
export interface CurrentDish {
  /** planned_dishes.id; needed to find the make-ahead dishes of a dish. */
  id?: string;
  title: string;
  course: Course;
  cook_minutes: number;
  main_ingredients: string[];
  /** Set on a make-ahead dish (作り置き): the dish of the day it is cooked. */
  madeOn?: { id: string; date: string };
}

export interface CurrentDay {
  date: string;
  mode: DayMode;
  dishes: CurrentDish[];
}

export interface RegenerateRequest {
  /** The plan's conditions. leftovers should be the ones still unused. */
  input: PlanInput;
  /** Every day of the plan as it is now. */
  current: CurrentDay[];
  date: string;
  /** Index (in current[date].dishes) of the dish to replace; omitted = the whole day. */
  dishIndex?: number;
  /** Free text such as 「魚以外で」「もっとさっぱり」. */
  hint?: string;
}

export interface RegenerateResult {
  /** The new dishes (one for a dish, all of them for a day), or null on failure. */
  dishes: GeneratedDish[] | null;
  /** Warnings about the re-suggested day (replace the day's previous warnings). */
  warnings: Issue[];
  attempts: Attempt[];
  retries: number;
  totalMs: number;
  failure: string | null;
}

export interface RegenerateOptions {
  effort?: { outline?: Effort; detail?: Effort };
  maxRetries?: number;
  now?: () => number;
}

export async function regenerate(
  request: RegenerateRequest,
  callModel: CallModel,
  options: RegenerateOptions = {},
): Promise<RegenerateResult> {
  const now = options.now ?? Date.now;
  const started = now();
  const attempts: Attempt[] = [];
  const done = (partial: Pick<RegenerateResult, "dishes" | "warnings" | "failure">): RegenerateResult => ({
    ...partial,
    attempts,
    retries: attempts.length - new Set(attempts.map((a) => a.stage)).size,
    totalMs: now() - started,
  });

  const target = request.current.find((d) => d.date === request.date);
  if (!target || target.mode === "none") {
    return done({ dishes: null, warnings: [], failure: `${request.date} は献立を作る日ではありません` });
  }
  const replaced = replacedDishes(request, target);
  if (replaced.length === 0) {
    const failure =
      request.dishIndex === undefined ? "作り置き以外に作り直す料理がありません" : "作り直す料理が見つかりません";
    return done({ dishes: null, warnings: [], failure });
  }

  // Stage 1: the new dishes
  const prompt = buildRegenerateOutlinePrompt(request, target);
  const outlineLoop = await retryLoop<{ dishes: OutlineDish[] }>({
    stage: "outline",
    effort: options.effort?.outline ?? DEFAULT_EFFORT.outline,
    system: prompt.system,
    user: prompt.user,
    schema: DISHES_OUTLINE_SCHEMA,
    callModel,
    maxRetries: options.maxRetries ?? 2,
    now,
    check: (reply) =>
      Array.isArray(reply.dishes) ? checkOutline(request, target, replaced, reply.dishes).violations : [MALFORMED],
  });
  attempts.push(...outlineLoop.attempts);
  if (!outlineLoop.value) {
    return done({ dishes: null, warnings: [], failure: `新しい案を作れませんでした: ${outlineLoop.failure}` });
  }
  const newDishes = outlineLoop.value.dishes;

  // Stage 2: ingredients and steps for the new dishes only
  const outlineDay: OutlineDay = { date: request.date, dishes: newDishes };
  const detailPrompt = buildDayDetailPrompt(request.input, outlineDay);
  const detailLoop = await retryLoop<DayDetail>({
    stage: `detail:${request.date}`,
    effort: options.effort?.detail ?? DEFAULT_EFFORT.detail,
    system: detailPrompt.system,
    user: detailPrompt.user,
    schema: DAY_DETAIL_SCHEMA,
    callModel,
    maxRetries: Math.min(1, options.maxRetries ?? 2),
    now,
    check: (detail) =>
      Array.isArray(detail.dishes) ? validateDayDetail(request.input, outlineDay, detail) : [MALFORMED],
  });
  attempts.push(...detailLoop.attempts);
  if (!detailLoop.value) {
    return done({ dishes: null, warnings: [], failure: `材料と手順を作れませんでした: ${detailLoop.failure}` });
  }

  const dishes = mergeOutline({ days: [outlineDay] }, new Map([[request.date, detailLoop.value]])).days[0]!.dishes;
  // Warnings with full ingredients (perishables late in the period, avoided foods, repeats).
  const { warnings } = checkDay(request, target, dishes);
  return done({ dishes, warnings, failure: null });
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * The dishes a request replaces: one dish, or every dish of the day except its make-ahead
 * dishes, which stay (replace_planned_dishes keeps them too).
 */
export function replacedDishes(request: RegenerateRequest, target: CurrentDay): CurrentDish[] {
  return request.dishIndex === undefined
    ? target.dishes.filter((d) => !d.madeOn)
    : target.dishes.filter((_, i) => i === request.dishIndex);
}

/** Later days that eat a replaced dish as make-ahead, by course (the new dish of that course follows). */
function followerDates(request: RegenerateRequest, replaced: CurrentDish[]): Map<Course, string[]> {
  const ids = new Map(replaced.filter((d) => d.id).map((d) => [d.id!, d.course]));
  const byCourse = new Map<Course, string[]>();
  for (const day of request.current) {
    for (const dish of day.dishes) {
      const course = dish.madeOn ? ids.get(dish.madeOn.id) : undefined;
      if (course) byCourse.set(course, [...(byCourse.get(course) ?? []), day.date]);
    }
  }
  return byCourse;
}

/** Stage 1 check: the day with the new dishes in place must follow every rule of a full plan. */
export function checkOutline(
  request: RegenerateRequest,
  target: CurrentDay,
  replaced: CurrentDish[],
  dishes: OutlineDish[],
): { violations: Issue[]; warnings: Issue[] } {
  const violations: Issue[] = [];
  if (dishes.length === 0) {
    violations.push({ code: "DAY_EMPTY", date: request.date, message: "料理が1品もありません" });
  }
  if (request.dishIndex !== undefined) {
    const old = replaced[0]!;
    if (dishes.length !== 1) {
      violations.push({
        code: "DETAIL_MISMATCH",
        date: request.date,
        message: `作り直すのは1品だけです(${dishes.length} 品あります)`,
      });
    } else if (target.mode === "normal" && dishes[0]!.course !== old.course) {
      violations.push({
        code: "COURSE_MISMATCH",
        date: request.date,
        dish: dishes[0]!.title,
        message: `「${old.title}」の代わりなので、区分は ${old.course} にしてください(${dishes[0]!.course} になっています)`,
      });
    }
  }
  const before = new Set(replaced.filter((d) => d.course !== "staple").map((d) => normalizeFoodName(d.title)));
  for (const dish of dishes) {
    if (dish.course !== "staple" && before.has(normalizeFoodName(dish.title))) {
      violations.push({
        code: "SAME_AS_BEFORE",
        date: request.date,
        dish: dish.title,
        message: `「${dish.title}」は作り直す前と同じ料理です。別の料理にしてください`,
      });
    }
  }
  const asGenerated: GeneratedDish[] = outlineAsPlan({ days: [{ date: request.date, dishes }] }).days[0]!.dishes;
  const day = checkDay(request, target, asGenerated);
  return { violations: [...violations, ...day.violations], warnings: day.warnings };
}

/**
 * Validates the whole plan with the new dishes in place and keeps the issues about this day
 * (or about the new dishes, for repeats across days).
 */
function checkDay(
  request: RegenerateRequest,
  target: CurrentDay,
  newDishes: GeneratedDish[],
): { violations: Issue[]; warnings: Issue[] } {
  const current = target.dishes.map(asGeneratedDish);
  const dayDishes =
    request.dishIndex === undefined
      ? [...newDishes, ...current.filter((d) => d.made_ahead)]
      : [...current.slice(0, request.dishIndex), ...newDishes, ...current.slice(request.dishIndex + 1)];

  // Make-ahead dishes of a replaced dish become the new dish of the same course.
  const replacedIds = new Set(replacedDishes(request, target).flatMap((d) => (d.id ? [d.id] : [])));
  const follow = (dish: CurrentDish): GeneratedDish => {
    const next = dish.madeOn && replacedIds.has(dish.madeOn.id) ? newDishes.find((n) => n.course === dish.course) : undefined;
    return next ? { ...next, made_ahead: true } : asGeneratedDish(dish);
  };

  const plan = {
    days: request.current
      .filter((d) => d.mode !== "none")
      .map((d) => ({
        date: d.date,
        dishes: d.date === request.date ? dayDishes : d.dishes.map(follow),
      })),
  };
  // Leftover checks are about the whole period; a single day is not expected to use them all.
  const result = validatePlan({ ...request.input, leftovers: [] }, plan);
  const newTitles = new Set(newDishes.map((d) => d.title));
  const relevant = (issue: Issue) =>
    issue.date === request.date || (issue.date === undefined && issue.dish !== undefined && newTitles.has(issue.dish));
  return { violations: result.violations.filter(relevant), warnings: result.warnings.filter(relevant) };
}

function asGeneratedDish(dish: CurrentDish): GeneratedDish {
  return {
    title: dish.title,
    course: dish.course,
    cook_minutes: dish.cook_minutes,
    ingredients: dish.main_ingredients.map((name) => ({ name, amount: null, unit: "", is_pantry: false })),
    steps: [],
    uses_leftovers: [],
    made_ahead: Boolean(dish.madeOn),
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export function buildRegenerateOutlinePrompt(
  request: RegenerateRequest,
  target: CurrentDay,
): { system: string; user: string } {
  const { input } = request;
  const single = request.dishIndex !== undefined;
  const old = single ? target.dishes[request.dishIndex!]! : null;
  const replaced = replacedDishes(request, target);
  const madeAheadFor = [...followerDates(request, replaced)].map(([course, dates]) => ({ course, dates }));

  const system = [
    `あなたは日本の家庭の夕食献立を考えるアシスタントです。
決まっている献立の一部を、別の料理に作り直します。入力(JSON)の条件をすべて守ってください。
材料の分量と手順は後で別に作るので、ここでは料理名・区分・調理時間・主な食材だけを決めます。`,
    `# 作り直すもの
- replace が "dish" のとき: replaceDish の代わりになる1品だけを dishes に出力する。
  通常(normal)の日は区分(course)を replaceDish と同じにする。keepDishes とは同じ日に食べるので、味付け・食材が合うようにし、同じ食材を重ねない。
- replace が "day" のとき: keepDishes 以外の料理をすべて新しく作り、dishes に出力する。
  keepDishes は前の日に作った作り置きで、そのまま食べる。normal の日は keepDishes と合わせて区分がそろうようにし、keepDishes と同じ区分の料理は出力しない。
- before にある料理とは別の料理にする。hint があれば最優先で反映する。
- madeAheadFor にある区分の料理は、多めに作って dates の日にも食べる(作り置き)。冷蔵で日持ちし、温め直してもおいしい料理にする。`,
    `# 日ごとのモード
- normal: 主食(staple)・主菜(main)・副菜(side)・汁物(soup)を1品ずつ。主食は基本「ご飯」。
- quick: その日の全料理の cook_minutes の合計を quickMaxMinutes 分以内にする(keepDishes の分も含む。作り置きは温めるだけなので 5 分と数える)。品数は自由。`,
    `# 食べられないもの(restrictions)
- kind が allergy または never の食材は、絶対に使わない。その食材を含む加工品(例: 卵→マヨネーズ、乳→バター・チーズ、小麦→パン粉・小麦粉)も使わない。
- kind が avoid の食材は、なるべく使わない。`,
    `# 献立づくりの方針
- 買い出しは期間の初日の前に1回だけ。dayNumber(期間の何日目か)が4以上なら、生の魚介・ひき肉・葉物野菜は使わず、日持ちする食材を中心にする。
- otherDays の料理・recentTitles と同じ料理は避ける。前後の日と主菜のたんぱく源・調理法が重ならないようにする。
- leftovers(まだ使っていない余り物)は、合うなら使い、使ったものは uses_leftovers に入力と同じ表記で入れる。
- 日本の一般的なスーパーで手に入る食材を使う。`,
    `# 書き方
- main_ingredients には主な食材を3〜5個入れる(調味料は入れない)。
- cook_minutes は下ごしらえを含む実際の時間。ご飯の cook_minutes は 0 とする。
- 料理名は具体的にする(例:「卵とじ丼」ではなく「豚肉と玉ねぎの卵とじ丼」)。`,
  ].join("\n\n");

  const start = [...input.days.map((d) => d.date)].sort()[0] ?? request.date;
  const payload = {
    replace: single ? "dish" : "day",
    date: request.date,
    mode: target.mode,
    dayNumber: daysBetween(start, request.date) + 1,
    replaceDish: old ? summary(old) : undefined,
    keepDishes: target.dishes.filter((d) => !replaced.includes(d)).map(summary),
    madeAheadFor: madeAheadFor.length > 0 ? madeAheadFor : undefined,
    before: replaced.map((d) => d.title),
    hint: request.hint?.trim() || undefined,
    otherDays: request.current
      .filter((d) => d.date !== request.date && d.mode !== "none")
      .map((d) => ({
        date: d.date,
        dishes: d.dishes.map(
          (x) => `${x.title}(${x.main_ingredients.join("・")})${x.madeOn ? `[${x.madeOn.date}の作り置き]` : ""}`,
        ),
      })),
    servings: input.servings,
    quickMaxMinutes: input.quickMaxMinutes,
    restrictions: input.restrictions.map(({ label, kind }) => ({ label, kind })),
    leftovers: input.leftovers,
    recentTitles: input.recentTitles,
    request: input.request ?? "",
  };
  return {
    system,
    user: `次の条件で${single ? "1品" : "この日の献立"}を作り直してください。\n\n${JSON.stringify(payload, null, 2)}`,
  };
}

function summary(dish: CurrentDish) {
  return {
    title: dish.title,
    course: dish.course,
    cook_minutes: dish.madeOn ? REHEAT_MINUTES : dish.cook_minutes,
    main_ingredients: dish.main_ingredients,
    madeAheadOn: dish.madeOn?.date,
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

