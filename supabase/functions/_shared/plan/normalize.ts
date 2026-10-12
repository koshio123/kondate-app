import type { RestrictionInput } from "./types.ts";

const FREE_OF = /不使用|なし|無し|抜き|除去|フリー|free/i;

/**
 * Normalizes a food name for matching: NFKC (full/half width), "free of X" notes removed,
 * katakana -> hiragana, whitespace removed. "タマゴ" and "たまご" become equal; "卵" stays a separate spelling
 * and is matched through aliases.
 */
export function normalizeFoodName(value: string): string {
  return value
    .normalize("NFKC")
    // A note that says the item is free of something ("固形コンソメ(セロリ不使用のもの)") must not
    // match that something. Other notes stay: "ドレッシング(卵入り)" must still match 卵.
    .replace(/\(([^)]*)\)|【([^】]*)】/g, (note, a, b) => (FREE_OF.test(a ?? b ?? "") ? "" : note))
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * Ingredients that commonly hide the 8 mandatory allergens (特定原材料). Not exhaustive:
 * it is a safety net on top of the prompt, so the LLM is still told to avoid processed foods
 * that contain the allergen.
 */
const HIDDEN_ALLERGEN_SOURCES: Record<string, string[]> = {
  卵: ["たまご", "玉子", "鶏卵", "マヨネーズ", "卵黄", "卵白"],
  乳: ["牛乳", "バター", "チーズ", "生クリーム", "ヨーグルト", "練乳", "スキムミルク", "粉チーズ"],
  小麦: ["小麦粉", "薄力粉", "強力粉", "パン粉", "パン", "うどん", "パスタ", "スパゲッティ", "中華麺", "餃子の皮", "天ぷら粉", "カレールウ", "シチュールウ"],
  そば: ["蕎麦"],
  落花生: ["ピーナッツ", "ピーナツ"],
  えび: ["海老", "エビ", "桜えび"],
  かに: ["蟹", "カニ", "かにかま"],
  くるみ: ["胡桃", "クルミ"],
};

/** All spellings that should match a restriction. */
export function restrictionTerms(restriction: RestrictionInput): string[] {
  const terms = [restriction.label, ...(restriction.aliases ?? [])];
  if (restriction.kind === "allergy") {
    terms.push(...(HIDDEN_ALLERGEN_SOURCES[restriction.label] ?? []));
  }
  return [...new Set(terms.map(normalizeFoodName).filter((t) => t.length > 0))];
}

/** True if `name` contains any of the (already normalized) terms. */
export function containsAnyTerm(name: string, normalizedTerms: string[]): boolean {
  const normalized = normalizeFoodName(name);
  return normalizedTerms.some((term) => normalized.includes(term));
}
