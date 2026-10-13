# kondate-app

家族向けの夕食献立アプリ。指定期間の献立提案、余り物の活用、売り場ジャンル別の買い物リスト、お気に入り保存、根拠付きの栄養アドバイスを提供する。

## ドキュメント

| #   | フェーズ                                        | ファイル                                                   | 状態       |
| --- | ----------------------------------------------- | ---------------------------------------------------------- | ---------- |
| ②   | 要件定義                                        | [docs/01_requirements.md](docs/01_requirements.md)         | 完了(v0.3) |
| ③   | 設計(画面遷移・データモデル・API・画面デザイン) | [docs/02_design.md](docs/02_design.md)                     | 完了(v0.3) |
| ④   | 技術選定                                        | [docs/03_tech_stack.md](docs/03_tech_stack.md)             | 完了(v0.2) |
| ⑤   | 実装                                            | このリポジトリ                                             | 進行中     |
| -   | 献立生成のモデル比較                            | [docs/04_model_evaluation.md](docs/04_model_evaluation.md) | 記録       |

## 構成

```
apps/web/        React + Vite + TypeScript の PWA (Tailwind CSS, TanStack Query, React Router)
packages/plan-eval/  献立生成プロンプトのモデル比較ツール
supabase/        Supabase のローカル設定、マイグレーション、seed、RLS テスト (pgTAP)
.github/         CI (lint / typecheck / test / build / RLS テスト)、Supabase の keep-alive
docs/            要件定義・設計・技術選定
```

## 開発環境のセットアップ

必要なもの: Node.js 22、pnpm 10 (`corepack enable`)、Docker(Supabase のローカル起動に使用)

```bash
pnpm install

# ローカルの Supabase (DB / Auth / メール確認画面) を起動
pnpm db:start
# 表示された "API URL" と "anon key" を apps/web/.env.local に設定
cp apps/web/.env.example apps/web/.env.local

pnpm dev        # http://127.0.0.1:5173
```

ローカルでは Google ログインの代わりに、ログイン画面下部の「開発用: メールでログイン」を使う。
`ken@example.com` か `partner@example.com`(seed の許可リスト)を入力し、
http://127.0.0.1:54324 に届いたメールのリンクを開く。

### よく使うコマンド

| コマンド                                     | 内容                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                   | 開発サーバー                                                           |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | 静的解析・型チェック・単体テスト                                       |
| `pnpm build`                                 | 本番ビルド(PWA の Service Worker を含む)                               |
| `pnpm db:reset`                              | マイグレーションと seed をやり直す                                     |
| `pnpm db:test`                               | RLS のテスト(`supabase/tests`)                                         |
| `pnpm db:types`                              | DB スキーマから `apps/web/src/types/database.ts` を再生成              |
| `pnpm functions:serve`                       | Edge Functions をローカルで起動(`supabase/functions/.env` に API キー) |

## 献立生成のモデル比較

献立生成の中核(プロンプト・出力スキーマ・ルール検証・再生成)は
`supabase/functions/_shared/plan/` にあり、Edge Function と比較ツールの両方から使う。

```bash
cp packages/plan-eval/.env.example packages/plan-eval/.env   # ANTHROPIC_API_KEY を記入
pnpm eval:plan --dry-run                         # プロンプトの確認のみ(API を呼ばない)
pnpm eval:plan                                   # 2段階生成で Sonnet / Haiku / Opus x 3シナリオ
pnpm eval:plan --models sonnet --strategy both   # 一括生成と2段階生成の比較
```

結果は `packages/plan-eval/results/<日時>/report.md` に出力される(git 管理外)。
1回の実行(3モデル x 3シナリオ)の API 費用は概算で 100 円前後(大半は Opus 分)。
前回の結果と判断は [docs/04_model_evaluation.md](docs/04_model_evaluation.md)。

## 本番環境の準備

フロントエンドは Vercel、バックエンドは Supabase(無料プラン)。
`<ref>` は Supabase のプロジェクト ID、`<app>` は Vercel のプロジェクト名(URL は `https://<app>.vercel.app`)。

### 1. Supabase

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push                      # マイグレーションを適用(seed は入らない)
pnpm exec supabase secrets set ANTHROPIC_API_KEY=<key>
pnpm exec supabase functions deploy generate-plan
pnpm exec supabase functions deploy regenerate
```

### 2. Google ログイン

1. Google Cloud Console で OAuth 同意画面(外部)を作り、2人の Gmail をテストユーザーに追加
2. OAuth クライアント ID(ウェブアプリ)を作成。承認済みのリダイレクト URI は `https://<ref>.supabase.co/auth/v1/callback`
3. Supabase の Authentication > Sign In / Providers > Google にクライアント ID とシークレットを設定
4. Supabase の Authentication > URL Configuration
   - Site URL: `https://<app>.vercel.app`
   - Redirect URLs: `https://<app>.vercel.app/auth/callback`

### 3. 世帯と許可リスト(SQL Editor)

メールアドレスは小文字で。食べる人(`members`)は後からアプリの設定画面でも変更できる。

```sql
with h as (insert into households (name) values ('うち') returning id),
     a as (insert into household_members (household_id, email, display_name)
           select id, x.email, x.name from h,
             (values ('<Ken の Gmail>', 'Ken'), ('<パートナーの Gmail>', 'パートナー')) as x(email, name)),
     m as (insert into members (household_id, name)
           select id, x.name from h, (values ('Ken'), ('パートナー')) as x(name))
insert into household_settings (household_id) select id from h;
```

### 4. Vercel

Add New > Project で GitHub の `koshio123/kondate-app` を Import する。ビルドの設定はリポジトリ直下の
`vercel.json` にあるので、Root Directory は既定(`./`)のまま、Framework Preset も変更しない。

| 環境変数                       | 値                                                               |
| ------------------------------ | ---------------------------------------------------------------- |
| `VITE_SUPABASE_URL`            | `https://<ref>.supabase.co`                                      |
| `VITE_SUPABASE_ANON_KEY`       | Supabase の anon(publishable)キー                                |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`(`package.json` の `packageManager` と同じ pnpm でビルドする) |

`main` に push すると本番に自動でデプロイされる。`vercel.json` の rewrites で、`/shopping` などへの
直接アクセスにも `index.html` を返す(SPA)。Service Worker(`sw.js`)はキャッシュさせず、更新がすぐ届くようにしている。

### 5. GitHub Actions

Repository secrets に `SUPABASE_URL` と `SUPABASE_ANON_KEY` を登録(keep-alive が週2回 DB に触れ、無料プランの一時停止を防ぐ)。

### 6. スマホに入れる

- iPhone: Safari で開く → 共有 → 「ホーム画面に追加」
- Android: Chrome で開く → メニュー → 「アプリをインストール」(または「ホーム画面に追加」)

ホーム画面から開くとアプリとして全画面で動き、買い物リストは電波がなくても開ける。
