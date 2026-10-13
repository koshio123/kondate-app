-- One meal plan per date (claim_plan_dates via save_plan_draft).

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local');
insert into public.households (id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'A');
insert into public.household_members (household_id, email, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@test.local', 'A1');

-- Plan P: 10/14-10/18, confirmed, with a dish on 10/14 and 10/16.
insert into public.meal_plans (id, household_id, start_date, end_date, status, created_at) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-14', '2026-10-18', 'confirmed', now() - interval '1 day');
insert into public.meal_plan_days (id, meal_plan_id, date, mode)
select ('aaaaaaaa-0000-0000-0000-0000000000' || to_char(14 + i, 'FM00'))::uuid,
       'aaaaaaaa-0000-0000-0000-0000000000a1', date '2026-10-14' + i, 'normal'
  from generate_series(0, 4) as i;
insert into public.recipes (id, household_id, title, course, cook_minutes, servings, source) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000a', '14日の主菜', 'main', 20, 2, 'llm'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-00000000000a', '16日の主菜', 'main', 20, 2, 'llm');
insert into public.planned_dishes (meal_plan_day_id, recipe_id, course, position) values
  ('aaaaaaaa-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'main', 0),
  ('aaaaaaaa-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'main', 0);

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "a@test.local"}';

-- A new plan from 10/16: P keeps 10/14-10/15 ------------------------------------
create temporary table new_plan (id uuid) on commit drop;
grant all on new_plan to authenticated;
insert into new_plan
select public.save_plan_draft(null, '2026-10-16', '2026-10-17',
  '[{"date": "2026-10-16", "mode": "normal"}, {"date": "2026-10-17", "mode": "quick"}]');

select is(
  (select end_date from public.meal_plans where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  '2026-10-15'::date, 'the older plan ends the day before the new one'
);
select is(
  (select array_agg(date order by date) from public.meal_plan_days
    where meal_plan_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  array['2026-10-14'::date, '2026-10-15'::date],
  'its later days are removed'
);
select is((select status from public.meal_plans where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  'confirmed', 'it stays confirmed');
select is((select count(*) from public.recipes where title = '16日の主菜'), 0::bigint,
  'dishes of the removed days are cleaned up');
select is((select count(*) from public.recipes where title = '14日の主菜'), 1::bigint,
  'dishes of the kept days stay');

-- A new plan for 10/14 only: P (starting on 10/14) is archived -------------------
select lives_ok($$
  select public.save_plan_draft(null, '2026-10-14', '2026-10-14', '[{"date": "2026-10-14", "mode": "normal"}]')
$$, 'a one-day plan is saved');
select is((select status from public.meal_plans where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  'archived', 'the plan it covers from the start is archived');
select is((select count(*) from public.recipes where title = '14日の主菜'), 1::bigint,
  'an archived plan keeps its recipes');
select is((select status from public.meal_plans where id = (select id from new_plan)), 'draft',
  'the plan from 10/16 is untouched');

select is(
  (select count(*) from public.meal_plans a join public.meal_plans b
     on a.id < b.id and a.status <> 'archived' and b.status <> 'archived'
    and a.start_date <= b.end_date and a.end_date >= b.start_date),
  0::bigint, 'no two active plans share a date'
);

-- Fixing old data: an older plan never pushes out a newer one --------------------
reset role;
insert into public.meal_plans (id, household_id, start_date, end_date, status, created_at) values
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-20', '2026-10-24', 'proposed', now() - interval '2 days'),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-20', '2026-10-20', 'draft', now() - interval '1 hour');
set local role authenticated;
select public.claim_plan_dates('aaaaaaaa-0000-0000-0000-0000000000a2', true);
select public.claim_plan_dates('aaaaaaaa-0000-0000-0000-0000000000a3', true);
select is(
  (select array_agg(status order by start_date, created_at) from public.meal_plans
    where id in ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-0000000000a3')),
  array['archived', 'draft'],
  'in creation order, the newer plan wins'
);

select * from finish();
rollback;
