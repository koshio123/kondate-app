import type { PlanInput } from "../../../supabase/functions/_shared/plan/types.ts";

export interface Scenario {
  id: string;
  title: string;
  input: PlanInput;
}

/**
 * Test conditions for comparing models. Restrictions here are test data, not the family's
 * real settings: they exist to check that hard rules are respected.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "week-mixed",
    title: "5日間(通常・時短・なし混在)+余り物4品",
    input: {
      days: [
        { date: "2026-10-13", mode: "normal" },
        { date: "2026-10-14", mode: "quick" },
        { date: "2026-10-15", mode: "none" },
        { date: "2026-10-16", mode: "normal" },
        { date: "2026-10-17", mode: "normal" },
      ],
      servings: 2,
      quickMaxMinutes: 15,
      restrictions: [],
      leftovers: [
        { name: "キャベツ", amount: 0.5, unit: "玉" },
        { name: "豚こま切れ肉", amount: 150, unit: "g" },
        { name: "卵", amount: 3, unit: "個" },
        { name: "しめじ", amount: 1, unit: "袋" },
      ],
      recentTitles: ["鮭のちゃんちゃん焼き", "肉じゃが", "豚汁"],
    },
  },
  {
    id: "allergy-7days",
    title: "7日間+卵アレルギー・苦手食材+リクエスト",
    input: {
      days: [
        { date: "2026-10-19", mode: "normal" },
        { date: "2026-10-20", mode: "normal" },
        { date: "2026-10-21", mode: "quick" },
        { date: "2026-10-22", mode: "normal" },
        { date: "2026-10-23", mode: "none" },
        { date: "2026-10-24", mode: "normal" },
        { date: "2026-10-25", mode: "quick" },
      ],
      servings: 2,
      quickMaxMinutes: 15,
      restrictions: [
        { label: "卵", kind: "allergy", aliases: ["たまご", "玉子"] },
        { label: "セロリ", kind: "never" },
        { label: "レバー", kind: "avoid" },
      ],
      leftovers: [
        { name: "大根", amount: 0.5, unit: "本" },
        { name: "牛乳", amount: 300, unit: "ml" },
      ],
      recentTitles: ["親子丼", "麻婆豆腐", "鶏の照り焼き"],
      request: "魚料理を2回入れて",
    },
  },
  {
    id: "busy-3days",
    title: "3日間すべて時短+余り物2品",
    input: {
      days: [
        { date: "2026-10-26", mode: "quick" },
        { date: "2026-10-27", mode: "quick" },
        { date: "2026-10-28", mode: "quick" },
      ],
      servings: 2,
      quickMaxMinutes: 15,
      restrictions: [],
      leftovers: [
        { name: "鶏むね肉", amount: 250, unit: "g" },
        { name: "もやし", amount: 1, unit: "袋" },
      ],
      recentTitles: [],
    },
  },
  {
    id: "classics",
    title: "5日間+定番料理のリクエスト(材料の抜けの確認)",
    input: {
      days: [
        { date: "2026-10-29", mode: "normal" },
        { date: "2026-10-30", mode: "normal" },
        { date: "2026-10-31", mode: "quick" },
        { date: "2026-11-01", mode: "normal" },
        { date: "2026-11-02", mode: "normal" },
      ],
      servings: 2,
      quickMaxMinutes: 15,
      restrictions: [],
      leftovers: [],
      recentTitles: [],
      request:
        "ハンバーグ、鶏の唐揚げ、親子丼、とんかつ、カレーライスを1回ずつ入れて。副菜にポテトサラダと卵焼きも入れて",
    },
  },
];
