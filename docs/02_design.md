# 献立アプリ 設計書

| 項目 | 内容 |
|---|---|
| バージョン | v0.2 |
| 作成日 | 2026-10-12 |
| 前提 | [01_requirements.md](01_requirements.md) v0.3 |
| フェーズ | ③ 設計 |

---

## 1. システム構成

```mermaid
flowchart LR
  subgraph Phone["スマホ x2 (PWA)"]
    UI[UI]
    SW[Service Worker<br/>オフラインキャッシュ]
  end

  subgraph Supabase
    Auth[Auth<br/>Google ログイン]
    DB[(PostgreSQL<br/>+ RLS)]
    RT[Realtime]
    EF[Edge Functions<br/>generate-plan / regenerate-dish<br/>build-shopping-list]
  end

  LLM[LLM API]
  GH[GitHub Actions<br/>keep-alive 週1]

  UI -- OAuth --> Auth
  UI -- CRUD (supabase-js) --> DB
  UI -- 買い物チェックの購読 --> RT
  UI -- 献立生成 --> EF
  EF --> DB
  EF --> LLM
  GH --> DB
```

| 処理 | 実行場所 | 理由 |
|---|---|---|
| 単純な CRUD(設定、余り物、お気に入り、チェック) | クライアントから DB へ直接(RLS で保護) | API サーバー不要 |
| 献立生成・再提案 | Edge Function | LLM の API キーをクライアントに置かない |
| 買い物リスト生成 | Edge Function(または DB 関数) | 合算ロジックを1か所に集約 |
| 買い物チェックの同期 | Realtime(`shopping_items` の変更を購読) | 2人の端末に即時反映 |

フロントエンドのフレームワークは ④技術選定で決める。

## 2. 画面設計

### 2.1 画面一覧

| ID | 画面 | 主な要素 | 対応機能 |
|---|---|---|---|
| S0 | ログイン | Google でログイン。許可リスト外は「利用できません」表示 | 認証 |
| S1 | ホーム | 今の計画期間の献立カード(日ごと)、買い物リストへのボタン、「新しく計画する」 | ― |
| S2 | 計画作成 | 期間選択(開始日〜終了日)、日ごとのモード切替(通常/時短/なし) | F1a |
| S3 | 余り物入力 | テキスト入力(1行1食材 or 自由文)、前回の余り物を引き継ぎ | F2 |
| S4 | 献立提案の確認 | 日ごとの献立、品ごと・日ごとの「再提案」、お気に入りから差し替え、確定ボタン | F1, F1b, F8 |
| S5 | 料理詳細 | 材料・分量、手順、調理時間、評価(★)・メモ、お気に入り登録 | F5 |
| S6 | 買い物リスト | ジャンル別セクション、チェックボックス、購入済みを下に移動、手動追加 | F3, F4 |
| S7 | お気に入り | 保存済み料理の一覧、検索、区分(主菜/副菜…)で絞り込み | F5 |
| S8 | 設定 | 家族メンバー、アレルギー・苦手食材、時短の上限時間、夕食の比率 | F13 |
| S9 | 栄養サマリー | 期間の栄養素と目標の比較、アドバイス(出典付き) | F6, F7(第2段階) |

### 2.2 画面遷移

```mermaid
flowchart TD
  S0[S0 ログイン] --> S1[S1 ホーム]
  S1 -->|新しく計画する| S2[S2 計画作成]
  S2 --> S3[S3 余り物入力]
  S3 -->|提案を作る| S4[S4 献立提案の確認]
  S4 -->|再提案| S4
  S4 -->|料理をタップ| S5[S5 料理詳細]
  S4 -->|確定| S6[S6 買い物リスト]
  S1 -->|買い物リスト| S6
  S1 -->|献立カード| S5
  S1 --> S7[S7 お気に入り]
  S7 --> S5
  S1 --> S8[S8 設定]
  S4 -.第2段階.-> S9[S9 栄養サマリー]
```

ボトムナビゲーション: **ホーム / 買い物 / お気に入り / 設定**(片手操作を想定し下部に配置)

### 2.3 計画のステータス

