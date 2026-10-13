-- One meal plan per date.
--
-- Planning a period that overlaps other plans used to leave both plans in place, so the old
-- dinners stayed on screen. Now the plan saved last owns its dates:
--   * an older plan that starts before it keeps only its days before the new start
--     (a plan stays one continuous period, so its days after the new plan go too);
--   * an older plan that starts within it is archived (hidden; recipes and ratings remain).
-- The app warns before saving (S2) and offers re-suggesting a single day instead.

-- p_only_older: only plans created before this one give way (used to fix existing data).
create or replace function public.claim_plan_dates(p_plan_id uuid, p_only_older boolean default false)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.meal_plans;
  v_other public.meal_plans;
  v_removed uuid[];
begin
  select * into v_plan from public.meal_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'meal plan % not found', p_plan_id using errcode = 'P0002';
  end if;

  for v_other in
    select * from public.meal_plans
     where household_id = v_plan.household_id
       and id <> v_plan.id
       and status <> 'archived'
       and start_date <= v_plan.end_date
       and end_date >= v_plan.start_date
       and (not p_only_older or created_at < v_plan.created_at)
     order by start_date
     for update
  loop
    if v_other.start_date < v_plan.start_date then
      select coalesce(array_agg(pd.recipe_id), '{}') into v_removed
        from public.planned_dishes pd
        join public.meal_plan_days d on d.id = pd.meal_plan_day_id
       where d.meal_plan_id = v_other.id and d.date >= v_plan.start_date;

      delete from public.meal_plan_days
       where meal_plan_id = v_other.id and date >= v_plan.start_date;

      update public.meal_plans
         set end_date = v_plan.start_date - 1,
             generation_meta = case
               when jsonb_typeof(generation_meta -> 'warnings') = 'array' then jsonb_set(
                 generation_meta, '{warnings}',
                 coalesce((
                   select jsonb_agg(w) from jsonb_array_elements(generation_meta -> 'warnings') as w
                    where w ->> 'date' is null or (w ->> 'date')::date < v_plan.start_date
                 ), '[]'::jsonb))
               else generation_meta
             end
       where id = v_other.id;

      perform public.delete_unkept_recipes(v_removed);
    else
      update public.meal_plans set status = 'archived' where id = v_other.id;
      -- Its leftovers can be used by the new plan.
      update public.leftovers set used_in_plan_id = null where used_in_plan_id = v_other.id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.claim_plan_dates(uuid, boolean) from public, anon;
grant execute on function public.claim_plan_dates(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- save_plan_draft: same as 20261012000400, plus claiming the dates at the end.
-- ---------------------------------------------------------------------------

create or replace function public.save_plan_draft(
  p_plan_id uuid,
  p_start date,
  p_end date,
  p_days jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
  v_plan_id uuid;
  v_old_recipes uuid[];
begin
  if v_household is null then
    raise exception 'not a household member' using errcode = '42501';
  end if;
  if p_end < p_start or p_end - p_start >= 10 then
    raise exception 'a plan covers 1 to 10 days' using errcode = '22023';
  end if;

  if p_plan_id is null then
    insert into public.meal_plans (household_id, start_date, end_date)
    values (v_household, p_start, p_end)
    returning id into v_plan_id;
  else
    update public.meal_plans
       set start_date = p_start,
           end_date = p_end,
           status = 'draft',
           generation_error = null,
           generation_meta = null
     where id = p_plan_id
       and status in ('draft', 'proposed')
    returning id into v_plan_id;
    if v_plan_id is null then
      raise exception 'meal plan % cannot be edited', p_plan_id using errcode = 'P0002';
    end if;

    select coalesce(array_agg(pd.recipe_id), '{}') into v_old_recipes
      from public.planned_dishes pd
      join public.meal_plan_days d on d.id = pd.meal_plan_day_id
     where d.meal_plan_id = v_plan_id;

    delete from public.meal_plan_days where meal_plan_id = v_plan_id;
    perform public.delete_unkept_recipes(v_old_recipes);
    update public.leftovers set used_in_plan_id = null where used_in_plan_id = v_plan_id;
  end if;

  insert into public.meal_plan_days (meal_plan_id, date, mode)
  select v_plan_id, (d ->> 'date')::date, d ->> 'mode'
    from jsonb_array_elements(p_days) as d;

  if exists (
    select 1 from public.meal_plan_days
     where meal_plan_id = v_plan_id and (date < p_start or date > p_end)
  ) or (
    select count(*) from public.meal_plan_days where meal_plan_id = v_plan_id
  ) <> (p_end - p_start + 1) then
    raise exception 'every day of the period needs exactly one mode' using errcode = '22023';
  end if;

  perform public.claim_plan_dates(v_plan_id);
  return v_plan_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing data: resolve overlaps as if the plans had been saved in creation order.
-- ---------------------------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.meal_plans where status <> 'archived' order by created_at
  loop
    -- A plan archived earlier in this loop no longer claims anything.
    if (select status from public.meal_plans where id = v_id) <> 'archived' then
      perform public.claim_plan_dates(v_id, true);
    end if;
  end loop;
end;
$$;
