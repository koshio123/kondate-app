import type { DayMode, PlanInput, RestrictionInput, RestrictionKind } from "./types.ts";

/** What generate-plan reads from the database, before shaping it into a PlanInput. */
export interface PlanContextRows {
  days: { date: string; mode: DayMode }[];
  memberCount: number;
  quickMaxMinutes: number | null;
  restrictions: { label: string; kind: RestrictionKind; aliases: string[] | null }[];
  leftovers: { raw_name: string; amount: number | null; unit: string }[];
  recentTitles: string[];
  request: string;
}

const STRENGTH: Record<RestrictionKind, number> = { avoid: 0, never: 1, allergy: 2 };

/**
 * Builds the generation input. When two family members restrict the same food, the stricter
 * rule wins (allergy > never > avoid). Everyone eats the same dinner, so servings = members.
 */
export function buildPlanInput(rows: PlanContextRows): PlanInput {
  const restrictions = new Map<string, RestrictionInput>();
  for (const r of rows.restrictions) {
    const label = r.label.trim();
    if (!label) continue;
    const existing = restrictions.get(label);
    const aliases = [...new Set([...(existing?.aliases ?? []), ...(r.aliases ?? [])])];
    const kind = existing && STRENGTH[existing.kind] >= STRENGTH[r.kind] ? existing.kind : r.kind;
    restrictions.set(label, { label, kind, aliases });
  }

  return {
    days: [...rows.days].sort((a, b) => a.date.localeCompare(b.date)),
    servings: Math.max(1, rows.memberCount),
    quickMaxMinutes: rows.quickMaxMinutes ?? 15,
    restrictions: [...restrictions.values()],
    leftovers: rows.leftovers.map((l) => ({ name: l.raw_name, amount: l.amount, unit: l.unit })),
    recentTitles: [...new Set(rows.recentTitles)],
    request: rows.request.trim() || undefined,
  };
}