```mermaid
stateDiagram-v2
  [*] --> draft: 期間・モードを設定
  draft --> generating: 提案を作る
  generating --> proposed: 生成成功
  generating --> draft: 生成失敗
  proposed --> generating: 日・品の再提案
  proposed --> confirmed: 確定(買い物リスト生成)
  confirmed --> proposed: 献立を修正(買い物リスト再生成)
  confirmed --> archived: 期間終了
```

## 3. データモデル

### 3.1 ER 図

```mermaid
erDiagram
  households ||--o{ household_members : "ログインできる人"
  households ||--o{ members : "食べる人"
  households ||--|| household_settings : ""
  households ||--o{ meal_plans : ""
  households ||--o{ recipes : ""
  households ||--o{ leftovers : ""
  members ||--o{ member_food_restrictions : ""
  ingredients ||--o{ member_food_restrictions : ""
  meal_plans ||--o{ meal_plan_days : ""
  meal_plan_days ||--o{ planned_dishes : ""
  recipes ||--o{ planned_dishes : ""
  recipes ||--o{ recipe_ingredients : ""
  ingredients ||--o{ recipe_ingredients : ""
  ingredients ||--o{ leftovers : ""
  meal_plans ||--o| shopping_lists : ""
  shopping_lists ||--o{ shopping_items : ""
  ingredients ||--o{ shopping_items : ""
  ingredient_categories ||--o{ ingredients : ""
```

### 3.2 テーブル定義

共通カラム(省略表記): `id uuid PK default gen_random_uuid()`, `created_at timestamptz`, `updated_at timestamptz`

**世帯・利用者**

| テーブル | カラム | 型 | 備考 |
|---|---|---|---|
| households | name | text | |
| household_members | household_id | uuid FK | |
| | email | text UNIQUE | **許可リスト**。auth.users の email と照合 |
| | display_name | text | |
| members | household_id | uuid FK | 食べる人 |
| | name | text | |
| | birth_date | date | 年齢は日付から算出(年齢区分が自動で変わる) |
| | sex | text null | `male` / `female` / null |
| | activity_level | text | `low` / `normal` / `high` |
| member_food_restrictions | member_id | uuid FK | |
| | ingredient_id | uuid FK null | マスタにない食材は `label` で保持 |
| | label | text | 表示名 |
| | kind | text | `allergy` / `never` / `avoid` |
| household_settings | household_id | uuid PK FK | |
| | quick_mode_max_minutes | int | 初期値 15 |
| | dinner_ratio | numeric | 初期値 0.33 |
| | category_order | uuid[] | 売り場順(F9 用。初期は既定順) |
| | budget_per_week | int null | 予算(現状未使用) |

**食材マスタ**

| テーブル | カラム | 型 | 備考 |
|---|---|---|---|
| ingredient_categories | name | text | 野菜・果物、肉、魚 … |
| | sort_order | int | 既定の売り場順 |
| ingredients | name | text UNIQUE | 正規名(例: 玉ねぎ) |
| | aliases | text[] | 表記ゆれ(たまねぎ、タマネギ) |
| | category_id | uuid FK | |
| | base_unit | text | 合算に使う単位(`g` / `ml` / `個` …) |
| | grams_per_piece | numeric null | 「1個 = 200g」などの換算 |
| | shelf_life_days | int null | 日持ち目安(前半に寄せる判定) |
| | food_composition_code | text null | 日本食品標準成分表の食品番号(栄養計算用) |

**レシピ・献立**

