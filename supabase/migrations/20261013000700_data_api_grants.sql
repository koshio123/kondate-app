-- Explicit Data API privileges.
--
-- The hosted project is created with "Automatically expose new tables" turned off, so tables
-- get no privileges unless granted here. RLS (20261012000100_rls.sql) still decides which rows
-- a signed-in user can reach; these grants decide which operations are possible at all.
--   anon:          nothing, except reading the store sections (used by the keep-alive ping;
--                  RLS returns no rows to anon, so it is only a cheap query)
--   authenticated: what the app does, matching the RLS policies
-- Locally `supabase start` grants everything by default, so the revokes below make local
-- behaviour match production.

revoke all on all tables in schema public from anon, authenticated;

-- Household and allowlist (managed with SQL; the app only reads them, and may rename the household)
grant select, update on public.households to authenticated;
grant select on public.household_members to authenticated;

-- Shared ingredient master (read-only for the app)
grant select on public.ingredient_categories, public.ingredients to authenticated;
grant select on public.ingredient_categories to anon;

-- Household data the app reads and writes
grant select, insert, update, delete on
  public.members,
  public.household_settings,
  public.member_food_restrictions,
  public.recipes,
  public.recipe_ingredients,
  public.meal_plans,
  public.meal_plan_days,
  public.planned_dishes,
  public.leftovers,
  public.shopping_lists,
  public.shopping_items
to authenticated;

-- Tables added later are not exposed until a migration grants them.
alter default privileges in schema public revoke all on tables from anon, authenticated;
