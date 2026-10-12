import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  buildShoppingList,
  type Category,
  type IngredientMaster,
  type LeftoverRow,
  type UsageRow,
} from "./shopping";
import type { Json } from "@/types/database";
import { supabase } from "./supabase";

export interface ShoppingItem {
  id: string;
  display_name: string;
  category_id: string;
  amount: number | null;
  unit: string;
  note: string;
  is_pantry: boolean;
  is_manual: boolean;
  checked: boolean;
  position: number;
}

export interface ShoppingList {
  id: string;
  items: ShoppingItem[];
}

const listKey = (planId: string | undefined) => ["shopping", planId] as const;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredient_categories")
        .select("id, name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });
}

/** The list of a plan (null until it is built), kept in sync between the two phones. */
export function useShoppingList(planId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: listKey(planId),
    enabled: Boolean(planId),
    queryFn: async (): Promise<ShoppingList | null> => {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select(
          "id, shopping_items ( id, display_name, category_id, amount, unit, note, is_pantry, is_manual, checked, position )",
        )
        .eq("meal_plan_id", planId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        items: [...(data.shopping_items as ShoppingItem[])].sort(
          (a, b) => a.position - b.position || a.display_name.localeCompare(b.display_name, "ja"),
        ),
      };
    },
  });

  const listId = query.data?.id;
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!listId) return;
    const channel = supabase
      .channel(`shopping-${listId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_items",
          filter: `shopping_list_id=eq.${listId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: listKey(planId) }),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [listId, planId, queryClient]);

  return { ...query, live };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

interface PlanIngredientsRow {
  meal_plan_days: {
    mode: string;
    planned_dishes: {
      recipes: {
        title: string;
        recipe_ingredients: {
          raw_name: string;
          amount: number | null;
          unit: string;
          is_pantry: boolean;
          ingredients: IngredientMaster | IngredientMaster[] | null;
        }[];
      } | null;
    }[];
  }[];
}

/** Loads the confirmed plan's ingredients, computes the list and saves it (checks are kept). */
export function useBuildShoppingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string) => {
      const [plan, leftovers, categories] = await Promise.all([
        supabase
          .from("meal_plans")
          .select(
            "meal_plan_days ( mode, planned_dishes ( recipes ( title, recipe_ingredients ( raw_name, amount, unit, is_pantry, ingredients ( id, name, category_id, base_unit, grams_per_piece ) ) ) ) )",
          )
          .eq("id", planId)
          .single(),
        supabase.from("leftovers").select("raw_name, amount, unit").eq("used_in_plan_id", planId),
        supabase.from("ingredient_categories").select("id, name, sort_order"),
      ]);
      if (plan.error) throw plan.error;
      if (leftovers.error) throw leftovers.error;
      if (categories.error) throw categories.error;

      const usages: UsageRow[] = (plan.data as unknown as PlanIngredientsRow).meal_plan_days
        .filter((day) => day.mode !== "none")
        .flatMap((day) => day.planned_dishes)
        .flatMap((dish) =>
          (dish.recipes?.recipe_ingredients ?? []).map((i) => ({
            dishTitle: dish.recipes!.title,
            raw_name: i.raw_name,
            amount: i.amount,
            unit: i.unit,
            is_pantry: i.is_pantry,
            ingredient: Array.isArray(i.ingredients) ? (i.ingredients[0] ?? null) : i.ingredients,
          })),
        );
      const items = buildShoppingList(
        usages,
        leftovers.data as LeftoverRow[],
        categories.data as Category[],
      );
      const { error } = await supabase.rpc("replace_shopping_list", {
        p_plan_id: planId,
        p_items: items as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: (_data, planId) => queryClient.invalidateQueries({ queryKey: listKey(planId) }),
  });
}

// ---------------------------------------------------------------------------
// Checks (work offline: paused while offline, persisted, and sent when back online)
// ---------------------------------------------------------------------------

export const TOGGLE_ITEM_KEY = ["toggleShoppingItem"] as const;

interface ToggleVars {
  planId: string;
  itemId: string;
  checked: boolean;
}

/**
 * Registered on the QueryClient (not inline in a hook) so a check made offline can be
 * restored from storage and sent after the app is reopened.
 */
export function registerShoppingMutations(queryClient: QueryClient) {
  queryClient.setMutationDefaults(TOGGLE_ITEM_KEY, {
    // Signal in a shop comes and goes; a failed send is retried rather than dropped.
    retry: 3,
    mutationFn: async ({ itemId, checked }: ToggleVars) => {
      const { error } = await supabase.from("shopping_items").update({ checked }).eq("id", itemId);
      if (error) throw error;
    },
    // Synchronous so the checkbox flips at once (an await here makes it flicker back first).
    onMutate: ({ planId, itemId, checked }: ToggleVars) => {
      void queryClient.cancelQueries({ queryKey: listKey(planId) });
      queryClient.setQueryData<ShoppingList | null>(listKey(planId), (list) =>
        list
          ? { ...list, items: list.items.map((i) => (i.id === itemId ? { ...i, checked } : i)) }
          : list,
      );
    },
    onSettled: (_data, _error, { planId }: ToggleVars) =>
      queryClient.invalidateQueries({ queryKey: listKey(planId) }),
  });
}

export function useToggleItem() {
  return useMutation<void, Error, ToggleVars>({ mutationKey: TOGGLE_ITEM_KEY });
}

export function useAddManualItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      planId: string;
      listId: string;
      name: string;
      categoryId: string;
    }) => {
      const { error } = await supabase.from("shopping_items").insert({
        shopping_list_id: args.listId,
        display_name: args.name,
        category_id: args.categoryId,
        is_manual: true,
        position: 9999,
      });
      if (error) throw error;
    },
    onSuccess: (_data, args) => queryClient.invalidateQueries({ queryKey: listKey(args.planId) }),
  });
}

export function useDeleteManualItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { planId: string; itemId: string }) => {
      const { error } = await supabase
        .from("shopping_items")
        .delete()
        .eq("id", args.itemId)
        .eq("is_manual", true);
      if (error) throw error;
    },
    onSuccess: (_data, args) => queryClient.invalidateQueries({ queryKey: listKey(args.planId) }),
  });
}

/** navigator.onLine, kept up to date. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