| テーブル | カラム | 型 | 備考 |
|---|---|---|---|
| recipes | household_id | uuid FK | LLM 生成もお気に入りも同じテーブル |
| | title | text | |
| | course | text | `staple`(主食)/ `main` / `side` / `soup` / `one_dish`(一品料理) |
| | cook_minutes | int | |
| | servings | int | 何人分の分量か |
| | steps | jsonb | 手順の配列 |
| | source | text | `llm` / `manual` / `url` |
| | is_favorite | bool | |
| | rating | int null | 1〜5 |
| | note | text | |
| recipe_ingredients | recipe_id | uuid FK | |
| | ingredient_id | uuid FK null | 正規化できなかった場合は null |
| | raw_name | text | LLM が出した元の名前 |
| | amount | numeric null | 「少々」は null |
| | unit | text | |
| | is_pantry | bool | 塩・醤油など常備品(買い物リストでは別枠) |
| meal_plans | household_id | uuid FK | |
| | start_date / end_date | date | CHECK: 期間は最大10日 |
| | status | text | `draft` / `generating` / `proposed` / `confirmed` / `archived` |
| meal_plan_days | meal_plan_id | uuid FK | |
| | date | date | UNIQUE(meal_plan_id, date, meal_type) |
| | meal_type | text | 当面は `dinner` のみ |
| | mode | text | `normal` / `quick` / `none` |
| planned_dishes | meal_plan_day_id | uuid FK | |
| | recipe_id | uuid FK | |
| | course | text | |
| | position | int | 表示順 |
| leftovers | household_id | uuid FK | |
| | ingredient_id | uuid FK null | |
| | raw_name | text | |
| | amount / unit | numeric / text | 任意 |
| | used_in_plan_id | uuid FK null | どの計画で使ったか |

**買い物リスト**

| テーブル | カラム | 型 | 備考 |
|---|---|---|---|
| shopping_lists | meal_plan_id | uuid FK UNIQUE | 1計画に1リスト |
| shopping_items | shopping_list_id | uuid FK | |
| | ingredient_id | uuid FK null | |
| | display_name | text | |
| | category_id | uuid FK | |
| | amount / unit | numeric / text | 合算後 |
| | is_pantry | bool | 「家にあるか確認」セクション |
| | is_manual | bool | 手動追加(洗剤など) |
| | checked | bool | **Realtime 同期の対象** |
| | checked_by | uuid null | auth.users.id |
| | checked_at | timestamptz null | |

### 3.3 RLS(行レベルセキュリティ)

ログイン中ユーザーの世帯 ID を返す関数を1つ用意し、全テーブルで使う。

```sql
create function public.my_household_id() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from household_members
  where email = auth.jwt() ->> 'email'
$$;

-- 例: household_id を直接持つテーブル
alter table meal_plans enable row level security;
create policy "household access" on meal_plans
  for all using (household_id = my_household_id())
  with check (household_id = my_household_id());

-- 例: 親テーブル経由のテーブル
create policy "household access" on meal_plan_days
  for all using (
    exists (select 1 from meal_plans p
            where p.id = meal_plan_id and p.household_id = my_household_id())
  );
```

- 許可リスト外のユーザーはログインできても `my_household_id()` が null になり、**どのデータも見えない**。フロントでは S0 に「利用できません」を表示する
- `ingredients` / `ingredient_categories` はマスタなので、認証済みユーザーは読み取りのみ可

## 4. API 設計

### 4.1 クライアントから直接操作するもの(supabase-js + RLS)

| リソース | 操作 |
|---|---|
| members, member_food_restrictions, household_settings | CRUD |
| meal_plans, meal_plan_days | 作成・モード変更・削除 |
| leftovers | CRUD |
| recipes | お気に入り・評価・メモの更新、手動登録 |
| shopping_items | `checked` の更新、手動追加 |

### 4.2 Edge Functions

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/functions/v1/generate-plan` | 計画全体の献立を生成 |
| POST | `/functions/v1/regenerate` | 指定した日または品を再提案 |
| POST | `/functions/v1/build-shopping-list` | 確定した計画から買い物リストを生成(再生成も同じ) |

**generate-plan**

```jsonc
// Request
{ "meal_plan_id": "uuid" }

