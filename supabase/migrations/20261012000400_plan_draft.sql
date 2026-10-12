-- Create or edit a draft meal plan and its days in one transaction (S2 計画作成).
-- p_days: [{ "date": "2026-10-13", "mode": "normal" | "quick" | "none" }], one per day of the period.
-- Editing a proposed plan sends it back to draft and drops its proposal.

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

    delete from public.recipes r
     where r.id = any (v_old_recipes)
       and r.source = 'llm'
       and not r.is_favorite
       and r.rating is null
       and not exists (select 1 from public.planned_dishes pd where pd.recipe_id = r.id);

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

  return v_plan_id;
end;
$$;

revoke execute on function public.save_plan_draft(uuid, date, date, jsonb) from public, anon;
grant execute on function public.save_plan_draft(uuid, date, date, jsonb) to authenticated;
