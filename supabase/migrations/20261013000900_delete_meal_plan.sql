-- Delete a meal plan (S4 / S1).
-- Its days, dishes and shopping list go with it (on delete cascade), leftovers it used are
-- released (on delete set null), and generated recipes nobody kept are removed.
-- Favourite or rated recipes stay. A plan being generated cannot be deleted until it finishes.

create or replace function public.delete_meal_plan(p_plan_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_recipes uuid[];
begin
  select status into v_status from public.meal_plans where id = p_plan_id for update;
  if v_status is null then
    raise exception 'meal plan % not found', p_plan_id using errcode = 'P0002';
  end if;
  if v_status = 'generating' then
    raise exception 'meal plan % is being generated', p_plan_id using errcode = '55006';
  end if;

  select coalesce(array_agg(pd.recipe_id), '{}') into v_recipes
    from public.planned_dishes pd
    join public.meal_plan_days d on d.id = pd.meal_plan_day_id
   where d.meal_plan_id = p_plan_id;

  delete from public.meal_plans where id = p_plan_id;
  perform public.delete_unkept_recipes(v_recipes);
end;
$$;

revoke execute on function public.delete_meal_plan(uuid) from public, anon;
grant execute on function public.delete_meal_plan(uuid) to authenticated;