// Response 200
{
  "meal_plan_id": "uuid",
  "status": "proposed",
  "days": [
    {
      "date": "2026-10-13",
      "mode": "normal",
      "dishes": [
        { "recipe_id": "uuid", "course": "main", "title": "鮭のちゃんちゃん焼き", "cook_minutes": 25 },
        { "recipe_id": "uuid", "course": "side", "title": "ほうれん草のおひたし", "cook_minutes": 10 },
        { "recipe_id": "uuid", "course": "soup", "title": "豆腐とわかめの味噌汁", "cook_minutes": 10 },
        { "recipe_id": "uuid", "course": "staple", "title": "ご飯", "cook_minutes": 0 }
      ]
    },
    { "date": "2026-10-14", "mode": "none", "dishes": [] }
  ],
  "warnings": []
}
```

**regenerate**

```jsonc
// 日ごと
{ "meal_plan_day_id": "uuid", "hint": "魚以外で" }
// 品ごと
{ "planned_dish_id": "uuid", "hint": "もっとさっぱり" }
```

**build-shopping-list**

```jsonc
// Request
{ "meal_plan_id": "uuid" }
// Response 200
{
  "shopping_list_id": "uuid",
  "sections": [
    { "category": "野菜・果物", "items": [ { "name": "玉ねぎ", "amount": 3, "unit": "個" } ] },
    { "category": "常備品(家にあるか確認)", "items": [ { "name": "醤油" } ] }
  ],
  "unresolved": [ { "raw_name": "ゆかり", "reason": "食材マスタに未登録" } ]
}
```

エラー形式(共通):

```json
{ "error": { "code": "LLM_TIMEOUT", "message": "献立の生成に時間がかかりすぎました。もう一度お試しください。" } }
```

## 5. 献立生成の処理

```mermaid
sequenceDiagram
  participant C as クライアント
  participant F as generate-plan
  participant DB as PostgreSQL
  participant L as LLM

  C->>F: meal_plan_id
  F->>DB: 期間・モード・余り物・制限食材・お気に入り・最近の献立を取得
  F->>DB: status = generating
  F->>L: プロンプト + JSON スキーマ
  L-->>F: 献立 JSON
  F->>F: 検証(スキーマ / 制限食材 / 調理時間 / 品構成)
  alt 違反あり(最大2回)
    F->>L: 違反内容を添えて再生成
  end
  F->>F: 食材名の正規化(aliases 照合)
  F->>DB: recipes / planned_dishes を保存、status = proposed
  F-->>C: 献立
```

### 5.1 LLM への入力

| 入力 | 内容 |
|---|---|
| 日ごとの枠 | 日付、モード(`none` の日は渡さない) |
| 構成ルール | `normal`: 主食+主菜+副菜+汁物 / `quick`: 合計 `quick_mode_max_minutes` 分以内、品数は柔軟 |
| 余り物 | 食材名・量。期間の前半で使うよう指示 |
| 制限食材 | `allergy` + `never` は禁止、`avoid` はなるべく避ける |
| 人数 | members の人数で分量を算出 |
| 最近の献立 | 直近2週間のタイトル(重複回避) |
| お気に入り | 候補として数件(F8、第2段階) |

### 5.2 LLM の出力スキーマ(抜粋)

```json
{
  "type": "object",
  "required": ["days"],
  "properties": {
    "days": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["date", "dishes"],
        "properties": {
          "date": { "type": "string", "format": "date" },
          "dishes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["title", "course", "cook_minutes", "ingredients", "steps"],
              "properties": {
                "title": { "type": "string" },
                "course": { "enum": ["staple", "main", "side", "soup", "one_dish"] },
                "cook_minutes": { "type": "integer" },
                "ingredients": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["name", "unit"],
                    "properties": {
                      "name": { "type": "string" },
                      "amount": { "type": ["number", "null"] },
                      "unit": { "type": "string" },
                      "is_pantry": { "type": "boolean" }
                    }
                  }
                },
                "steps": { "type": "array", "items": { "type": "string" } }
              }
            }
          }
        }
      }
    }
  }
}
```

### 5.3 生成後の検証(ロジック)

| チェック | 違反時 |
|---|---|
| JSON スキーマに適合 | 再生成 |
| 食材が `allergy` / `never` に該当(正規名と aliases の両方で照合) | **必ず再生成**。2回失敗したらその日を空にして警告 |
| `quick` の日の調理時間の合計が上限以下 | 再生成 |
| `normal` の日に主食・主菜・副菜・汁物がそろっている | 再生成 |
| 日付が計画期間と一致し、`none` の日を含まない | 再生成 |
| `avoid` 食材を含む | 許容し、`warnings` に表示 |

## 6. 買い物リスト生成

```
1. 計画の planned_dishes から recipe_ingredients を集める(mode = none の日は対象外)
2. ingredient_id ごとにまとめる
3. 単位をそろえる: base_unit に換算(例: 玉ねぎ 1個 + 100g → grams_per_piece=200 で 300g → 表示は「1.5個」)
   換算できない組み合わせは行を分けて表示
