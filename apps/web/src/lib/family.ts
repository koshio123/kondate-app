// Family settings (S8): who eats, what they cannot eat. Pure helpers, no database access.

import { parseIsoDate } from "./date";
import { normalizeName } from "./shopping";

export type Sex = "male" | "female";
export type ActivityLevel = "low" | "normal" | "high";
export type RestrictionKind = "allergy" | "never" | "avoid";

export interface Member {
  id: string;
  name: string;
  birth_date: string | null;
  sex: Sex | null;
  activity_level: ActivityLevel;
}

export interface Restriction {
  id: string;
  member_id: string;
  label: string;
  kind: RestrictionKind;
}

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  low: "少ない",
  normal: "ふつう",
  high: "多い",
};

export const SEX_LABEL: Record<Sex, string> = { male: "男性", female: "女性" };

export const KIND_LABEL: Record<RestrictionKind, string> = {
  allergy: "アレルギー",
  never: "絶対NG",
  avoid: "なるべく避ける",
};

/** What each kind does when a plan is made (shown in the add sheet). */
export const KIND_HINT: Record<RestrictionKind, string> = {
  allergy: "加工品(卵→マヨネーズなど)も含めて必ず除外",
  never: "献立に入れない",
  avoid: "なるべく使わない(入ったときは注意を表示)",
};

/** Full years on `today` (both "YYYY-MM-DD"), or null without a birth date. */
export function ageOn(birthDate: string | null, today: string): number | null {
  if (!birthDate) return null;
  const birth = parseIsoDate(birthDate);
  const now = parseIsoDate(today);
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** "31歳・活動量 ふつう・性別 未設定" */
export function describeMember(member: Member, today: string): string {
  const age = ageOn(member.birth_date, today);
  return [
    age === null ? "年齢 未設定" : `${age}歳`,
    `活動量 ${ACTIVITY_LABEL[member.activity_level]}`,
    member.sex ? SEX_LABEL[member.sex] : "性別 未設定",
  ].join("・");
}

export interface RestrictionGroup {
  label: string;
  /** The strictest kind among the members (allergy > never > avoid), as used for plans. */
  kind: RestrictionKind;
  /** Members it applies to, in member order. */
  members: { id: string; name: string; kind: RestrictionKind }[];
  /** Row ids, to delete the whole group. */
  ids: string[];
}

const STRENGTH: Record<RestrictionKind, number> = { avoid: 0, never: 1, allergy: 2 };

/**
 * One entry per food (labels compared ignoring kana and width), strictest kind first.
 * Plans merge the family's restrictions the same way (supabase/functions/_shared/plan/context.ts).
 */
export function groupRestrictions(rows: Restriction[], members: Member[]): RestrictionGroup[] {
  const order = new Map(members.map((m, i) => [m.id, i]));
  const names = new Map(members.map((m) => [m.id, m.name]));
  const groups = new Map<string, RestrictionGroup>();
  for (const row of rows) {
    const key = normalizeName(row.label);
    const group = groups.get(key) ?? {
      label: row.label.trim(),
      kind: row.kind,
      members: [],
      ids: [],
    };
    if (STRENGTH[row.kind] > STRENGTH[group.kind]) group.kind = row.kind;
    group.members.push({
      id: row.member_id,
      name: names.get(row.member_id) ?? "?",
      kind: row.kind,
    });
    group.ids.push(row.id);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.members.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  return [...groups.values()].sort(
    (a, b) => STRENGTH[b.kind] - STRENGTH[a.kind] || a.label.localeCompare(b.label, "ja"),
  );
}

/** Trims and limits a food name typed by the user; empty means invalid. */
export function cleanLabel(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 40);
}

export const QUICK_MIN = 5;
export const QUICK_MAX = 60;
export const QUICK_STEP = 5;

export function stepQuickMinutes(current: number, direction: 1 | -1): number {
  const next = Math.round((current + direction * QUICK_STEP) / QUICK_STEP) * QUICK_STEP;
  return Math.min(QUICK_MAX, Math.max(QUICK_MIN, next));
}
