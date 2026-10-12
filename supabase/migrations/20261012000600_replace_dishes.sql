-- Changing part of a proposed or confirmed plan (S4):
--   replace_planned_dishes: save a re-suggested day or dish from the regenerate Edge Function
--   swap_planned_dish:      put a favourite recipe in place of a dish
-- SECURITY INVOKER, so the caller's RLS still applies.

-- Generated recipes nobody kept (not favourite, not rated, not in any plan) are removed.
create or replace function public.delete_unkept_recipes(p_recipe_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.recipes r
   where r.id = any (p_recipe_ids)
     and r.source = 'llm'
     and not r.is_favorite
     and r.rating is null
     and not exists (select 1 from public.planned_dishes pd where pd.recipe_id = r.id);
$$;

-- p_dish: { title, course, cook_minutes, steps, ingredients: [{ name, amount, unit, is_pantry }] }
create or replace function public.insert_generated_recipe(p_household uuid, p_servings integer, p_dish jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipe uuid;
begin
  insert into public.recipes (household_id, title, course, cook_minutes, servings, steps, source)
  values (
    p_household,
    p_dish ->> 'title',
    p_dish ->> 'course',
    (p_dish ->> 'cook_minutes')::integer,
    greatest(coalesce(p_servings, 2), 1),
    coalesce(p_dish -> 'steps', '[]'::jsonb),
    'llm'
  )
  returning id into v_recipe;

  insert into public.recipe_ingredients (recipe_id, ingredient_id, raw_name, amount, unit, is_pantry, position)
  select
    v_recipe,
    (
      select i.id from public.ingredients i
       where i.name = x.item ->> 'name' or (x.item ->> 'name') = any (i.aliases)
       limit 1
    ),
    x.item ->> 'name',
    case when (x.item ->> 'amount')::numeric > 0 then (x.item ->> 'amount')::numeric end,
    coalesce(x.item ->> 'unit', ''),
    coalesce((x.item ->> 'is_pantry')::boolean, false),
    (x.ord - 1)::integer
  from jsonb_array_elements(coalesce(p_dish -> 'ingredients', '[]'::jsonb)) with ordinality as x(item, ord);

  return v_recipe;
end;
$$;

-- ---------------------------------------------------------------------------
-- p_dish_id null: replace every dish of the day; otherwise only that dish (p_dishes has one).
-- p_warnings replace the day's previous warnings in generation_meta.
-- ---------------------------------------------------------------------------

create or replace function public.replace_planned_dishes(
  p_day_id uuid,
  p_dish_id uuid,
  p_dishes jsonb,
  p_warnings jsonb,
  p_servings integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.meal_plans;
  v_date date;
  v_position integer;
  v_old uuid[];
  v_dish jsonb;
  v_recipe uuid;
begin
  select p.* into v_plan
    from public.meal_plans p
    join public.meal_plan_days d on d.meal_plan_id = p.id
   where d.id = p_day_id and d.mode <> 'none'
     for update of p;
  if v_plan.id is null or v_plan.status not in ('proposed', 'confirmed') then
    raise exception 'day % cannot be changed', p_day_id using errcode = 'P0002';
  end if;
  select date into v_date from public.meal_plan_days where id = p_day_id;

  if p_dish_id is null then
    select coalesce(array_agg(recipe_id), '{}') into v_old
      from public.planned_dishes where meal_plan_day_id = p_day_id;
    delete from public.planned_dishes where meal_plan_day_id = p_day_id;
    v_position := 0;
  else
    select array[recipe_id], position into v_old, v_position
      from public.planned_dishes where id = p_dish_id and meal_plan_day_id = p_day_id;
    if v_old is null then
      raise exception 'dish % is not part of day %', p_dish_id, p_day_id using errcode = 'P0002';
    end if;
    if jsonb_array_length(p_dishes) <> 1 then
      raise exception 'replacing one dish needs exactly one new dish';
    end if;
    delete from public.planned_dishes where id = p_dish_id;
  end if;

  for v_dish in select value from jsonb_array_elements(p_dishes) loop
    v_recipe := public.insert_generated_recipe(v_plan.household_id, p_servings, v_dish);
    insert into public.planned_dishes (meal_plan_day_id, recipe_id, course, position)
    values (p_day_id, v_recipe, v_dish ->> 'course', v_position);
    v_position := v_position + 1;
  end loop;

  perform public.delete_unkept_recipes(v_old);

  update public.leftovers l
     set used_in_plan_id = v_plan.id
   where l.household_id = v_plan.household_id
     and l.used_in_plan_id is null
     and l.raw_name in (
       select jsonb_array_elements_text(dish -> 'uses_leftovers')
         from jsonb_array_elements(p_dishes) as dish
     );

  update public.meal_plans
     set generation_meta = jsonb_set(
           coalesce(generation_meta, '{}'::jsonb),
           '{warnings}',
           coalesce(
             (select jsonb_agg(w)
                from jsonb_array_elements(coalesce(generation_meta -> 'warnings', '[]'::jsonb)) as w
               where w ->> 'date' is distinct from v_date::text),
             '[]'::jsonb
           ) || coalesce(p_warnings, '[]'::jsonb)
         )
   where id = v_plan.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Put an existing recipe (a favourite) in place of a dish.
-- ---------------------------------------------------------------------------

create or replace function public.swap_planned_dish(p_dish_id uuid, p_recipe_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.meal_plans;
  v_old uuid;
  v_old_title text;
  v_course text;
begin
  select p.* into v_plan
    from public.meal_plans p
    join public.meal_plan_days d on d.meal_plan_id = p.id
    join public.planned_dishes pd on pd.meal_plan_day_id = d.id
   where pd.id = p_dish_id
     for update of p;
  if v_plan.id is null or v_plan.status not in ('proposed', 'confirmed') then
    raise exception 'dish % cannot be changed', p_dish_id using errcode = 'P0002';
  end if;

  select course into v_course
    from public.recipes where id = p_recipe_id and household_id = v_plan.household_id;
  if v_course is null then
    raise exception 'recipe % not found', p_recipe_id using errcode = 'P0002';
  end if;

  select pd.recipe_id, r.title into v_old, v_old_title
    from public.planned_dishes pd
    left join public.recipes r on r.id = pd.recipe_id
   where pd.id = p_dish_id;

  update public.planned_dishes set recipe_id = p_recipe_id, course = v_course where id = p_dish_id;
  perform public.delete_unkept_recipes(array[v_old]);

  -- Warnings about the dish that left no longer apply.
  update public.meal_plans
     set generation_meta = jsonb_set(
           generation_meta,
           '{warnings}',
           coalesce(
             (select jsonb_agg(w)
                from jsonb_array_elements(generation_meta -> 'warnings') as w
               where w ->> 'dish' is distinct from v_old_title),
             '[]'::jsonb
           )
         )
   where id = v_plan.id and jsonb_typeof(generation_meta -> 'warnings') = 'array';
end;
$$;

revoke execute on function public.delete_unkept_recipes(uuid[]) from public, anon;
revoke execute on function public.insert_generated_recipe(uuid, integer, jsonb) from public, anon;
revoke execute on function public.replace_planned_dishes(uuid, uuid, jsonb, jsonb, integer) from public, anon;
revoke execute on function public.swap_planned_dish(uuid, uuid) from public, anon;
grant execute on function public.delete_unkept_recipes(uuid[]) to authenticated;
grant execute on function public.insert_generated_recipe(uuid, integer, jsonb) to authenticated;
grant execute on function public.replace_planned_dishes(uuid, uuid, jsonb, jsonb, integer) to authenticated;
grant execute on function public.swap_planned_dish(uuid, uuid) to authenticated;