4. 余り物を差し引く(量が不明な余り物は「家にあるかも」と注記)
5. is_pantry の食材は「常備品(家にあるか確認)」セクションへ
6. category の売り場順で並べ替え
7. 正規化できなかった食材は「その他」に入れ、unresolved として返す
```

- 献立を修正して再生成するときは、**チェック済みの項目を引き継ぐ**(同じ ingredient_id なら `checked` を維持)

## 7. 同期とオフライン

| 項目 | 方式 |
|---|---|
| チェックの同期 | Supabase Realtime で `shopping_items` を購読し、他端末の変更を即時反映 |
| 同時編集 | `checked` は1項目1値なので後勝ちで十分 |
| オフライン表示 | Service Worker が最新の買い物リストをキャッシュし、電波がなくても表示 |
| オフライン中のチェック | 端末内(IndexedDB)のキューに積み、オンライン復帰時に送信 |

## 8. 運用

| 項目 | 内容 |
|---|---|
| keep-alive | GitHub Actions で週2回、軽い SELECT を実行(Supabase 無料枠の一時停止を防ぐ) |
| バックアップ | 無料枠には自動バックアップがないため、月1回 `pg_dump` を GitHub Actions で取得し非公開の保存先に置く |
| シークレット | LLM の API キーは Edge Function の環境変数にのみ保存 |
| 食材マスタ | 初期データを seed SQL で投入。未登録の食材(unresolved)は設定画面から追加 |

## 9. 画面デザイン(確定)

デザインは Claude Design のキャンバス「献立アプリ 画面デザイン」で確定した(2026-10-12)。

- キャンバス: https://claude.ai/artifact/Tue2LqTgeJ4Rx1r3qcKC5P (非公開。オーナーのみ閲覧可)
- 画面: S0〜S8 の9画面、スマホ 390×844 基準

### 9.1 デザイントークン

| トークン | 値 | 用途 |
|---|---|---|
| `bg` | `#FBF5EC` | 画面背景(生成り) |
| `surface` | `#FFFFFF` | カード |
| `border` | `#EADCCB` | カードの枠線 |
| `divider` | `#F1E7DA` | リスト内の区切り線 |
| `ink` | `#2A211B` | 本文 |
| `muted` | `#6E6157` | 補足テキスト |
| `primary` | `#B4501F` | 差し色(柿色)、主ボタン、`通常` モード |
| `primary-strong` | `#8E3E17` | ホバー、濃い文字 |
| `primary-soft` | `#F6E2D3` | 柿色の淡い背景 |
| `quick` | `#2D6A86` | `時短` モード |
| `none` | `#5F544B` | `なし` モード |
| `leftover` / `leftover-soft` | `#3F6A2A` / `#E4EFD9` | 余り物タグ |

| 用途 | フォント |
|---|---|
| 見出し | Zen Maru Gothic (500 / 700) |
| 本文 | BIZ UDPGothic (400 / 700) |

### 9.2 UI ルール

- タップ領域は 44px 以上。メインメニューは画面下部(ホーム / 買い物 / お気に入り / 設定)
- モードは色に加えて文字ラベルで区別する(色覚に依存しない)
- 主ボタンは角丸ピル型、高さ 52px

## 10. 未決事項

| 項目 | 決めるフェーズ |
|---|---|
| 食材マスタの初期データの作り方(成分表から抽出 or 手作業) | ④ / ⑤ |
| 栄養計算(F6, F7)の詳細設計 | 第2段階 |
| 計画期間の上限(7日 or 10日)。現状は CHECK 制約で10日 | ⑤ で生成品質を見て決定 |
