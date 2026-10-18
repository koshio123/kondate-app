-- Make-ahead (作り置き): cook a dish once and eat it again on later days of the same plan.
--
-- A make-ahead row in planned_dishes has made_on = the planned dish of the day it is cooked,
-- and the same recipe_id. The shopping list adds up planned dishes row by row, so the
-- ingredients for every meal are bought without any change there.
--
--   make_ahead:             put a dish on later days, replacing a dish there or adding it
--   swap_planned_dish:      a swapped make-ahead dish becomes an ordinary dish; swapping the
--                           dish of the cooking day changes its make-ahead dishes too
--   replace_planned_dishes: a re-suggested day keeps its make-ahead dishes; make-ahead dishes
--                           of a re-suggested dish follow the new dish of the same course
-- SECURITY INVOKER, so the caller's RLS still applies.

alter table public.planned_dishes
  add column made_on uuid references public.planned_dishes (id) on delete set null,
  add check (made_on is distinct from id);

create index planned_dishes_made_on_idx on public.planned_dishes (made_on) where made_on is not null;

-- ---------------------------------------------------------------------------
-- p_targets: [{ "day_id": uuid, "replace_dish_id": uuid | null }]
-- replace_dish_id null adds the dish to that day.
-- ---------------------------------------------------------------------------

