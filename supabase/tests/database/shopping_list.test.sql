-- Tests for replace_shopping_list.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local');
insert into public.households (id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'A');
insert into public.household_members (household_id, email, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@test.local', 'A1');
insert into public.meal_plans (id, household_id, start_date, end_date, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-13', '2026-10-14', 'proposed');

create temporary table veg as select id from public.ingredient_categories where name = '野菜・果物';
grant select on veg to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "a@test.local"}';

select throws_ok(
  $$select public.replace_shopping_list('aaaaaaaa-0000-0000-0000-0000000000a1', '[]')$$,
  'P0002', null, 'a plan must be confirmed first'
);

reset role;
update public.meal_plans set status = 'confirmed';
set local role authenticated;

select lives_ok(format($$
  select public.replace_shopping_list('aaaaaaaa-0000-0000-0000-0000000000a1', '[
    {"key": "n:ごぼう", "display_name": "ごぼう", "category_id": "%1$s", "amount": 1, "unit": "本", "note": "", "is_pantry": false, "position": 0},
    {"key": "n:にんじん", "display_name": "にんじん", "category_id": "%1$s", "amount": 2, "unit": "本", "note": "", "is_pantry": false, "position": 1}
  ]')$$, (select id from veg)), 'the list is created');

select is((select count(*) from public.shopping_items), 2::bigint, 'two items are saved');

-- Check one item and add a manual one, then rebuild with a changed plan.
update public.shopping_items set checked = true where item_key = 'n:ごぼう';
insert into public.shopping_items (shopping_list_id, display_name, category_id, is_manual)
select id, '洗剤', (select id from veg), true from public.shopping_lists;

select lives_ok(format($$
  select public.replace_shopping_list('aaaaaaaa-0000-0000-0000-0000000000a1', '[
    {"key": "n:ごぼう", "display_name": "ごぼう", "category_id": "%1$s", "amount": 2, "unit": "本", "note": "2品分", "is_pantry": false, "position": 0},
    {"key": "n:れんこん", "display_name": "れんこん", "category_id": "%1$s", "amount": 1, "unit": "節", "note": "", "is_pantry": false, "position": 1}
  ]')$$, (select id from veg)), 'the list is rebuilt');

select is(
  (select array_agg(display_name || ':' || checked order by display_name) from public.shopping_items),
  array['ごぼう:true', 'れんこん:false', '洗剤:false'],
  'checks and manual items survive, removed items go'
);
select is((select amount from public.shopping_items where item_key = 'n:ごぼう'), 2::numeric, 'amounts are updated');
select is((select count(*) from public.shopping_lists), 1::bigint, 'one list per plan');

select * from finish();
rollback;
