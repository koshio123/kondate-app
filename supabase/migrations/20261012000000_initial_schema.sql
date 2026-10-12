-- Initial schema for kondate-app.
-- See docs/02_design.md "3. データモデル".

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Households and people
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Allowlist of Google accounts that may sign in (people who log in).
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- People who eat (used for portions and nutrition targets). Independent of login.
create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  birth_date date,
  sex text check (sex in ('male', 'female')),
  activity_level text not null default 'normal' check (activity_level in ('low', 'normal', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  quick_mode_max_minutes integer not null default 15 check (quick_mode_max_minutes between 5 and 120),
  dinner_ratio numeric(4, 3) not null default 0.333 check (dinner_ratio > 0 and dinner_ratio <= 1),
  category_order uuid[] not null default '{}',
  budget_per_week integer check (budget_per_week >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ingredient master (shared, read-only for clients)
-- ---------------------------------------------------------------------------

create table public.ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] not null default '{}',
  category_id uuid not null references public.ingredient_categories (id),
  base_unit text not null,
  grams_per_piece numeric check (grams_per_piece > 0),
  shelf_life_days integer check (shelf_life_days > 0),
  food_composition_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ingredients_aliases_idx on public.ingredients using gin (aliases);
create index ingredients_category_id_idx on public.ingredients (category_id);

create table public.member_food_restrictions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  label text not null,
  kind text not null check (kind in ('allergy', 'never', 'avoid')),
  created_at timestamptz not null default now(),
  unique (member_id, label)
);

-- ---------------------------------------------------------------------------
-- Recipes and meal plans
-- ---------------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  course text not null check (course in ('staple', 'main', 'side', 'soup', 'one_dish')),
  cook_minutes integer not null check (cook_minutes >= 0),
  servings integer not null default 2 check (servings > 0),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  source text not null default 'llm' check (source in ('llm', 'manual', 'url')),
  is_favorite boolean not null default false,
  rating integer check (rating between 1 and 5),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_household_favorite_idx on public.recipes (household_id, is_favorite);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  raw_name text not null,
  amount numeric check (amount > 0),
  unit text not null default '',
  is_pantry boolean not null default false,
  position integer not null default 0
);

create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'generating', 'proposed', 'confirmed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A plan covers 1 to 10 days.
  check (end_date >= start_date and end_date - start_date < 10)
);

create index meal_plans_household_start_idx on public.meal_plans (household_id, start_date desc);

create table public.meal_plan_days (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans (id) on delete cascade,
  date date not null,
  meal_type text not null default 'dinner' check (meal_type in ('breakfast', 'lunch', 'dinner')),
  mode text not null default 'normal' check (mode in ('normal', 'quick', 'none')),
  unique (meal_plan_id, date, meal_type)
);

create table public.planned_dishes (
  id uuid primary key default gen_random_uuid(),
  meal_plan_day_id uuid not null references public.meal_plan_days (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  course text not null check (course in ('staple', 'main', 'side', 'soup', 'one_dish')),
  position integer not null default 0
);

create index planned_dishes_day_idx on public.planned_dishes (meal_plan_day_id);

create table public.leftovers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  raw_name text not null,
  amount numeric check (amount > 0),
  unit text not null default '',
  used_in_plan_id uuid references public.meal_plans (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shopping lists
-- ---------------------------------------------------------------------------

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null unique references public.meal_plans (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  display_name text not null,
  category_id uuid not null references public.ingredient_categories (id),
  amount numeric check (amount > 0),
  unit text not null default '',
  note text not null default '',
  is_pantry boolean not null default false,
  is_manual boolean not null default false,
  checked boolean not null default false,
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_items_list_idx on public.shopping_items (shopping_list_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.households
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.household_members
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.household_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ingredients
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.meal_plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.shopping_lists
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.shopping_items
  for each row execute function public.set_updated_at();