create or replace function public.make_ahead(p_source_dish uuid, p_targets jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.meal_plans;
  v_source public.planned_dishes;
  v_source_date date;
  v_target jsonb;
  v_day public.meal_plan_days;
  v_replace public.planned_dishes;
  v_position integer;
  v_old uuid[] := '{}';
  v_old_titles text[] := '{}';
begin
  select p.* into v_plan
    from public.meal_plans p
    join public.meal_plan_days d on d.meal_plan_id = p.id
    join public.planned_dishes pd on pd.meal_plan_day_id = d.id
   where pd.id = p_source_dish
     for update of p;
  if v_plan.id is null or v_plan.status not in ('proposed', 'confirmed') then
    raise exception 'dish % cannot be changed', p_source_dish using errcode = 'P0002';
  end if;

  select * into v_source from public.planned_dishes where id = p_source_dish;
  if v_source.made_on is not null then
    raise exception 'a make-ahead dish cannot be made ahead again' using errcode = '22023';
  end if;
  select date into v_source_date from public.meal_plan_days where id = v_source.meal_plan_day_id;

  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'no days to make ahead for' using errcode = '22023';
  end if;
  -- At most 3 meals from one cooking, so the same dish does not go on and on.
  if (select count(*) from public.planned_dishes where made_on = p_source_dish)
     + jsonb_array_length(p_targets) > 2 then
    raise exception 'a dish can be eaten again on at most 2 days' using errcode = '22023';
  end if;

  for v_target in select value from jsonb_array_elements(p_targets) loop
    select * into v_day from public.meal_plan_days
     where id = (v_target ->> 'day_id')::uuid and meal_plan_id = v_plan.id;
    if v_day.id is null or v_day.mode = 'none' or v_day.date <= v_source_date then
      raise exception 'day % must be a later day of the same plan with dinner', v_target ->> 'day_id'
        using errcode = '22023';
    end if;
    if exists (select 1 from public.planned_dishes
                where meal_plan_day_id = v_day.id and made_on = p_source_dish) then
      raise exception 'the dish is already made ahead for %', v_day.date using errcode = '22023';
    end if;

    if v_target ->> 'replace_dish_id' is null then
      select coalesce(max(position) + 1, 0) into v_position
        from public.planned_dishes where meal_plan_day_id = v_day.id;
    else
      select * into v_replace from public.planned_dishes
       where id = (v_target ->> 'replace_dish_id')::uuid and meal_plan_day_id = v_day.id;
      if v_replace.id is null then
        raise exception 'dish % is not part of day %', v_target ->> 'replace_dish_id', v_day.id
          using errcode = 'P0002';
      end if;
      v_position := v_replace.position;
      v_old := v_old || v_replace.recipe_id;
      v_old_titles := v_old_titles || (select title from public.recipes where id = v_replace.recipe_id);
      -- Dishes made ahead from the replaced one stay as ordinary dishes (made_on set null).
      delete from public.planned_dishes where id = v_replace.id;
    end if;

    insert into public.planned_dishes (meal_plan_day_id, recipe_id, course, position, made_on)
    values (v_day.id, v_source.recipe_id, v_source.course, v_position, p_source_dish);
  end loop;

  perform public.delete_unkept_recipes(v_old);

  -- Warnings about dishes that left no longer apply.
  update public.meal_plans
     set generation_meta = jsonb_set(
           generation_meta,
           '{warnings}',
           coalesce(
             (select jsonb_agg(w)
                from jsonb_array_elements(generation_meta -> 'warnings') as w
               where not (coalesce(w ->> 'dish', '') = any (v_old_titles))),
             '[]'::jsonb
           )
         )
   where id = v_plan.id and jsonb_typeof(generation_meta -> 'warnings') = 'array';
end;
$$;

-- ---------------------------------------------------------------------------
-- swap_planned_dish: as before, plus make-ahead handling.
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

  -- A swapped make-ahead dish is cooked on its own day from now on.
  update public.planned_dishes
     set recipe_id = p_recipe_id, course = v_course, made_on = null
   where id = p_dish_id;
  -- Make-ahead dishes of this one are the same food, so they change with it.
  update public.planned_dishes
     set recipe_id = p_recipe_id, course = v_course
   where made_on = p_dish_id;
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

-- ---------------------------------------------------------------------------
-- replace_planned_dishes: as before, plus make-ahead handling.
--   p_dish_id null: replace the day's dishes except its make-ahead dishes, which stay.
--   Make-ahead dishes of a replaced dish move to the new dish of the same course, or become
--   ordinary dishes when there is none.
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
  v_replaced uuid[];
  v_followers jsonb;
  v_follower jsonb;
  v_dish jsonb;
  v_recipe uuid;
  v_new_dish uuid;
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
    select coalesce(array_agg(id), '{}'), coalesce(array_agg(recipe_id), '{}')
      into v_replaced, v_old
      from public.planned_dishes where meal_plan_day_id = p_day_id and made_on is null;
    v_position := 0;
  else
    select array[id], array[recipe_id], position into v_replaced, v_old, v_position
      from public.planned_dishes where id = p_dish_id and meal_plan_day_id = p_day_id;
    if v_old is null then
      raise exception 'dish % is not part of day %', p_dish_id, p_day_id using errcode = 'P0002';
    end if;
    if jsonb_array_length(p_dishes) <> 1 then
      raise exception 'replacing one dish needs exactly one new dish';
    end if;
  end if;

  -- Remember the make-ahead dishes of the dishes about to go (deleting them clears made_on).
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'course', s.course)), '[]'::jsonb)
    into v_followers
    from public.planned_dishes f
    join public.planned_dishes s on s.id = f.made_on
   where f.made_on = any (v_replaced);

  delete from public.planned_dishes where id = any (v_replaced);

  for v_dish in select value from jsonb_array_elements(p_dishes) loop
    v_recipe := public.insert_generated_recipe(v_plan.household_id, p_servings, v_dish);
    insert into public.planned_dishes (meal_plan_day_id, recipe_id, course, position)
    values (p_day_id, v_recipe, v_dish ->> 'course', v_position)
    returning id into v_new_dish;
    v_position := v_position + 1;

    for v_follower in
      select value from jsonb_array_elements(v_followers) where value ->> 'course' = v_dish ->> 'course'
    loop
      update public.planned_dishes
         set made_on = v_new_dish, recipe_id = v_recipe, course = v_dish ->> 'course'
       where id = (v_follower ->> 'id')::uuid;
    end loop;
    v_followers := (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
        from jsonb_array_elements(v_followers)
       where value ->> 'course' <> v_dish ->> 'course'
    );
  end loop;

  -- Kept make-ahead dishes of the day go after the new ones.
  if p_dish_id is null then
    with kept as (
      select id, row_number() over (order by position) - 1 as n
        from public.planned_dishes where meal_plan_day_id = p_day_id and made_on is not null
    )
    update public.planned_dishes pd set position = v_position + kept.n
      from kept where pd.id = kept.id;
  end if;

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

revoke execute on function public.make_ahead(uuid, jsonb) from public, anon;
grant execute on function public.make_ahead(uuid, jsonb) to authenticated;
