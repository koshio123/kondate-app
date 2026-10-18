-- Tests for make_ahead and how swap_planned_dish / replace_planned_dishes treat make-ahead dishes.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-13', '2026-10-16', 'proposed',
   '{"warnings": [{"code": "REPEATS_RECENT", "date": "2026-10-14", "dish": "鯖の味噌煮", "message": "goes"},
                  {"code": "LEFTOVER_UNUSED", "message": "stays"}]}');
insert into public.meal_plan_days (id, meal_plan_id, date, mode) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-13', 'normal'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-14', 'normal'),
  ('aaaaaaaa-0000-0000-0000-0000000000d3', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-15', 'none'),
  ('aaaaaaaa-0000-0000-0000-0000000000d4', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-16', 'quick');

insert into public.recipes (id, household_id, title, course, cook_minutes, servings, source, is_favorite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '鶏の照り焼き', 'main', 20, 2, 'llm', false),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', '味噌汁', 'soup', 10, 2, 'llm', false),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', '鯖の味噌煮', 'main', 25, 2, 'llm', false),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000a', 'ほうれん草のおひたし', 'side', 10, 2, 'llm', false),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-00000000000a', '肉うどん', 'one_dish', 15, 2, 'llm', false),
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'カレー', 'main', 40, 2, 'manual', true),
  ('aaaaaaaa-0000-0000-0000-0000000000f2', 'aaaaaaaa-0000-0000-0000-00000000000a', '豚の生姜焼き', 'main', 15, 2, 'manual', true);
