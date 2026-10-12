-- Row level security: a signed-in user can only reach their own household's data.
-- Users whose email is not in household_members get no household and see nothing.
-- See docs/02_design.md "3.3 RLS".

-- ---------------------------------------------------------------------------
-- Household lookup
-- ---------------------------------------------------------------------------

create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hm.household_id
  from public.household_members hm
  where hm.email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

revoke execute on function public.my_household_id() from public, anon;
grant execute on function public.my_household_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.members enable row level security;
alter table public.household_settings enable row level security;
alter table public.ingredient_categories enable row level security;
alter table public.ingredients enable row level security;
alter table public.member_food_restrictions enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_days enable row level security;
alter table public.planned_dishes enable row level security;
alter table public.leftovers enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

-- ---------------------------------------------------------------------------
-- Household and allowlist (read-only from the app; managed with SQL)
-- ---------------------------------------------------------------------------

create policy "read own household" on public.households
  for select to authenticated
  using (id = (select public.my_household_id()));

create policy "rename own household" on public.households
  for update to authenticated
  using (id = (select public.my_household_id()))
  with check (id = (select public.my_household_id()));

create policy "read own household members" on public.household_members
  for select to authenticated
  using (household_id = (select public.my_household_id()));

-- ---------------------------------------------------------------------------
-- Tables that carry household_id directly
-- ---------------------------------------------------------------------------

create policy "own household" on public.members
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

create policy "own household" on public.household_settings
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

create policy "own household" on public.recipes
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

create policy "own household" on public.meal_plans
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

create policy "own household" on public.leftovers
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

-- ---------------------------------------------------------------------------
-- Child tables (household reached through the parent)
-- ---------------------------------------------------------------------------

create policy "own household" on public.member_food_restrictions
  for all to authenticated
  using (exists (
    select 1 from public.members m
    where m.id = member_id and m.household_id = (select public.my_household_id())
  ))
  with check (exists (
    select 1 from public.members m
    where m.id = member_id and m.household_id = (select public.my_household_id())
  ));

create policy "own household" on public.recipe_ingredients
  for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.household_id = (select public.my_household_id())
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.household_id = (select public.my_household_id())
  ));

create policy "own household" on public.meal_plan_days
  for all to authenticated
  using (exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id and p.household_id = (select public.my_household_id())
  ))
  with check (exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id and p.household_id = (select public.my_household_id())
  ));

create policy "own household" on public.planned_dishes
  for all to authenticated
  using (exists (
    select 1 from public.meal_plan_days d
    join public.meal_plans p on p.id = d.meal_plan_id
    where d.id = meal_plan_day_id and p.household_id = (select public.my_household_id())
  ))
  with check (
    exists (
      select 1 from public.meal_plan_days d
      join public.meal_plans p on p.id = d.meal_plan_id
      where d.id = meal_plan_day_id and p.household_id = (select public.my_household_id())
    )
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.household_id = (select public.my_household_id())
    )
  );

create policy "own household" on public.shopping_lists
  for all to authenticated
  using (exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id and p.household_id = (select public.my_household_id())
  ))
  with check (exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id and p.household_id = (select public.my_household_id())
  ));

create policy "own household" on public.shopping_items
  for all to authenticated
  using (exists (
    select 1 from public.shopping_lists l
    join public.meal_plans p on p.id = l.meal_plan_id
    where l.id = shopping_list_id and p.household_id = (select public.my_household_id())
  ))
  with check (exists (
    select 1 from public.shopping_lists l
    join public.meal_plans p on p.id = l.meal_plan_id
    where l.id = shopping_list_id and p.household_id = (select public.my_household_id())
  ));

-- ---------------------------------------------------------------------------
-- Ingredient master: readable by household members, written only with the service role
-- ---------------------------------------------------------------------------

create policy "members can read" on public.ingredient_categories
  for select to authenticated
  using ((select public.my_household_id()) is not null);

create policy "members can read" on public.ingredients
  for select to authenticated
  using ((select public.my_household_id()) is not null);

-- ---------------------------------------------------------------------------
-- Who checked a shopping item is recorded by the server, not trusted from the client
-- ---------------------------------------------------------------------------

create or replace function public.stamp_shopping_item_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.checked is distinct from old.checked then
    if new.checked then
      new.checked_by = auth.uid();
      new.checked_at = now();
    else
      new.checked_by = null;
      new.checked_at = null;
    end if;
  else
    new.checked_by = old.checked_by;
    new.checked_at = old.checked_at;
  end if;
  return new;
end;
$$;

create trigger stamp_check before insert or update on public.shopping_items
  for each row execute function public.stamp_shopping_item_check();

-- ---------------------------------------------------------------------------
-- Realtime: sync shopping list checks between the two phones
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.shopping_items;
