// Builds the shopping list from a confirmed plan (docs/02_design.md "6. 買い物リスト生成").
// Pure functions: the screen loads the rows, this module decides what to buy.

export interface IngredientMaster {
  id: string;
  name: string;
  category_id: string;
  base_unit: string;
  grams_per_piece: number | null;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

/** One ingredient line of one dish in the plan (none days already excluded). */
export interface UsageRow {
  dishTitle: string;
  raw_name: string;
  amount: number | null;
  unit: string;
  is_pantry: boolean;
  ingredient: IngredientMaster | null;
}

export interface LeftoverRow {
  raw_name: string;
  amount: number | null;
  unit: string;
}

export interface ShoppingItemDraft {
  /** Stable per ingredient, so a rebuilt list keeps what was already checked. */
  key: string;
  ingredient_id: string | null;
  display_name: string;
  category_id: string;
  amount: number | null;
  unit: string;
  note: string;
  is_pantry: boolean;
  position: number;
}

// ---------------------------------------------------------------------------
// Names and units
// ---------------------------------------------------------------------------

const FREE_OF = /不使用|なし|無し|抜き|除去|フリー|free/i;

export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\(([^)]*)\)/g, (note, inner: string) => (FREE_OF.test(inner) ? "" : note))
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Text shown on the list: notes in brackets are dropped ("鶏もも肉(皮なし)" -> "鶏もも肉"). */
function displayName(raw: string): string {
  return (
    raw
      .normalize("NFKC")
      .replace(/\([^)]*\)/g, "")
      .trim() || raw
  );
}

const UNIT_ALIASES: Record<string, string> = {
  かけ: "片",
  cc: "ml",
  mL: "ml",
  ML: "ml",
  グラム: "g",
  キロ: "kg",
  リットル: "l",
  L: "l",
  コ: "個",
  ケ: "個",
  ヶ: "個",
  つ: "個",
};

/** Units that name a quantity that cannot be summed ("少々", "適量", "ひとつまみ"). */
const VAGUE_UNITS = new Set(["少々", "適量", "ひとつまみ", "お好みで", "適宜"]);

/** Converts to a canonical unit: g, ml, or a counting unit (個, 本, 玉, ...). */
function canonical(amount: number, rawUnit: string): { amount: number; unit: string } {
  const unit = UNIT_ALIASES[rawUnit] ?? rawUnit;
  switch (unit) {
    case "kg":
      return { amount: amount * 1000, unit: "g" };
    case "l":
      return { amount: amount * 1000, unit: "ml" };
    case "大さじ":
      return { amount: amount * 15, unit: "ml" };
    case "小さじ":
      return { amount: amount * 5, unit: "ml" };
    case "カップ":
      return { amount: amount * 200, unit: "ml" };
    default:
      return { amount, unit };
  }
}

const COUNT_UNITS = new Set([
  "個",
  "本",
  "玉",
  "束",
  "枚",
  "丁",
  "袋",
  "切れ",
  "パック",
  "尾",
  "片",
  "缶",
  "株",
  "房",
  "合",
]);

/** Expresses grams in the master's counting unit when the master knows the weight per piece. */
function toMasterUnit(
  q: { amount: number; unit: string },
  master: IngredientMaster | null,
): { amount: number; unit: string } {
  if (!master?.grams_per_piece || !COUNT_UNITS.has(master.base_unit)) return q;
  if (q.unit === "g") return { amount: q.amount / master.grams_per_piece, unit: master.base_unit };
  return q;
}

/** Rounds up to an amount you can buy: 1/4 for pieces, 10 for g/ml above 10. */
function roundForPurchase(amount: number, unit: string): number {
  if (unit === "g" || unit === "ml")
    return amount > 10 ? Math.ceil(amount / 10) * 10 : Math.ceil(amount);
  return Math.ceil(amount * 4 - 1e-9) / 4;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Fallback when an ingredient is not in the master yet. First match wins. */
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["冷凍食品", ["冷凍"]],
  [
    "魚",
    [
      "鮭",
      "さけ",
      "サーモン",
      "鯖",
      "さば",
      "ぶり",
      "鰤",
      "たら",
      "鱈",
      "あじ",
      "いわし",
      "さんま",
      "まぐろ",
      "えび",
      "海老",
      "いか",
      "たこ",
      "あさり",
      "しじみ",
      "ほたて",
      "刺身",
      "しらす",
      "ちりめん",
    ],
  ],
  [
    "肉",
    ["肉", "ひき肉", "ミンチ", "ベーコン", "ハム", "ソーセージ", "ウインナー", "手羽", "ささみ"],
  ],
  ["卵・乳製品", ["卵", "たまご", "牛乳", "チーズ", "バター", "ヨーグルト", "生クリーム"]],
  [
    "豆腐・練り物",
    [
      "豆腐",
      "厚揚げ",
      "油揚げ",
      "納豆",
      "ちくわ",
      "かまぼこ",
      "はんぺん",
      "こんにゃく",
      "しらたき",
      "さつま揚げ",
    ],
  ],
  [
    "パン・米・麺",
    ["パン", "米", "うどん", "そば", "パスタ", "スパゲッティ", "麺", "ラーメン", "餃子の皮"],
  ],
  [
    "調味料・乾物",
    [
      "醤油",
      "しょうゆ",
      "味噌",
      "みそ",
      "塩",
      "砂糖",
      "酢",
      "みりん",
      "酒",
      "油",
      "ソース",
      "ケチャップ",
      "マヨネーズ",
      "だし",
      "コンソメ",
      "鶏がら",
      "豆板醤",
      "粉",
      "わかめ",
      "昆布",
      "ごま",
      "缶",
      "ツナ",
      "春雨",
      "切り干し",
      "ひじき",
      "海苔",
      "のり",
      "かつお節",
      "おかか",
      "カレールウ",
      "キムチ",
    ],
  ],
];