insert into public.planned_dishes (id, meal_plan_day_id, recipe_id, course, position) values
  ('aaaaaaaa-0000-0000-0000-000000000c01', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001', 'main', 0),
  ('aaaaaaaa-0000-0000-0000-000000000c02', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000002', 'soup', 1),
  ('aaaaaaaa-0000-0000-0000-000000000c03', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000003', 'main', 0),
  ('aaaaaaaa-0000-0000-0000-000000000c04', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000004', 'side', 1),
  ('aaaaaaaa-0000-0000-0000-000000000c05', 'aaaaaaaa-0000-0000-0000-0000000000d4', 'aaaaaaaa-0000-0000-0000-000000000005', 'one_dish', 0);

create function pg_temp.titles(p_day uuid) returns text[] language sql as $$
  select array_agg(r.title || case when pd.made_on is null then '' else '*' end order by pd.position)
    from public.planned_dishes pd join public.recipes r on r.id = pd.recipe_id
   where pd.meal_plan_day_id = p_day
$$;

-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001", "email": "b@test.local"}';

select throws_ok($$
  select public.make_ahead('aaaaaaaa-0000-0000-0000-000000000c01',
    '[{"day_id": "aaaaaaaa-0000-0000-0000-0000000000d2", "replace_dish_id": null}]')
$$, 'P0002', null, 'another household cannot make a dish ahead');

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "a@test.local"}';

-- Rules ------------------------------------------------------------------------
select throws_ok($$
  select public.make_ahead('aaaaaaaa-0000-0000-0000-000000000c03',
    '[{"day_id": "aaaaaaaa-0000-0000-0000-0000000000d1", "replace_dish_id": null}]')
$$, '22023', null, 'the day to eat it must come after the cooking day');
select throws_ok($$
  select public.make_ahead('aaaaaaaa-0000-0000-0000-000000000c01',
    '[{"day_id": "aaaaaaaa-0000-0000-0000-0000000000d3", "replace_dish_id": null}]')
$$, '22023', null, 'a day without dinner cannot take it');
select throws_ok($$
  select public.make_ahead('aaaaaaaa-0000-0000-0000-000000000c01',
    '[{"day_id": "aaaaaaaa-0000-0000-0000-0000000000d2", "replace_dish_id": "aaaaaaaa-0000-0000-0000-000000000c05"}]')
$$, 'P0002', null, 'the dish to replace must be on that day');

-- Make ahead -------------------------------------------------------------------
select lives_ok($$
  select public.make_ahead('aaaaaaaa-0000-0000-0000-000000000c01',
    '[{"day_id": "aaaaaaaa-0000-0000-0000-0000000000d2", "replace_dish_id": "aaaaaaaa-0000-0000-0000-000000000c03"},
      {"day_id": "aaaaaaaa-0000-0000-0000-0000000000d4", "replace_dish_id": null}]')
$$, 'a dish is made ahead for two later days');

select is(pg_temp.titles('aaaaaaaa-0000-0000-0000-0000000000d2'),
  array['鶏の照り焼き*', 'ほうれん草のおひたし'], 'it replaces the dish in that dish''s place');
select is(pg_temp.titles('aaaaaaaa-0000-0000-0000-0000000000d4'),
  array['肉うどん', '鶏の照り焼き*'], 'or is added after the day''s dishes');
select is((select count(*) from public.recipes where title = '鯖の味噌煮'), 0::bigint,
  'the replaced generated recipe is removed');
select is(
  (select array_agg(w ->> 'message') from public.meal_plans, jsonb_array_elements(generation_meta -> 'warnings') as w),
  array['stays'], 'warnings about the replaced dish are removed');

select throws_ok($$
  select public.make_ahead(
    (select id from public.planned_dishes where made_on is not null limit 1),
    '[{"day_id": "aaaaaaaa-0000-0000-0000-0000000000d4", "replace_dish_id": null}]')
$$, '22023', null, 'a make-ahead dish cannot be made ahead again');
select throws_ok($$
  select public.make_ahead('aaaaaaaa-0000-0000-0000-000000000c01',
    '[{"day_id": "aaaaaaaa-0000-0000-0000-0000000000d4", "replace_dish_id": null}]')
$$, '22023', null, 'one cooking feeds at most three meals');

-- Swap -------------------------------------------------------------------------
select lives_ok($$
  select public.swap_planned_dish('aaaaaaaa-0000-0000-0000-000000000c01', 'aaaaaaaa-0000-0000-0000-0000000000f1')
$$, 'the cooking-day dish is swapped for a favourite');
select is(
  (select array_agg(distinct r.title) from public.planned_dishes pd join public.recipes r on r.id = pd.recipe_id
    where pd.made_on = 'aaaaaaaa-0000-0000-0000-000000000c01'),
  array['カレー'], 'its make-ahead dishes change with it');

select public.swap_planned_dish(
  (select id from public.planned_dishes
    where meal_plan_day_id = 'aaaaaaaa-0000-0000-0000-0000000000d4' and made_on is not null),
  'aaaaaaaa-0000-0000-0000-0000000000f2');
select is(pg_temp.titles('aaaaaaaa-0000-0000-0000-0000000000d4'),
  array['肉うどん', '豚の生姜焼き'], 'a swapped make-ahead dish becomes an ordinary dish');

-- Re-suggest -------------------------------------------------------------------
select public.replace_planned_dishes(
  'aaaaaaaa-0000-0000-0000-0000000000d2', null,
  '[{"title": "トマトサラダ", "course": "side", "cook_minutes": 5, "steps": ["切る"], "uses_leftovers": [],
     "ingredients": [{"name": "トマト", "amount": 1, "unit": "個", "is_pantry": false}]}]',
  '[]', 2);
select is(pg_temp.titles('aaaaaaaa-0000-0000-0000-0000000000d2'),
  array['トマトサラダ', 'カレー*'], 're-suggesting a day keeps its make-ahead dish');

select public.replace_planned_dishes(
  'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000c01',
  '[{"title": "煮込みハンバーグ", "course": "main", "cook_minutes": 30, "steps": ["こねる", "煮込む"], "uses_leftovers": [],
     "ingredients": [{"name": "合いびき肉", "amount": 300, "unit": "g", "is_pantry": false}]}]',
  '[]', 2);
select is(pg_temp.titles('aaaaaaaa-0000-0000-0000-0000000000d2'),
  array['トマトサラダ', '煮込みハンバーグ*'], 'a re-suggested cooking-day dish takes its make-ahead dishes along');
select is(
  (select pd.made_on from public.planned_dishes pd
    where pd.meal_plan_day_id = 'aaaaaaaa-0000-0000-0000-0000000000d2' and pd.course = 'main'),
  (select pd.id from public.planned_dishes pd
    where pd.meal_plan_day_id = 'aaaaaaaa-0000-0000-0000-0000000000d1' and pd.course = 'main'),
  'and points to the new dish');

select public.replace_planned_dishes(
  'aaaaaaaa-0000-0000-0000-0000000000d1', null,
  '[{"title": "けんちん汁", "course": "soup", "cook_minutes": 20, "steps": ["煮る"], "uses_leftovers": [],
     "ingredients": [{"name": "大根", "amount": 100, "unit": "g", "is_pantry": false}]}]',
  '[]', 2);
select is(pg_temp.titles('aaaaaaaa-0000-0000-0000-0000000000d2'),
  array['トマトサラダ', '煮込みハンバーグ'], 'with no new dish of that course it becomes an ordinary dish');

select * from finish();
rollback;
