-- RLS tests: run with `supabase test db`.
-- Household A and B each have one allowlisted user; "stranger" is not allowlisted.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures (inserted as the owner, so RLS does not apply)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@test.local'),
  ('cccccccc-0000-0000-0000-000000000001', 'stranger@test.local');

insert into public.households (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'B');

insert into public.household_members (household_id, email, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@test.local', 'A1'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@test.local', 'B1');

insert into public.meal_plans (id, household_id, start_date, end_date) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-13', '2026-10-17'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', '2026-10-13', '2026-10-17');

insert into public.recipes (id, household_id, title, course, cook_minutes) values
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'bbbbbbbb-0000-0000-0000-00000000000b', 'B recipe', 'main', 20);

insert into public.meal_plan_days (id, meal_plan_id, date) values
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-13');

insert into public.shopping_lists (id, meal_plan_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-0000000000a1');

insert into public.shopping_items (id, shopping_list_id, display_name, category_id)
select 'aaaaaaaa-0000-0000-0000-0000000000a5', 'aaaaaaaa-0000-0000-0000-0000000000a4', '玉ねぎ', id
from public.ingredient_categories where name = '野菜・果物';

-- ---------------------------------------------------------------------------
-- Household A user (email in a different case on purpose)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "A@Test.Local", "role": "authenticated"}';

select is(
  (select array_agg(id) from public.meal_plans),
  array['aaaaaaaa-0000-0000-0000-0000000000a1'::uuid],
  'A sees only its own meal plans'
);

select is(
  (select count(*) from public.recipes where household_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  0::bigint,
  'A cannot read B recipes'
);

select is(
  (select count(*) from public.household_members),
  1::bigint,
  'A sees only its own allowlist'
);

select ok(
  (select count(*) from public.ingredient_categories) > 0,
  'A can read the ingredient master'
);

select throws_ok(
  $$insert into public.meal_plans (household_id, start_date, end_date)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', '2026-10-20', '2026-10-21')$$,
  '42501',
  null,
  'A cannot create a plan in B'
);

select throws_ok(
  $$insert into public.planned_dishes (meal_plan_day_id, recipe_id, course)
    values ('aaaaaaaa-0000-0000-0000-0000000000a3', 'bbbbbbbb-0000-0000-0000-0000000000b2', 'main')$$,
  '42501',
  null,
  'A cannot attach a B recipe to its own plan'
);

select throws_ok(
  $$insert into public.household_members (household_id, email, display_name)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'intruder@test.local', 'X')$$,
  '42501',
  null,
  'A cannot add people to the allowlist from the app'
);

-- Checking an item records the real user even if the client sends someone else.
update public.shopping_items
set checked = true, checked_by = 'bbbbbbbb-0000-0000-0000-000000000001'
where id = 'aaaaaaaa-0000-0000-0000-0000000000a5';

select is(
  (select checked_by from public.shopping_items where id = 'aaaaaaaa-0000-0000-0000-0000000000a5'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'checked_by is set from the signed-in user'
);

select isnt(
  (select checked_at from public.shopping_items where id = 'aaaaaaaa-0000-0000-0000-0000000000a5'),
  null,
  'checked_at is set when checked'
);

-- ---------------------------------------------------------------------------
-- Household B user
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001", "email": "b@test.local", "role": "authenticated"}';

select is(
  (select count(*) from public.shopping_items),
  0::bigint,
  'B cannot see A shopping items'
);

-- ---------------------------------------------------------------------------
-- Signed-in user who is not on the allowlist
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000001", "email": "stranger@test.local", "role": "authenticated"}';

select is(
  (select count(*) from public.meal_plans) + (select count(*) from public.household_members),
  0::bigint,
  'stranger sees no plans and no allowlist'
);

select is(
  (select count(*) from public.ingredients) + (select count(*) from public.ingredient_categories),
  0::bigint,
  'stranger cannot read the ingredient master'
);

-- ---------------------------------------------------------------------------
-- Not signed in
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

-- Not even allowed to query household tables (20261013000700_data_api_grants.sql).
select throws_ok(
  'select count(*) from public.meal_plans',
  '42501', null,
  'anon cannot query household tables'
);

select * from finish();
rollback;