function guessCategory(name: string, categories: Category[]): string {
  const byName = new Map(categories.map((c) => [c.name, c.id]));
  const n = normalizeName(name);
  for (const [category, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => n.includes(normalizeName(w))) && byName.has(category))
      return byName.get(category)!;
  }
  // Names without any keyword are mostly vegetables (ごぼう, れんこん, ...) missing from the master.
  return byName.get("野菜・果物") ?? byName.get("その他") ?? categories[0]!.id;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface Group {
  key: string;
  name: string;
  master: IngredientMaster | null;
  pantry: boolean;
  dishes: Set<string>;
  quantities: Map<string, number>;
}

export function buildShoppingList(
  usages: UsageRow[],
  leftovers: LeftoverRow[],
  categories: Category[],
): ShoppingItemDraft[] {
  const groups = new Map<string, Group>();

  for (const row of usages) {
    const key = row.ingredient ? `i:${row.ingredient.id}` : `n:${normalizeName(row.raw_name)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: row.ingredient?.name ?? displayName(row.raw_name),
        master: row.ingredient,
        pantry: row.is_pantry,
        dishes: new Set(),
        quantities: new Map(),
      };
      groups.set(key, group);
    }
    // Something you need to buy for one dish is not a pantry item for the list.
    group.pantry = group.pantry && row.is_pantry;
    group.dishes.add(row.dishTitle);
    if (row.amount === null || row.amount <= 0 || VAGUE_UNITS.has(row.unit)) continue;
    const q = toMasterUnit(canonical(row.amount, row.unit), row.ingredient);
    group.quantities.set(q.unit, (group.quantities.get(q.unit) ?? 0) + q.amount);
  }

  // Subtract leftovers used by the plan.
  const notes = new Map<string, string[]>();
  for (const leftover of leftovers) {
    const name = normalizeName(leftover.raw_name);
    const group = [...groups.values()].find(
      (g) => normalizeName(g.name) === name || g.key === `n:${name}`,
    );
    if (!group || group.pantry) continue;
    const list = notes.get(group.key) ?? [];
    if (leftover.amount === null || leftover.amount <= 0) {
      list.push("余り物が家にあるかも");
    } else {
      const have = toMasterUnit(canonical(leftover.amount, leftover.unit), group.master);
      const need = group.quantities.get(have.unit);
      if (need === undefined) {
        list.push(`家に${formatQuantity(have.amount, have.unit)}あり`);
      } else {
        const rest = need - have.amount;
        list.push(
          `必要${formatQuantity(need, have.unit)}のうち${formatQuantity(Math.min(need, have.amount), have.unit)}は家にあり`,
        );
        if (rest <= 1e-9) group.quantities.delete(have.unit);
        else group.quantities.set(have.unit, rest);
        if (group.quantities.size === 0) groups.delete(group.key);
      }
    }
    notes.set(group.key, list);
  }

  const categoryOrder = new Map(categories.map((c) => [c.id, c.sort_order]));
  const pantryLast = Math.max(0, ...categories.map((c) => c.sort_order)) + 1;

  const items = [...groups.values()].map((group): ShoppingItemDraft => {
    const quantities = [...group.quantities.entries()].map(([unit, amount]) => ({
      unit,
      amount: roundForPurchase(amount, unit),
    }));
    const single = quantities.length === 1 ? quantities[0]! : null;
    const dishNote =
      group.dishes.size >= 2
        ? `${[...group.dishes].slice(0, 3).join("・")}${group.dishes.size > 3 ? " ほか" : ""}の${group.dishes.size}品分`
        : "";
    return {
      key: group.key,
      ingredient_id: group.master?.id ?? null,
      display_name: group.name,
      category_id: group.master?.category_id ?? guessCategory(group.name, categories),
      amount: group.pantry ? null : (single?.amount ?? null),
      unit: group.pantry
        ? ""
        : single
          ? single.unit
          : quantities.map((q) => formatQuantity(q.amount, q.unit)).join("+"),
      note: [...(notes.get(group.key) ?? []), ...(group.pantry ? [] : [dishNote])]
        .filter(Boolean)
        .join(" / "),
      is_pantry: group.pantry,
      position: 0,
    };
  });

  items.sort((a, b) => {
    const ca = a.is_pantry ? pantryLast : (categoryOrder.get(a.category_id) ?? pantryLast);
    const cb = b.is_pantry ? pantryLast : (categoryOrder.get(b.category_id) ?? pantryLast);
    return ca - cb || a.display_name.localeCompare(b.display_name, "ja");
  });
  return items.map((item, position) => ({ ...item, position }));
}

/** 0.5 + "玉" -> "1/2玉", 300 + "g" -> "300g" */
export function formatQuantity(amount: number, unit: string): string {
  const fractions: Record<string, string> = { "0.25": "1/4", "0.5": "1/2", "0.75": "3/4" };
  const whole = Math.floor(amount);
  const frac = Math.round((amount - whole) * 100) / 100;
  const fracText = fractions[String(frac)];
  if (fracText && whole === 0) return `${fracText}${unit}`;
  if (fracText) return `${whole}と${fracText}${unit}`;
  return `${Math.round(amount * 100) / 100}${unit}`;
}
