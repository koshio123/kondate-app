-- Shopping list (S6). The app computes the items from the confirmed plan
-- (apps/web/src/lib/shopping.ts) and saves them here in one transaction.

-- A stable key per generated item ("i:<ingredient id>" or "n:<normalized name>") lets a rebuilt
-- list keep the checks already made in the shop. Manual items have no key.
alter table public.shopping_items add column item_key text;

create unique index shopping_items_list_key_idx
  on public.shopping_items (shopping_list_id, item_key)
  where item_key is not null;

-- p_items: [{ key, ingredient_id, display_name, category_id, amount, unit, note, is_pantry, position }]
create or replace function public.replace_shopping_list(p_plan_id uuid, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_list_id uuid;
begin
  if not exists (select 1 from public.meal_plans where id = p_plan_id and status = 'confirmed') then
    raise exception 'meal plan % is not confirmed', p_plan_id using errcode = 'P0002';
  end if;

  insert into public.shopping_lists (meal_plan_id)
  values (p_plan_id)
  on conflict (meal_plan_id) do update set updated_at = now()
  returning id into v_list_id;

  -- Generated items that are no longer needed go; manual items stay.
  delete from public.shopping_items si
   where si.shopping_list_id = v_list_id
     and not si.is_manual
     and si.item_key not in (select x ->> 'key' from jsonb_array_elements(p_items) as x);

  insert into public.shopping_items (
    shopping_list_id, item_key, ingredient_id, display_name, category_id,
    amount, unit, note, is_pantry, position
  )
  select
    v_list_id,
    x ->> 'key',
    nullif(x ->> 'ingredient_id', '')::uuid,
    x ->> 'display_name',
    (x ->> 'category_id')::uuid,
    case when (x ->> 'amount')::numeric > 0 then (x ->> 'amount')::numeric end,
    coalesce(x ->> 'unit', ''),
    coalesce(x ->> 'note', ''),
    coalesce((x ->> 'is_pantry')::boolean, false),
    coalesce((x ->> 'position')::integer, 0)
  from jsonb_array_elements(p_items) as x
  on conflict (shopping_list_id, item_key) where item_key is not null
  do update set
    ingredient_id = excluded.ingredient_id,
    display_name = excluded.display_name,
    category_id = excluded.category_id,
    amount = excluded.amount,
    unit = excluded.unit,
    note = excluded.note,
    is_pantry = excluded.is_pantry,
    position = excluded.position;

  return v_list_id;
end;
$$;

revoke execute on function public.replace_shopping_list(uuid, jsonb) from public, anon;
grant execute on function public.replace_shopping_list(uuid, jsonb) to authenticated;
