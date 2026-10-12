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

## 本番環境(Supabase)の準備

1. Supabase でプロジェクトを作成し、`supabase link --project-ref <ref>` → `supabase db push` でマイグレーションを適用
2. Google Cloud で OAuth クライアントを作成し、Supabase の Authentication > Providers > Google に設定
   (承認済みリダイレクト URI は `https://<ref>.supabase.co/auth/v1/callback`)
3. 世帯と許可リストを SQL Editor で登録する(メールアドレスは小文字で)

```sql
insert into households (name) values ('うち') returning id;
insert into household_members (household_id, email, display_name) values
  ('<上の id>', '<Ken の Gmail アドレス>', 'Ken'),
  ('<上の id>', '<パートナーの Gmail アドレス>', 'パートナー');
insert into household_settings (household_id) values ('<上の id>');
```

4. GitHub の Secrets に `SUPABASE_URL` と `SUPABASE_ANON_KEY` を登録(keep-alive 用)
5. Edge Function のシークレットを登録してデプロイ

```bash
supabase secrets set ANTHROPIC_API_KEY=<key>
supabase functions deploy generate-plan
```
