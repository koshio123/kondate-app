import type { LeftoverInput, OutlineDay, PlanInput } from "./types.ts";

/** Bump when the wording changes so evaluation reports can be compared. */
export const PROMPT_VERSION = "2026-10-18.1";

const ROLE = `あなたは日本の家庭の夕食献立を考えるアシスタントです。
入力(JSON)の条件をすべて守ってください。`;

const MODE_RULES = `# 日ごとのモード
- normal: 主食(staple)・主菜(main)・副菜(side)・汁物(soup)を1品ずつ。主食は基本「ご飯」。
- quick: その日の全料理の cook_minutes の合計を quickMaxMinutes 分以内にする。品数は自由。
  丼・麺などの一品料理(one_dish)、レンジ調理、和えるだけの副菜、具だくさんの汁物を活用する。
  各料理の cook_minutes は、慣れていない人でも守れる現実的な時間にする。
- none: 献立を作らない。出力の days に含めない。`;

const RESTRICTION_RULES = `# 食べられないもの(restrictions)
- kind が allergy または never の食材は、絶対に使わない。その食材を含む加工品も使わない。
- kind が avoid の食材は、なるべく使わない。`;

const LEFTOVER_RULES = `# 余り物(leftovers)
- できるだけすべて使い切る。期間の前半の日に優先して使う。
- 使った余り物は、その料理の uses_leftovers に入力と同じ表記で入れる。`;

const PLANNING_RULES = `# 献立づくりの方針
- 買い出しは期間の初日の前に1回だけ行う。生の魚介・ひき肉・葉物野菜は期間の1〜3日目(none の日も日数に数える)に使い、4日目以降は日持ちする食材(根菜、卵、豆腐以外の大豆製品、缶詰、冷凍食品、塊肉など)を中心にする。
- 主菜のたんぱく源(肉・魚・卵・大豆製品)と調理法(焼く・煮る・炒める・揚げる・蒸す)が続けて重ならないようにする。
- recentTitles と同じ料理は避ける。期間内でも同じ料理を繰り返さない。同じ食材を同じ日の2品に使わない。
- 和食・洋食・中華の組み合わせは、主菜に合う副菜と汁物にする。
- 日本の一般的なスーパーで手に入る食材を使う。
- 主菜には肉・魚・卵・大豆製品のいずれかを使う。副菜・汁物で野菜をとれるようにする。
- request があれば、条件に反しない範囲で反映する。`;

const DETAIL_RULES = `# 分量と書き方
- 分量は servings 人分。調味料は大さじ・小さじ、それ以外は g・ml・個・本・束・枚・丁・袋・切れ・パックなどで書く。「少々」「適量」は amount を null にして unit に書く。
- 塩・醤油・味噌・砂糖・みりん・酒・酢・油・ごま油・片栗粉・小麦粉・だしの素・こしょう・米は is_pantry を true にする。
- ご飯(主食や丼のご飯)は ingredients に「米」を servings × 0.5 合(単位「合」)で入れる。「ご飯 ◯杯」とは書かない。
- 食材名は商品名だけを書き、括弧書きの注記(「〜不使用」など)は付けない。
- 水は材料には含めない。
- 手順は各1文とする。料理名・食材名は日本語。`;

/** One-shot: all days with ingredients and steps in a single call (kept for comparison). */
export function buildPlanPrompt(input: PlanInput): { system: string; user: string } {
  const system = [
    `${ROLE}\n指定された日の夕食献立を、材料と手順まで作ってください。`,
    MODE_RULES,
    RESTRICTION_RULES,
    LEFTOVER_RULES,
    PLANNING_RULES,
    DETAIL_RULES,
    "- cook_minutes は下ごしらえを含む実際の時間。ご飯の cook_minutes は 0 とする(炊飯は別に行う)。",
  ].join("\n\n");
  return { system, user: `次の条件で献立を作ってください。\n\n${conditions(input)}` };
}

/** Stage 1: dish names, courses, minutes and main ingredients for every day. */
export function buildOutlinePrompt(input: PlanInput): { system: string; user: string } {
  const system = [
    `${ROLE}\n指定された日の夕食献立の「骨組み」を作ってください。材料の分量と手順は後で別に作るので、ここでは料理名・区分・調理時間・主な食材だけを決めます。`,
    MODE_RULES,
    RESTRICTION_RULES,
    LEFTOVER_RULES,
    PLANNING_RULES,
    `# 書き方
- main_ingredients には主な食材を3〜5個入れる(調味料は入れない)。restrictions に当たる食材がないか、ここで確認する。
- cook_minutes は下ごしらえを含む実際の時間。ご飯の cook_minutes は 0 とする(炊飯は別に行う)。
- 料理名は具体的にする(例:「卵とじ丼」ではなく「豚肉と玉ねぎの卵とじ丼」)。`,
  ].join("\n\n");
  return { system, user: `次の条件で献立の骨組みを作ってください。\n\n${conditions(input)}` };
}

/** Stage 2: ingredients and steps for one day whose dishes are already decided. */
export function buildDayDetailPrompt(
  input: PlanInput,
  day: OutlineDay,
): { system: string; user: string } {
  const used = new Set(day.dishes.flatMap((d) => d.uses_leftovers));
  const leftovers: LeftoverInput[] = input.leftovers.filter((l) => used.has(l.name));
  const system = [
    `${ROLE}\n献立はすでに決まっています。指定された料理それぞれの材料と手順を抜け漏れなく作ってください。`,
    `# 守ること
- dishes は入力と同じ順番・同じ料理名で、すべての料理について出力する。
- main_ingredients は必ず使い、他に必要な材料（下味・つなぎ・衣などを含む）も含めること。
- uses_leftovers の余り物は、leftovers の量の範囲で使う。`,
    RESTRICTION_RULES,
    DETAIL_RULES,
  ].join("\n\n");
  const payload = {
    date: day.date,
    servings: input.servings,
    restrictions: input.restrictions.map(({ label, kind }) => ({ label, kind })),
    leftovers,
    dishes: day.dishes,
  };
  return {
    system,
    user: `次の料理の材料と手順を作ってください。\n\n${JSON.stringify(payload, null, 2)}`,
  };
}

/** Message appended when a reply breaks hard rules, to ask for a corrected one. */
export function buildRetryMessage(violations: { message: string }[]): string {
  const lines = violations.map((v) => `- ${v.message}`).join("\n");
  return `前回の出力には次の問題がありました。すべて直したうえで、最初から全体を出力し直してください。\n${lines}`;
}

function conditions(input: PlanInput): string {
  return JSON.stringify(
    {
      days: input.days,
      servings: input.servings,
      quickMaxMinutes: input.quickMaxMinutes,
      restrictions: input.restrictions.map(({ label, kind }) => ({ label, kind })),
      leftovers: input.leftovers,
      recentTitles: input.recentTitles,
      request: input.request ?? "",
    },
    null,
    2,
  );
}
