-- Supermarket sections in the default walking order (docs/01_requirements.md 4.4).
insert into public.ingredient_categories (name, sort_order) values
  ('野菜・果物', 10),
  ('肉', 20),
  ('魚', 30),
  ('卵・乳製品', 40),
  ('豆腐・練り物', 50),
  ('パン・米・麺', 60),
  ('調味料・乾物', 70),
  ('冷凍食品', 80),
  ('その他', 90);
