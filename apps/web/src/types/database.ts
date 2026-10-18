export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      household_members: {
        Row: {
          created_at: string;
          display_name: string;
          email: string;
          household_id: string;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name: string;
          email: string;
          household_id: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          email?: string;
          household_id?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_settings: {
        Row: {
          budget_per_week: number | null;
          category_order: string[];
          created_at: string;
          dinner_ratio: number;
          household_id: string;
          quick_mode_max_minutes: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          budget_per_week?: number | null;
          category_order?: string[];
          created_at?: string;
          dinner_ratio?: number;
          household_id: string;
          quick_mode_max_minutes?: number;
          updated_at?: string;
        };
        Update: {
          budget_per_week?: number | null;
          category_order?: string[];
          created_at?: string;
          dinner_ratio?: number;
          household_id?: string;
          quick_mode_max_minutes?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_settings_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: true;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ingredient_categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          sort_order: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      ingredients: {
        Row: {
          aliases: string[];
          base_unit: string;
          category_id: string;
          created_at: string;
          food_composition_code: string | null;
          grams_per_piece: number | null;
          id: string;
          name: string;
          shelf_life_days: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          aliases?: string[];
          base_unit: string;
          category_id: string;
          created_at?: string;
          food_composition_code?: string | null;
          grams_per_piece?: number | null;
          id?: string;
          name: string;
          shelf_life_days?: number | null;
          updated_at?: string;
        };
        Update: {
          aliases?: string[];
          base_unit?: string;
          category_id?: string;
          created_at?: string;
          food_composition_code?: string | null;
          grams_per_piece?: number | null;
          id?: string;
          name?: string;
          shelf_life_days?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingredients_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "ingredient_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      leftovers: {
        Row: {
          amount: number | null;
          created_at: string;
          household_id: string;
          id: string;
          ingredient_id: string | null;
          raw_name: string;
          unit: string;
          used_in_plan_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount?: number | null;
          created_at?: string;
          household_id: string;
          id?: string;
          ingredient_id?: string | null;
          raw_name: string;
          unit?: string;
          used_in_plan_id?: string | null;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          household_id?: string;
          id?: string;
          ingredient_id?: string | null;
          raw_name?: string;
          unit?: string;
          used_in_plan_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leftovers_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leftovers_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leftovers_used_in_plan_id_fkey";
            columns: ["used_in_plan_id"];
            isOneToOne: false;
            referencedRelation: "meal_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plan_days: {
        Row: {
          date: string;
          id: string;
          meal_plan_id: string;
          meal_type: string;
          mode: string;
        };
        ComputedFields: never;
        Insert: {
          date: string;
          id?: string;
          meal_plan_id: string;
          meal_type?: string;
          mode?: string;
        };
        Update: {
          date?: string;
          id?: string;
          meal_plan_id?: string;
          meal_type?: string;
          mode?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plan_days_meal_plan_id_fkey";
            columns: ["meal_plan_id"];
            isOneToOne: false;
            referencedRelation: "meal_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_plans: {
        Row: {
          created_at: string;
          end_date: string;
          generation_error: string | null;
          generation_meta: Json | null;
          generation_started_at: string | null;
          household_id: string;
          id: string;
          request: string;
          start_date: string;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          end_date: string;
          generation_error?: string | null;
          generation_meta?: Json | null;
          generation_started_at?: string | null;
          household_id: string;
          id?: string;
          request?: string;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          generation_error?: string | null;
          generation_meta?: Json | null;
          generation_started_at?: string | null;
          household_id?: string;
          id?: string;
          request?: string;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_plans_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      member_food_restrictions: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string | null;
          kind: string;
          label: string;
          member_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          kind: string;
          label: string;
          member_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          kind?: string;
          label?: string;
          member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_food_restrictions_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_food_restrictions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: {
          activity_level: string;
          birth_date: string | null;
          created_at: string;
          household_id: string;
          id: string;
          name: string;
          sex: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          activity_level?: string;
          birth_date?: string | null;
          created_at?: string;
          household_id: string;
          id?: string;
          name: string;
          sex?: string | null;
          updated_at?: string;
        };
        Update: {
          activity_level?: string;
          birth_date?: string | null;
          created_at?: string;
          household_id?: string;
          id?: string;
          name?: string;
          sex?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      planned_dishes: {
        Row: {
          course: string;
          id: string;
          made_on: string | null;
          meal_plan_day_id: string;
          position: number;
          recipe_id: string;
        };
        ComputedFields: never;
        Insert: {
          course: string;
          id?: string;
          made_on?: string | null;
          meal_plan_day_id: string;
          position?: number;
          recipe_id: string;
        };
        Update: {
          course?: string;
          id?: string;
          made_on?: string | null;
          meal_plan_day_id?: string;
          position?: number;
          recipe_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planned_dishes_made_on_fkey";
            columns: ["made_on"];
            isOneToOne: false;
            referencedRelation: "planned_dishes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "planned_dishes_meal_plan_day_id_fkey";
            columns: ["meal_plan_day_id"];
            isOneToOne: false;
            referencedRelation: "meal_plan_days";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "planned_dishes_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ingredients: {
        Row: {
          amount: number | null;
          id: string;
          ingredient_id: string | null;
          is_pantry: boolean;
          position: number;
          raw_name: string;
          recipe_id: string;
          unit: string;
        };
        ComputedFields: never;
        Insert: {
          amount?: number | null;
          id?: string;
          ingredient_id?: string | null;
          is_pantry?: boolean;
          position?: number;
          raw_name: string;
          recipe_id: string;
          unit?: string;
        };
        Update: {
          amount?: number | null;
          id?: string;
          ingredient_id?: string | null;
          is_pantry?: boolean;
          position?: number;
          raw_name?: string;
          recipe_id?: string;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          cook_minutes: number;
          course: string;
          created_at: string;
          household_id: string;
          id: string;
          is_favorite: boolean;
          note: string;
          rating: number | null;
          servings: number;
          source: string;
          steps: NonNullable<Json>;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cook_minutes: number;
          course: string;
          created_at?: string;
          household_id: string;
          id?: string;
          is_favorite?: boolean;
          note?: string;
          rating?: number | null;
          servings?: number;
          source?: string;
          steps?: NonNullable<Json>;
          title: string;
          updated_at?: string;
        };
        Update: {
          cook_minutes?: number;
          course?: string;
          created_at?: string;
          household_id?: string;
          id?: string;
          is_favorite?: boolean;
          note?: string;
          rating?: number | null;
          servings?: number;
          source?: string;
          steps?: NonNullable<Json>;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_items: {
        Row: {
          amount: number | null;
          category_id: string;
          checked: boolean;
          checked_at: string | null;
          checked_by: string | null;
          created_at: string;
          display_name: string;
          id: string;
          ingredient_id: string | null;
          is_manual: boolean;
          is_pantry: boolean;
          item_key: string | null;
          note: string;
          position: number;
          shopping_list_id: string;
          unit: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount?: number | null;
          category_id: string;
          checked?: boolean;
          checked_at?: string | null;
          checked_by?: string | null;
          created_at?: string;
          display_name: string;
          id?: string;
          ingredient_id?: string | null;
          is_manual?: boolean;
          is_pantry?: boolean;
          item_key?: string | null;
          note?: string;
          position?: number;
          shopping_list_id: string;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number | null;
          category_id?: string;
          checked?: boolean;
          checked_at?: string | null;
          checked_by?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          ingredient_id?: string | null;
          is_manual?: boolean;
          is_pantry?: boolean;
          item_key?: string | null;
          note?: string;
          position?: number;
          shopping_list_id?: string;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "ingredient_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_items_shopping_list_id_fkey";
            columns: ["shopping_list_id"];
            isOneToOne: false;
            referencedRelation: "shopping_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_lists: {
        Row: {
          created_at: string;
          id: string;
          meal_plan_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          meal_plan_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          meal_plan_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_lists_meal_plan_id_fkey";
            columns: ["meal_plan_id"];
            isOneToOne: true;
            referencedRelation: "meal_plans";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_plan_dates: { Args: { p_only_older?: boolean; p_plan_id: string }; Returns: undefined };
      claim_plan_generation: { Args: { p_plan_id: string }; Returns: boolean };
      delete_meal_plan: { Args: { p_plan_id: string }; Returns: undefined };
      delete_unkept_recipes: { Args: { p_recipe_ids: string[] }; Returns: undefined };
      fail_plan_generation: { Args: { p_error: string; p_plan_id: string }; Returns: undefined };
      insert_generated_recipe: {
        Args: { p_dish: Json; p_household: string; p_servings: number };
        Returns: string;
      };
      make_ahead: { Args: { p_source_dish: string; p_targets: Json }; Returns: undefined };
      my_household_id: { Args: Record<PropertyKey, never>; Returns: string };
      replace_planned_dishes: {
        Args: {
          p_day_id: string;
          p_dish_id: string;
          p_dishes: Json;
          p_servings: number;
          p_warnings: Json;
        };
        Returns: undefined;
      };
      replace_shopping_list: { Args: { p_items: Json; p_plan_id: string }; Returns: string };
      save_generated_plan: {
        Args: { p_days: Json; p_meta: Json; p_plan_id: string };
        Returns: undefined;
      };
      save_plan_draft: {
        Args: { p_days: Json; p_end: string; p_plan_id: string; p_start: string };
        Returns: string;
      };
      swap_planned_dish: { Args: { p_dish_id: string; p_recipe_id: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
