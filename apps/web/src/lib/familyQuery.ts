// Data access for the settings screen (S8). RLS limits every row to the user's household.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHousehold } from "@/auth/useHousehold";
import type { ActivityLevel, Member, Restriction, RestrictionKind, Sex } from "./family";
import { supabase } from "./supabase";

const MEMBERS = ["members"] as const;
const RESTRICTIONS = ["restrictions"] as const;
const SETTINGS = ["household_settings"] as const;

export const DEFAULT_QUICK_MINUTES = 15;

export function useMembers() {
  return useQuery({
    queryKey: MEMBERS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, birth_date, sex, activity_level")
        .order("created_at");
      if (error) throw error;
      return data as Member[];
    },
  });
}

export function useRestrictions() {
  return useQuery({
    queryKey: RESTRICTIONS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_food_restrictions")
        .select("id, member_id, label, kind")
        .order("created_at");
      if (error) throw error;
      return data as Restriction[];
    },
  });
}

export function useHouseholdSettings() {
  return useQuery({
    queryKey: SETTINGS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_settings")
        .select("quick_mode_max_minutes, dinner_ratio")
        .maybeSingle();
      if (error) throw error;
      return {
        quick_mode_max_minutes: data?.quick_mode_max_minutes ?? DEFAULT_QUICK_MINUTES,
        dinner_ratio: Number(data?.dinner_ratio ?? 1 / 3),
      };
    },
  });
}

/** The time limit of a quick day (household setting, 15 minutes until loaded). */
export function useQuickMinutes(): number {
  return useHouseholdSettings().data?.quick_mode_max_minutes ?? DEFAULT_QUICK_MINUTES;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export interface MemberInput {
  name: string;
  birth_date: string | null;
  sex: Sex | null;
  activity_level: ActivityLevel;
}

export function useSaveMember() {
  const queryClient = useQueryClient();
  const household = useHousehold();
  return useMutation({
    mutationFn: async ({ id, ...input }: MemberInput & { id?: string }) => {
      if (id) {
        const { error } = await supabase.from("members").update(input).eq("id", id);
        if (error) throw error;
        return;
      }
      if (!household.data) throw new Error("household is not loaded");
      const { error } = await supabase
        .from("members")
        .insert({ ...input, household_id: household.data });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEMBERS }),
  });
}

/** Deleting a member also deletes their restrictions (on delete cascade). */
export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEMBERS });
      void queryClient.invalidateQueries({ queryKey: RESTRICTIONS });
    },
  });
}

// ---------------------------------------------------------------------------
// Restrictions
// ---------------------------------------------------------------------------

/** The ingredient master row for a food name, so its other spellings are checked too. */
async function findIngredientId(label: string): Promise<string | null> {
  const byName = await supabase.from("ingredients").select("id").eq("name", label).limit(1);
  if (byName.error) throw byName.error;
  if (byName.data[0]) return byName.data[0].id;
  const byAlias = await supabase
    .from("ingredients")
    .select("id")
    .contains("aliases", [label])
    .limit(1);
  if (byAlias.error) throw byAlias.error;
  return byAlias.data[0]?.id ?? null;
}

/**
 * Sets one food for the chosen members: added or updated for them, removed for the others.
 * `previousIds` are the rows of the same food before editing (empty when adding).
 */
export function useSaveRestriction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      label: string;
      kind: RestrictionKind;
      memberIds: string[];
      previous: Restriction[];
    }) => {
      const ingredientId = await findIngredientId(args.label);
      const keep = new Set(args.memberIds);
      const remove = args.previous.filter((r) => !keep.has(r.member_id)).map((r) => r.id);
      if (remove.length > 0) {
        const { error } = await supabase.from("member_food_restrictions").delete().in("id", remove);
        if (error) throw error;
      }
      // A member who already had it under another spelling keeps one row: replace it.
      const renamed = args.previous
        .filter((r) => keep.has(r.member_id) && r.label !== args.label)
        .map((r) => r.id);
      if (renamed.length > 0) {
        const { error } = await supabase
          .from("member_food_restrictions")
          .delete()
          .in("id", renamed);
        if (error) throw error;
      }
      if (args.memberIds.length > 0) {
        const { error } = await supabase.from("member_food_restrictions").upsert(
          args.memberIds.map((memberId) => ({
            member_id: memberId,
            label: args.label,
            kind: args.kind,
            ingredient_id: ingredientId,
          })),
          { onConflict: "member_id,label" },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESTRICTIONS }),
  });
}

export function useDeleteRestrictions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("member_food_restrictions").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RESTRICTIONS }),
  });
}

// ---------------------------------------------------------------------------
// Household settings
// ---------------------------------------------------------------------------

export function useUpdateQuickMinutes() {
  const queryClient = useQueryClient();
  const household = useHousehold();
  return useMutation({
    mutationFn: async (minutes: number) => {
      if (!household.data) throw new Error("household is not loaded");
      const { error } = await supabase
        .from("household_settings")
        .upsert(
          { household_id: household.data, quick_mode_max_minutes: minutes },
          { onConflict: "household_id" },
        );
      if (error) throw error;
    },
    // Show the new value at once; a failed save puts the stored one back.
    onMutate: (minutes) => {
      const previous = queryClient.getQueryData(SETTINGS);
      queryClient.setQueryData(SETTINGS, (s: { quick_mode_max_minutes: number } | undefined) =>
        s ? { ...s, quick_mode_max_minutes: minutes } : s,
      );
      return { previous };
    },
    onError: (_error, _minutes, context) => queryClient.setQueryData(SETTINGS, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SETTINGS }),
  });
}
