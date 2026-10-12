import type { PlanInput } from "./types.ts";

export const PROMPT_VERSION = "2026-10-12.1";

const SYSTEM_PROMPT = `あなたは日本の家庭の夕食献立を考えるアシスタントです。
入力(JSON)の条件をすべて守り、指定された日の夕食献立を作ってください。

# 日ごとのモード
- normal: 主食(staple)・主菜(main)・副菜(side)・汁物(soup)を1品ずつ。主食は基本「ご飯」。
- quick: その日の全料理の cook_minutes の合計を quickMaxMinutes 分以内にする。品数は自由。
  丼・麺などの一品料理(one_dish)、レンジ調理、和えるだけの副菜、具だくさんの汁物を活用する。
- none: 献立を作らない。出力の days に含めない。

# 食べられないもの(restrictions)
- kind が allergy または never の食材は、絶対に使わない。その食材を含む加工品(例: 卵→マヨネーズ、乳→バター・チーズ、小麦→パン粉・小麦粉)も使わない。
- kind が avoid の食材は、なるべく使わない。

# 余り物(leftovers)
- できるだけすべて使い切る。期間の前半の日に優先して使う。
- 使った余り物は、その料理の uses_leftovers に入力と同じ表記で入れる。

# 献立づくりの方針
- 魚・葉物野菜・ひき肉など傷みやすい食材は期間の前半に使う。
- 主菜のたんぱく源(肉・魚・卵・大豆製品)と調理法(焼く・煮る・炒める・揚げる・蒸す)が続けて重ならないようにする。
- recentTitles と同じ料理は避ける。期間内でも同じ料理を繰り返さない。
- 日本の一般的なスーパーで手に入る食材を使う。
- 主菜には肉・魚・卵・大豆製品のいずれかを使う。副菜・汁物で野菜をとれるようにする。
- request があれば、条件に反しない範囲で反映する。

# 分量と書き方
- 分量は servings 人分。調味料は大さじ・小さじ、それ以外は g・ml・個・本・束・枚・丁・袋などで書く。
- 塩・醤油・味噌・砂糖・みりん・酒・酢・油・ごま油・片栗粉・だしの素などの常備調味料は is_pantry を true にする。
- ご飯は ingredients に「米」を合単位で入れ、cook_minutes は 0 とする(炊飯は別に行う)。
- cook_minutes は下ごしらえを含む実際の時間。手順は各1文で6つ以内。
- 料理名・食材名は日本語。`;

/** Builds the system prompt and the user message (the conditions as JSON). */
export function buildPlanPrompt(input: PlanInput): { system: string; user: string } {
  const payload = {
    days: input.days,
    servings: input.servings,
    quickMaxMinutes: input.quickMaxMinutes,
    restrictions: input.restrictions.map(({ label, kind }) => ({ label, kind })),
    leftovers: input.leftovers,
    recentTitles: input.recentTitles,
    request: input.request ?? "",
  };
  return {
    system: SYSTEM_PROMPT,
    user: `次の条件で献立を作ってください。\n\n${JSON.stringify(payload, null, 2)}`,
  };
}

/** Message appended when a generated plan breaks hard rules, to ask for a corrected plan. */
export function buildRetryMessage(violations: { message: string }[]): string {
  const lines = violations.map((v) => `- ${v.message}`).join("\n");
  return `前回の献立には次の問題がありました。すべて直した献立を、最初からすべての日について作り直してください。\n${lines}`;
}
