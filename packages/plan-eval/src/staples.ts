import {
  containsAnyTerm,
  normalizeFoodName,
  restrictionTerms,
} from "../../../supabase/functions/_shared/plan/normalize.ts";
import type {
  GeneratedPlan,
  RestrictionInput,
} from "../../../supabase/functions/_shared/plan/types.ts";

/**
 * Ingredients a dish is expected to have, judged from its title ("ハンバーグ" -> 卵).
 * Used only by the evaluation, to catch recipes that quietly leave out a staple ingredient.
 * The generation itself does not check this: a dish can be made without them on purpose.
 */
export interface StapleRule {
  /** Matches the dish title (any of these, after normalization). */
  titles: string[];
  /** Titles that contain a pattern but are a different dish ("カツオ" is not "カツ"). */
  except?: string[];
  /** Each group needs at least one ingredient containing one of its names. */
  needs: string[][];
}

export const STAPLE_RULES: StapleRule[] = [
  {
    titles: ["ハンバーグ"],
    needs: [
      ["ひき肉", "びき肉", "挽き肉", "挽肉", "ミンチ", "豆腐"],
      ["卵", "たまご", "玉子"],
    ],
  },
  {
    titles: ["つくね", "肉団子", "ミートボール"],
    needs: [["卵", "たまご", "玉子", "片栗粉", "パン粉", "小麦粉", "豆腐"]],
  },
  {
    titles: ["唐揚げ", "から揚げ", "からあげ", "竜田揚げ"],
    needs: [["片栗粉", "小麦粉", "薄力粉", "唐揚げ粉"]],
  },
  {
    titles: ["カツ", "フライ"],
    except: ["カツオ", "かつお", "フライド", "フライパン"],
    needs: [
      ["パン粉"],
      ["小麦粉", "薄力粉", "バッター"],
      ["卵", "たまご", "玉子", "バッター", "マヨネーズ"],
    ],
  },
  { titles: ["天ぷら", "天丼", "かき揚げ"], needs: [["小麦粉", "薄力粉", "天ぷら粉"]] },
  { titles: ["親子丼"], needs: [["鶏"], ["卵", "たまご", "玉子"]] },
  {
    titles: [
      "他人丼",
      "卵とじ",
      "玉子とじ",
      "オムライス",
      "オムレツ",
      "茶碗蒸し",
      "卵焼き",
      "玉子焼き",
      "だし巻き",
      "かに玉",
      "天津飯",
    ],
    needs: [["卵", "たまご", "玉子"]],
  },
  { titles: ["チャーハン", "炒飯"], needs: [["卵", "たまご", "玉子"]] },
  { titles: ["カレー"], except: ["カレー粉", "カレー風味", "カレー炒め"], needs: [["カレー"]] },
  {
    titles: ["肉じゃが"],
    needs: [
      ["じゃがいも", "じゃが芋"],
      ["醤油", "しょうゆ"],
    ],
  },
  { titles: ["味噌汁", "みそ汁", "豚汁", "味噌煮", "みそ煮"], needs: [["味噌", "みそ"]] },
  { titles: ["生姜焼き", "しょうが焼き"], needs: [["生姜", "しょうが"]] },
  { titles: ["麻婆"], needs: [["豆板醤", "甜麺醤", "麻婆豆腐の素", "麻婆の素", "麻婆なすの素"]] },
  {
    titles: ["照り焼き"],
    needs: [
      ["醤油", "しょうゆ"],
      ["みりん", "砂糖", "はちみつ"],
    ],
  },
  { titles: ["ポテトサラダ", "ポテサラ"], needs: [["じゃがいも", "じゃが芋"], ["マヨネーズ"]] },
  { titles: ["餃子", "ぎょうざ"], needs: [["餃子の皮", "ぎょうざの皮", "皮"]] },
  {
    titles: ["グラタン", "クリームシチュー", "クリーム煮", "ホワイトソース"],
    needs: [["牛乳", "生クリーム", "豆乳"]],
  },
];

export interface StapleMiss {
  date: string;
  title: string;
  /** First name of each group that found no ingredient, e.g. ["卵"]. */
  missing: string[];
  ingredients: string[];
}

export interface StapleCheck {
  /** Dishes that matched at least one rule with a group left to check. */
  checked: number;
  misses: StapleMiss[];
}

const norm = (values: string[]) => values.map(normalizeFoodName);

/**
 * Checks every dish against STAPLE_RULES. A group is skipped when the family cannot or
 * would rather not eat it (any restriction kind), since leaving it out is then correct.
 */
export function checkStaples(
  plan: GeneratedPlan,
  restrictions: RestrictionInput[],
  rules: StapleRule[] = STAPLE_RULES,
): StapleCheck {
  const restricted = restrictions.map(restrictionTerms);
  const isRestricted = (group: string[]) =>
    restricted.some((terms) => group.some((name) => containsAnyTerm(name, terms)));

  let checked = 0;
  const misses: StapleMiss[] = [];
  for (const day of plan.days) {
    for (const dish of day.dishes) {
      const title = normalizeFoodName(dish.title);
      const groups = rules
        .filter(
          (rule) =>
            norm(rule.titles).some((t) => title.includes(t)) &&
            !norm(rule.except ?? []).some((t) => title.includes(t)),
        )
        .flatMap((rule) => rule.needs)
        .filter((group) => !isRestricted(group));
      if (groups.length === 0) continue;
      checked++;
      const names = dish.ingredients.map((i) => i.name);
      const missing = groups
        .filter((group) => !names.some((name) => containsAnyTerm(name, norm(group))))
        .map((group) => group[0]!);
      if (missing.length > 0) {
        misses.push({
          date: day.date,
          title: dish.title,
          missing: [...new Set(missing)],
          ingredients: names,
        });
      }
    }
  }
  return { checked, misses };
}
