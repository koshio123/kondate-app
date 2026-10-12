-- Meal plan generation support for the generate-plan Edge Function.
-- All functions are SECURITY INVOKER, so the caller's RLS still applies.

alter table public.meal_plans
  add column request text not null default '',
  add column generation_started_at timestamptz,
  add column generation_error text,
  add column generation_meta jsonb;

comment on column public.meal_plans.request is 'Free-text wish from the leftovers screen (S3)';
comment on column public.meal_plans.generation_meta is 'Model, prompt version, tokens and warnings of the last generation';

-- ---------------------------------------------------------------------------
-- Claim a plan for generation (prevents two generations of the same plan).
-- A generation that has been running for over 3 minutes is treated as dead
-- (the Edge Function wall clock is 150 seconds on the free plan).
-- ---------------------------------------------------------------------------

create or replace function public.claim_plan_generation(p_plan_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.meal_plans
     set status = 'generating',
         generation_started_at = now(),
         generation_error = null
   where id = p_plan_id
     and (
       status in ('draft', 'proposed')
       or (status = 'generating' and generation_started_at < now() - interval '3 minutes')
     );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.fail_plan_generation(p_plan_id uuid, p_error text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.meal_plans
     set status = 'draft', generation_error = p_error
   where id = p_plan_id and status = 'generating';
$$;

-- ---------------------------------------------------------------------------
-- Save a generated plan in one transaction.
-- p_days: [{ date, dishes: [{ title, course, cook_minutes, steps, uses_leftovers,
--           ingredients: [{ name, amount, unit, is_pantry }] }] }]
-- p_meta: { servings, model, prompt_version, ... }
-- ---------------------------------------------------------------------------

create or replace function public.save_generated_plan(p_plan_id uuid, p_days jsonb, p_meta jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household uuid;
  v_servings integer := greatest(coalesce((p_meta ->> 'servings')::integer, 2), 1);
  v_old_recipes uuid[];
  v_day jsonb;
  v_day_id uuid;
  v_dish jsonb;
  v_recipe uuid;
  v_position integer;
begin
  select household_id into v_household
    from public.meal_plans
   where id = p_plan_id and status = 'generating';
  if v_household is null then
    raise exception 'meal plan % is not being generated', p_plan_id using errcode = 'P0002';
  end if;

  -- Replace the previous proposal (regeneration).
  select coalesce(array_agg(pd.recipe_id), '{}') into v_old_recipes
    from public.planned_dishes pd
    join public.meal_plan_days d on d.id = pd.meal_plan_day_id
   where d.meal_plan_id = p_plan_id;

  delete from public.planned_dishes pd
   using public.meal_plan_days d
   where d.id = pd.meal_plan_day_id and d.meal_plan_id = p_plan_id;

  -- Generated recipes nobody kept (not favourite, not rated, not used elsewhere) go away.
  delete from public.recipes r
   where r.id = any (v_old_recipes)
     and r.source = 'llm'
     and not r.is_favorite
     and r.rating is null
     and not exists (select 1 from public.planned_dishes pd where pd.recipe_id = r.id);

  update public.leftovers set used_in_plan_id = null where used_in_plan_id = p_plan_id;

  for v_day in select value from jsonb_array_elements(p_days) loop
    select id into v_day_id
      from public.meal_plan_days
     where meal_plan_id = p_plan_id
       and date = (v_day ->> 'date')::date
       and meal_type = 'dinner';
    if v_day_id is null then
      raise exception 'date % is not part of meal plan %', v_day ->> 'date', p_plan_id;
    end if;

    v_position := 0;
    for v_dish in select value from jsonb_array_elements(v_day -> 'dishes') loop
      insert into public.recipes (household_id, title, course, cook_minutes, servings, steps, source)
      values (
        v_household,
        v_dish ->> 'title',
        v_dish ->> 'course',
        (v_dish ->> 'cook_minutes')::integer,
        v_servings,
        coalesce(v_dish -> 'steps', '[]'::jsonb),
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
      from jsonb_array_elements(coalesce(v_dish -> 'ingredients', '[]'::jsonb)) with ordinality as x(item, ord);

      insert into public.planned_dishes (meal_plan_day_id, recipe_id, course, position)
      values (v_day_id, v_recipe, v_dish ->> 'course', v_position);
      v_position := v_position + 1;
    end loop;
  end loop;

  update public.leftovers l
     set used_in_plan_id = p_plan_id
   where l.household_id = v_household
     and l.used_in_plan_id is null
     and l.raw_name in (
       select jsonb_array_elements_text(dish -> 'uses_leftovers')
         from jsonb_array_elements(p_days) as day,
              jsonb_array_elements(day -> 'dishes') as dish
     );

  update public.meal_plans
     set status = 'proposed', generation_meta = p_meta, generation_error = null
   where id = p_plan_id;
end;
$$;

revoke execute on function public.claim_plan_generation(uuid) from public, anon;
revoke execute on function public.fail_plan_generation(uuid, text) from public, anon;
revoke execute on function public.save_generated_plan(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.claim_plan_generation(uuid) to authenticated;
grant execute on function public.fail_plan_generation(uuid, text) to authenticated;
grant execute on function public.save_generated_plan(uuid, jsonb, jsonb) to authenticated;

-- The app watches meal_plans.status while a plan is generated in the background.
alter publication supabase_realtime add table public.meal_plans;
