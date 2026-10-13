-- Table privileges for the Data API roles (20261013000700_data_api_grants.sql).

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select count(*) from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name <> 'ingredient_categories'),
  0::bigint,
  'anon has no privileges on household tables'
);
select ok(has_table_privilege('anon', 'public.ingredient_categories', 'select'), 'anon can read store sections (keep-alive)');
select ok(not has_table_privilege('anon', 'public.ingredient_categories', 'insert'), 'anon cannot write store sections');

select ok(has_table_privilege('authenticated', 'public.recipes', 'select, insert, update, delete'), 'the app can read and write recipes');
select ok(has_table_privilege('authenticated', 'public.shopping_items', 'update'), 'the app can check shopping items');
select ok(not has_table_privilege('authenticated', 'public.household_members', 'insert'), 'the allowlist cannot be changed from the app');
select ok(not has_table_privilege('authenticated', 'public.ingredients', 'insert'), 'the ingredient master is read-only');

-- Every table in public has RLS enabled.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint,
  'every public table has row level security'
);

select * from finish();
rollback;
