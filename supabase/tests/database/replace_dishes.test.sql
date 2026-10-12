-- Tests for replace_planned_dishes / swap_planned_dish.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@test.local');
insert into public.households (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'B');
insert into public.household_members (household_id, email, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@test.local', 'A1'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@test.local', 'B1');

insert into public.meal_plans (id, household_id, start_date, end_date, status, generation_meta) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-13', '2026-10-14', 'proposed',
   '{"warnings": [{"code": "AVOID_INGREDIENT", "date": "2026-10-13", "dish": "回鍋肉", "message": "old"},
                  {"code": "LEFTOVER_UNUSED", "message": "keep me"}]}');
insert into public.meal_plan_days (id, meal_plan_id, date, mode) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-13', 'normal'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-14', 'none');

insert into public.recipes (id, household_id, title, course, cook_minutes, servings, source, is_favorite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'ご飯', 'staple', 0, 2, 'llm', false),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', '回鍋肉', 'main', 20, 2, 'llm', false),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', '中華スープ', 'soup', 10, 2, 'llm', true),
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-00000000000a', '鮭のちゃんちゃん焼き', 'main', 25, 2, 'llm', true);
insert into public.planned_dishes (id, meal_plan_day_id, recipe_id, course, position) values
  ('aaaaaaaa-0000-0000-0000-000000000c01', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001', 'staple', 0),
  ('aaaaaaaa-0000-0000-0000-000000000c02', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000002', 'main', 1),
  ('aaaaaaaa-0000-0000-0000-000000000c03', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000003', 'soup', 2);
insert into public.leftovers (household_id, raw_name) values ('aaaaaaaa-0000-0000-0000-00000000000a', '白菜');

-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001", "email": "b@test.local"}';

select throws_ok($$
  select public.replace_planned_dishes('aaaaaaaa-0000-0000-0000-0000000000d1', null, '[]', '[]', 2)
$$, 'P0002', null, 'another household cannot change the day');
select throws_ok($$
  select public.swap_planned_dish('aaaaaaaa-0000-0000-0000-000000000c02', 'aaaaaaaa-0000-0000-0000-0000000000f1')
$$, 'P0002', null, 'another household cannot swap a dish');

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "a@test.local"}';

-- One dish ---------------------------------------------------------------------
select lives_ok($$
  select public.replace_planned_dishes(
    'aaaaaaaa-0000-0000-0000-0000000000d1',
    'aaaaaaaa-0000-0000-0000-000000000c02',
    '[{"title": "白菜と豚肉の重ね蒸し", "course": "main", "cook_minutes": 20, "steps": ["重ねる", "蒸す"],
       "uses_leftovers": ["白菜"],
       "ingredients": [{"name": "白菜", "amount": 200, "unit": "g", "is_pantry": false}]}]',
    '[{"code": "REPEATS_RECENT", "date": "2026-10-13", "message": "new"}]',
    2)
$$, 'one dish is replaced');

select is(
  (select array_agg(r.title order by pd.position)
     from public.planned_dishes pd join public.recipes r on r.id = pd.recipe_id
    where pd.meal_plan_day_id = 'aaaaaaaa-0000-0000-0000-0000000000d1'),
  array['ご飯', '白菜と豚肉の重ね蒸し', '中華スープ'],
  'the new dish takes the old one''s place'
);
select is((select count(*) from public.recipes where title = '回鍋肉'), 0::bigint, 'the replaced generated recipe is removed');
select is(
  (select used_in_plan_id from public.leftovers where raw_name = '白菜'),
  'aaaaaaaa-0000-0000-0000-0000000000a1'::uuid,
  'leftovers used by the new dish are marked'
);
select is(
  (select array_agg(w ->> 'message' order by w ->> 'message')
     from public.meal_plans, jsonb_array_elements(generation_meta -> 'warnings') as w),
  array['keep me', 'new'],
  'the day''s warnings are replaced, others kept'
);

-- Whole day ----------------------------------------------------------------------
select lives_ok($$
  select public.replace_planned_dishes(
    'aaaaaaaa-0000-0000-0000-0000000000d1', null,
    '[{"title": "ご飯", "course": "staple", "cook_minutes": 0, "ingredients": []},
      {"title": "鶏の照り焼き", "course": "main", "cook_minutes": 20, "ingredients": []},
      {"title": "きんぴらごぼう", "course": "side", "cook_minutes": 15, "ingredients": []},
      {"title": "なめこの味噌汁", "course": "soup", "cook_minutes": 5, "ingredients": []}]',
    '[]', 2)
$$, 'the whole day is replaced');
select is(
  (select count(*) from public.planned_dishes where meal_plan_day_id = 'aaaaaaaa-0000-0000-0000-0000000000d1'),
  4::bigint, 'the day has the four new dishes'
);
select is((select count(*) from public.recipes where title = '中華スープ'), 1::bigint, 'a favourite recipe is kept');

select throws_ok($$
  select public.replace_planned_dishes('aaaaaaaa-0000-0000-0000-0000000000d2', null, '[]', '[]', 2)
$$, 'P0002', null, 'a day without dinner cannot be changed');

-- Swap with a favourite ---------------------------------------------------------
select lives_ok($$
  select public.swap_planned_dish(
    (select pd.id from public.planned_dishes pd join public.recipes r on r.id = pd.recipe_id where r.title = '鶏の照り焼き'),
    'aaaaaaaa-0000-0000-0000-0000000000f1')
$$, 'a dish is swapped with a favourite');
select is(
  (select count(*) from public.recipes where title = '鶏の照り焼き'), 0::bigint,
  'the swapped-out generated recipe is removed'
);

reset role;
update public.meal_plans set status = 'archived';
set local role authenticated;
select throws_ok($$
  select public.swap_planned_dish(
    (select id from public.planned_dishes limit 1), 'aaaaaaaa-0000-0000-0000-0000000000f1')
$$, 'P0002', null, 'an archived plan cannot be changed');

select * from finish();
rollback;
