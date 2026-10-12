-- Tests for claim_plan_generation / save_generated_plan / fail_plan_generation.

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

insert into public.meal_plans (id, household_id, start_date, end_date) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-13', '2026-10-14');

insert into public.meal_plan_days (meal_plan_id, date, mode) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-13', 'normal'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '2026-10-14', 'quick');

insert into public.leftovers (household_id, raw_name, amount, unit) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'キャベツ', 0.5, '玉'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'にんじん', 1, '本');

-- ---------------------------------------------------------------------------
-- Another household cannot touch the plan
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001", "email": "b@test.local"}';

select is(public.claim_plan_generation('aaaaaaaa-0000-0000-0000-0000000000a1'), false, 'B cannot claim A''s plan');

-- ---------------------------------------------------------------------------
-- Household A
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "a@test.local"}';

select is(public.claim_plan_generation('aaaaaaaa-0000-0000-0000-0000000000a1'), true, 'A claims its draft plan');
select is(public.claim_plan_generation('aaaaaaaa-0000-0000-0000-0000000000a1'), false, 'a running generation cannot be claimed twice');

select lives_ok($$
  select public.save_generated_plan(
    'aaaaaaaa-0000-0000-0000-0000000000a1',
    '[
      {"date": "2026-10-13", "dishes": [
        {"title": "ご飯", "course": "staple", "cook_minutes": 0, "steps": ["炊く"], "uses_leftovers": [],
         "ingredients": [{"name": "米", "amount": 1, "unit": "合", "is_pantry": true}]},
        {"title": "回鍋肉", "course": "main", "cook_minutes": 20, "steps": ["切る", "炒める"], "uses_leftovers": ["キャベツ"],
         "ingredients": [{"name": "キャベツ", "amount": 0.25, "unit": "玉", "is_pantry": false},
                         {"name": "塩", "amount": null, "unit": "少々", "is_pantry": true},
                         {"name": "豆板醤", "amount": 0, "unit": "小さじ", "is_pantry": false}]}
      ]},
      {"date": "2026-10-14", "dishes": [
        {"title": "親子丼", "course": "one_dish", "cook_minutes": 12, "steps": ["煮る"], "uses_leftovers": [],
         "ingredients": [{"name": "鶏もも肉", "amount": 200, "unit": "g", "is_pantry": false}]}
      ]}
    ]'::jsonb,
    '{"servings": 2, "model": "test"}'::jsonb)
$$, 'A saves a generated plan');

select is((select status from public.meal_plans where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'), 'proposed', 'plan becomes proposed');
select is((select count(*) from public.planned_dishes), 3::bigint, 'three dishes are planned');
select is(
  (select array_agg(r.title order by pd.position) from public.planned_dishes pd
     join public.meal_plan_days d on d.id = pd.meal_plan_day_id
     join public.recipes r on r.id = pd.recipe_id
    where d.date = '2026-10-13'),
  array['ご飯', '回鍋肉'],
  'dishes keep their order'
);
select is(
  (select count(*) from public.recipe_ingredients where amount is null and raw_name in ('塩', '豆板醤')),
  2::bigint,
  'non-positive or missing amounts are stored as null'
);
select is(
  (select array_agg(raw_name order by raw_name) from public.leftovers where used_in_plan_id is not null),
  array['キャベツ'],
  'only the leftovers used are marked'
);

-- Regenerate: previous generated recipes are replaced, favourites survive.
update public.recipes set is_favorite = true where title = '親子丼';
select is(public.claim_plan_generation('aaaaaaaa-0000-0000-0000-0000000000a1'), true, 'a proposed plan can be regenerated');
select lives_ok($$
  select public.save_generated_plan(
    'aaaaaaaa-0000-0000-0000-0000000000a1',
    '[{"date": "2026-10-13", "dishes": [
        {"title": "鮭の塩焼き", "course": "main", "cook_minutes": 15, "steps": ["焼く"], "uses_leftovers": [],
         "ingredients": []}]}]'::jsonb,
    '{"servings": 2}'::jsonb)
$$, 'A saves a regenerated plan');
select is(
  (select array_agg(title order by title) from public.recipes),
  array['親子丼', '鮭の塩焼き'],
  'unused generated recipes are deleted, the favourite is kept'
);
select is((select count(*) from public.leftovers where used_in_plan_id is not null), 0::bigint, 'leftover marks are reset on regeneration');

-- Failure puts the plan back to draft with the message.
select public.claim_plan_generation('aaaaaaaa-0000-0000-0000-0000000000a1');
select public.fail_plan_generation('aaaaaaaa-0000-0000-0000-0000000000a1', 'timeout');
select is(
  (select status || ':' || generation_error from public.meal_plans where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  'draft:timeout',
  'a failed generation returns to draft with the error'
);

select * from finish();
rollback;
