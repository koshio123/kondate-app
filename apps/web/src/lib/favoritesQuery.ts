import { useQuery } from "@tanstack/react-query";
import { toIsoDate } from "./date";
import { type FavoriteRow, sortFavorites, toFavorite } from "./favorites";
import { supabase } from "./supabase";

export function useFavorites() {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, title, course, cook_minutes, rating, recipe_ingredients ( raw_name, is_pantry ), planned_dishes ( meal_plan_days ( date ) )",
        )
        .eq("is_favorite", true);
      if (error) throw error;
      const today = toIsoDate(new Date());
      return sortFavorites((data as unknown as FavoriteRow[]).map((row) => toFavorite(row, today)));
    },
  });
}
