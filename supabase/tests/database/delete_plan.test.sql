-- Tests for delete_meal_plan.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@test.local');
insert into public.households (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'B');
insert into public.household_members (household_id, email, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@test.local', 'A1'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@test.local', 'B1');

insert into public.meal_plans (id, household_id, start_date, end_date, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-14', '2026-10-15', 'confirmed'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-16', '2026-10-16', 'generating');
insert into public.meal_plan_days (id, meal_plan_id, date, mode) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-14', 'normal'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-15', 'normal');
insert into public.recipes (id, household_id, title, course, cook_minutes, servings, source, is_favorite) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000a', '普通の主菜', 'main', 20, 2, 'llm', false),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'お気に入りの主菜', 'main', 20, 2, 'llm', true);
insert into public.planned_dishes (meal_plan_day_id, recipe_id, course, position) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'main', 0),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'main', 0);
insert into public.shopping_lists (id, meal_plan_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000a1');
insert into public.shopping_items (shopping_list_id, display_name, category_id)
select 'aaaaaaaa-0000-0000-0000-0000000000c1', 'キャベツ', id from public.ingredient_categories limit 1;
insert into public.leftovers (household_id, raw_name, used_in_plan_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '白菜', 'aaaaaaaa-0000-0000-0000-0000000000a1');

set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001", "email": "b@test.local"}';
select throws_ok($$ select public.delete_meal_plan('aaaaaaaa-0000-0000-0000-0000000000a1') $$,
  'P0002', null, 'another household cannot delete the plan');

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "a@test.local"}';
select throws_ok($$ select public.delete_meal_plan('aaaaaaaa-0000-0000-0000-0000000000a2') $$,
  '55006', null, 'a plan being generated cannot be deleted');

select lives_ok($$ select public.delete_meal_plan('aaaaaaaa-0000-0000-0000-0000000000a1') $$, 'the plan is deleted');
select is((select count(*) from public.meal_plans where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 0::bigint, 'the plan is gone');
select is((select count(*) from public.meal_plan_days where meal_plan_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 0::bigint, 'its days are gone');
select is((select count(*) from public.shopping_items), 0::bigint, 'its shopping list is gone');
select is((select used_in_plan_id from public.leftovers where raw_name = '白菜'), null, 'leftovers it used are free again');
select is((select count(*) from public.recipes where title = '普通の主菜'), 0::bigint, 'unkept generated recipes are removed');
select is((select count(*) from public.recipes where title = 'お気に入りの主菜'), 1::bigint, 'favourite recipes stay');

select * from finish();
rollback;
