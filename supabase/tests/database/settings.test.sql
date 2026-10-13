-- The settings screen (S8) writes members, member_food_restrictions and household_settings
-- directly through RLS. These tests cover the writes it makes.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@test.local');
insert into public.households (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'B');
insert into public.household_members (household_id, email, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@test.local', 'A1'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@test.local', 'B1');
insert into public.members (id, household_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Ken'),
  ('aaaaaaaa-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'パートナー'),
  ('bbbbbbbb-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'B');

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "a@test.local"}';

-- Restrictions ----------------------------------------------------------------
select lives_ok($$
  insert into public.member_food_restrictions (member_id, label, kind) values
    ('aaaaaaaa-0000-0000-0000-0000000000e1', 'セロリ', 'avoid'),
    ('aaaaaaaa-0000-0000-0000-0000000000e2', 'セロリ', 'avoid')
$$, 'restrictions are added for own members');

select lives_ok($$
  insert into public.member_food_restrictions (member_id, label, kind) values
    ('aaaaaaaa-0000-0000-0000-0000000000e1', 'セロリ', 'never')
  on conflict (member_id, label) do update set kind = excluded.kind
$$, 'saving the same food again updates its kind (upsert)');
select is(
  (select kind from public.member_food_restrictions
    where member_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' and label = 'セロリ'),
  'never', 'the kind is updated'
);

select throws_ok($$
  insert into public.member_food_restrictions (member_id, label, kind) values
    ('bbbbbbbb-0000-0000-0000-0000000000e1', 'えび', 'allergy')
$$, '42501', null, 'another household''s member cannot be given a restriction');

-- Members -----------------------------------------------------------------------
select lives_ok($$
  delete from public.members where id = 'aaaaaaaa-0000-0000-0000-0000000000e2'
$$, 'a member can be deleted');
select is(
  (select count(*) from public.member_food_restrictions), 1::bigint,
  'their restrictions go with them'
);

-- Household settings -------------------------------------------------------------
select lives_ok($$
  insert into public.household_settings (household_id, quick_mode_max_minutes)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', 20)
  on conflict (household_id) do update set quick_mode_max_minutes = excluded.quick_mode_max_minutes
$$, 'the quick-day limit is saved (upsert)');
select throws_ok($$
  insert into public.household_settings (household_id, quick_mode_max_minutes)
  values ('bbbbbbbb-0000-0000-0000-00000000000b', 20)
$$, '42501', null, 'another household''s settings cannot be written');

select * from finish();
rollback;
