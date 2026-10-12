-- Tests for save_plan_draft.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('cccccccc-0000-0000-0000-000000000001', 'stranger@test.local');
insert into public.households (id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'A');
insert into public.household_members (household_id, email, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@test.local', 'A1');

set local role authenticated;

-- Not allowlisted
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000001", "email": "stranger@test.local"}';
select throws_ok(
  $$select public.save_plan_draft(null, '2026-10-13', '2026-10-13', '[{"date": "2026-10-13", "mode": "normal"}]')$$,
  '42501', null, 'a stranger cannot create a plan'
);

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "a@test.local"}';

create temporary table ids (id uuid) on commit drop;
insert into ids
select public.save_plan_draft(
  null, '2026-10-13', '2026-10-15',
  '[{"date": "2026-10-13", "mode": "normal"}, {"date": "2026-10-14", "mode": "quick"}, {"date": "2026-10-15", "mode": "none"}]'
);

select is(
  (select array_agg(mode order by date) from public.meal_plan_days where meal_plan_id = (select id from ids)),
  array['normal', 'quick', 'none'],
  'a new draft is created with its days'
);

select throws_ok(
  $$select public.save_plan_draft(null, '2026-10-13', '2026-10-14', '[{"date": "2026-10-13", "mode": "normal"}]')$$,
  '22023', null, 'every day of the period needs a mode'
);

select throws_ok(
  $$select public.save_plan_draft(null, '2026-10-13', '2026-10-23', '[]')$$,
  '22023', null, 'plans longer than 10 days are rejected'
);

-- Edit a proposed plan: days are replaced and the proposal is dropped.
select public.claim_plan_generation((select id from ids));
select public.save_generated_plan(
  (select id from ids),
  '[{"date": "2026-10-13", "dishes": [{"title": "回鍋肉", "course": "main", "cook_minutes": 20, "steps": [], "uses_leftovers": [], "ingredients": []}]}]',
  '{"servings": 2}'
);

select is(
  public.save_plan_draft(
    (select id from ids), '2026-10-14', '2026-10-15',
    '[{"date": "2026-10-14", "mode": "normal"}, {"date": "2026-10-15", "mode": "normal"}]'
  ),
  (select id from ids),
  'editing keeps the plan id'
);
select is((select status from public.meal_plans where id = (select id from ids)), 'draft', 'an edited plan is a draft again');
select is((select count(*) from public.recipes), 0::bigint, 'the dropped proposal''s generated recipes are deleted');

update public.meal_plans set status = 'confirmed' where id = (select id from ids);
select throws_ok(
  format($$select public.save_plan_draft(%L, '2026-10-14', '2026-10-14', '[{"date": "2026-10-14", "mode": "normal"}]')$$, (select id from ids)),
  'P0002', null, 'a confirmed plan cannot be edited'
);

select * from finish();
rollback;
