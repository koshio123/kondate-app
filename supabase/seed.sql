-- Local development data only (applied by `supabase db reset`, never to production).
-- Sign in locally with one of the allowlisted emails below.

-- ---------------------------------------------------------------------------
-- Household
-- ---------------------------------------------------------------------------

insert into public.households (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'うち');

insert into public.household_members (household_id, email, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'ken@example.com', 'Ken'),
  ('00000000-0000-0000-0000-000000000001', 'partner@example.com', 'パートナー');

-- Birth dates are placeholders that give the ages in the requirements (31 and 27).
insert into public.members (household_id, name, birth_date, activity_level) values
  ('00000000-0000-0000-0000-000000000001', 'Ken', '1995-04-01', 'normal'),
  ('00000000-0000-0000-0000-000000000001', 'パートナー', '1999-04-01', 'normal');

insert into public.household_settings (household_id) values
  ('00000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Starter ingredients (rough values for development; the real master comes from
-- scripts/ingredients later)
-- ---------------------------------------------------------------------------

insert into public.ingredients (name, aliases, category_id, base_unit, grams_per_piece, shelf_life_days)
select v.name, v.aliases, c.id, v.base_unit, v.grams_per_piece, v.shelf_life_days
from (values
  ('玉ねぎ', array['たまねぎ', 'タマネギ'], '野菜・果物', '個', 200, 30),
  ('にんじん', array['人参', 'ニンジン'], '野菜・果物', '本', 150, 14),
  ('じゃがいも', array['ジャガイモ', 'じゃが芋'], '野菜・果物', '個', 150, 30),
  ('キャベツ', array['きゃべつ'], '野菜・果物', '玉', 1200, 10),
  ('ピーマン', array['ぴーまん'], '野菜・果物', '個', 35, 7),
  ('小松菜', array['こまつな'], '野菜・果物', '束', 250, 3),
  ('ほうれん草', array['ほうれんそう', 'ホウレンソウ'], '野菜・果物', '束', 200, 3),
  ('もやし', array['モヤシ'], '野菜・果物', '袋', 200, 2),
  ('長ねぎ', array['ねぎ', 'ネギ', '白ねぎ'], '野菜・果物', '本', 100, 7),
  ('きゅうり', array['胡瓜', 'キュウリ'], '野菜・果物', '本', 100, 5),
  ('トマト', array['とまと'], '野菜・果物', '個', 150, 5),
  ('大根', array['だいこん'], '野菜・果物', '本', 1000, 10),
  ('しめじ', array['ぶなしめじ'], '野菜・果物', 'パック', 100, 5),
  ('しょうが', array['生姜', 'ショウガ'], '野菜・果物', 'かけ', 15, 14),
  ('鶏もも肉', array['鶏もも', 'とりもも肉'], '肉', 'g', null, 2),
  ('鶏むね肉', array['鶏むね', 'とりむね肉'], '肉', 'g', null, 2),
  ('豚こま切れ肉', array['豚こま', '豚小間'], '肉', 'g', null, 2),
  ('豚ひき肉', array['豚挽き肉'], '肉', 'g', null, 1),
  ('鮭', array['さけ', '生鮭', '塩鮭'], '魚', '切れ', 80, 2),
  ('卵', array['たまご', '玉子'], '卵・乳製品', '個', 60, 14),
  ('牛乳', array['ミルク'], '卵・乳製品', 'ml', null, 7),
  ('絹ごし豆腐', array['豆腐', '絹豆腐'], '豆腐・練り物', '丁', 300, 5),
  ('油揚げ', array['あぶらあげ'], '豆腐・練り物', '枚', 30, 5),
  ('米', array['ご飯', 'ごはん'], 'パン・米・麺', 'g', null, null),
  ('乾燥わかめ', array['わかめ'], '調味料・乾物', 'g', null, null),
  ('味噌', array['みそ'], '調味料・乾物', 'g', null, null),
  ('醤油', array['しょうゆ'], '調味料・乾物', 'ml', null, null),
  ('みりん', array[]::text[], '調味料・乾物', 'ml', null, null),
  ('砂糖', array['さとう'], '調味料・乾物', 'g', null, null),
  ('豆板醤', array['トウバンジャン'], '調味料・乾物', 'g', null, null),
  ('ごま油', array['胡麻油'], '調味料・乾物', 'ml', null, null),
  ('片栗粉', array['かたくりこ'], '調味料・乾物', 'g', null, null)
) as v(name, aliases, category, base_unit, grams_per_piece, shelf_life_days)
join public.ingredient_categories c on c.name = v.category;
