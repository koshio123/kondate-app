# 献立アプリ 技術選定

| 項目 | 内容 |
|---|---|
| バージョン | v0.2 |
| 作成日 | 2026-10-12 |
| 前提 | [01_requirements.md](01_requirements.md) v0.3 / [02_design.md](02_design.md) v0.1 |
| フェーズ | ④ 技術選定 |

---

## 1. 選定結果(案)

| レイヤー | 採用(案) | 状態 |
|---|---|---|
| 認証・DB・同期 | Supabase(Auth / PostgreSQL / Realtime) | **決定済み** |
| サーバー処理 | Supabase Edge Functions(Deno / TypeScript) | **決定** |
| フロントエンド | **React + Vite + TypeScript + vite-plugin-pwa** | **決定**(2026-10-12) |
| UI | Tailwind CSS + shadcn/ui | 案 |
| データ取得 | supabase-js + TanStack Query | **決定**(実装済み) |
| オフライン | Service Worker(Workbox)+ TanStack Query のキャッシュ保存(localStorage)と一時停止したミューテーション | **決定**(2026-10-12。リストは数十行なので IndexedDB は不要と判断) |
| ホスティング | Vercel(Hobby プラン、静的配信、Git 連携で自動デプロイ) | **決定**(2026-10-13。当初案の Cloudflare Pages から変更) |
| LLM | **Claude Sonnet 5.5(献立生成)+ Claude Haiku 5.5(軽い処理)** | **決定**(2026-10-12。実装初期の比較で最終確認) |
| データ整備スクリプト | Python(食品成分表の取り込み) | 案 |
| CI / 定期実行 | GitHub Actions | 案 |

## 2. フロントエンド

### 2.1 比較

| 観点 | **React + Vite(PWA)** | Next.js | SvelteKit | Flutter Web |
|---|---|---|---|---|
| 構成のシンプルさ | ◎ 静的 SPA。サーバー不要 | △ SSR / RSC は本アプリでは不要な複雑さ | ○ | ○ |
| PWA・オフライン | ◎ vite-plugin-pwa で設定が少ない | ○ Serwist などの追加設定が必要 | ○ | △ Service Worker の細かい制御がしにくい |
| 初回表示の軽さ | ○ | ○ | ◎ | △ ランタイムが重い |
| Supabase との相性 | ◎ 公式ドキュメント・事例が多い | ◎ | ○ | ○(supabase_flutter) |
| ライブラリ・情報量 | ◎ | ◎ | ○ | ○ |
| 将来のネイティブアプリ化 | △(Capacitor で可能) | △ | △ | ◎ |
| ホスティング | どこでも(静的ファイル) | Vercel が最適 | どこでも | どこでも |

**推奨: React + Vite**。サーバー側の処理は Supabase と Edge Functions に寄せたので、フロントは静的な SPA で十分です。PWA の設定が最も少なく、Edge Functions と同じ TypeScript で揃えられます。

> Flutter はネイティブアプリ化が前提なら有力です。ただし iOS アプリとして配布するには Apple Developer Program(年額)が必要になり、家族2人の利用なら PWA のほうが手間もコストも小さいです。

### 2.2 iPhone の PWA で気をつける点

| 項目 | 対応 |
|---|---|
| ホーム画面への追加 | Safari の「共有 → ホーム画面に追加」。初回だけ手順を案内する画面を用意する |
| ログイン | ポップアップではなくリダイレクト方式を使う。実機で早期に確認する |
| オフラインキャッシュ | ホーム画面に追加したアプリとして使う前提にする |

## 3. LLM

### 3.1 料金比較(2026年10月時点、1M トークンあたり)

| 提供元 | モデル | 入力 | 出力 | JSON スキーマ出力 |
|---|---|---|---|---|
| Anthropic | Claude Haiku 5.5 | $0.10 | $0.50 | ◎(スキーマ準拠を保証) |
| Anthropic | Claude Sonnet 5.5 | $2.00 | $10.00 | ◎ |
| Anthropic | Claude Opus 5.5 | $4.00 | $20.00 | ◎ |
| Google | Gemini 3.5 Flash-Lite | $0.30 | $2.50 | ○ |
| Google | Gemini 3.8 Flash | $0.75 | $3.75 | ○ |
| OpenAI | GPT-5.6 Luna | $0.20 | $1.20 | ○ |
| OpenAI | GPT-5.6 Terra | $2.00 | $12.00 | ○ |

- Gemini Flash の料金は 2026-12-31 までの価格で、2027-01-01 から値上げ予定と記載されています
- Gemini の無料枠は入力データが製品改善に使われるため、家族のデータを送る本アプリでは有料枠を前提にします

### 3.2 月額コストの試算

**想定する使い方(1か月)**

| 処理 | 回数 | 入力トークン/回 | 出力トークン/回 |
|---|---|---|---|
| 献立生成(5日分 × 4品) | 6回 | 3,000 | 7,000 |
| 日・品の再提案 | 20回 | 3,500 | 500 |
| 検証失敗による再生成(上記の約30%) | ― | ― | ― |
| **合計(概算)** | | **約 0.15M** | **約 0.10M** |

**モデル別の月額**($1 = 150円で概算)

| モデル | 月額 |
|---|---|
| Claude Haiku 5.5 | 約 $0.07(約10円) |
| GPT-5.6 Luna | 約 $0.15(約25円) |
| Gemini 3.5 Flash-Lite | 約 $0.30(約45円) |
| Gemini 3.8 Flash | 約 $0.50(約75円) |
| Claude Sonnet 5.5 | 約 $1.30(約200円) |
| GPT-5.6 Terra | 約 $1.50(約225円) |
| Claude Opus 5.5 | 約 $2.60(約390円) |

**どのモデルでも月数百円以内**に収まるため、料金ではなく**献立の質**で選ぶのが妥当です。

### 3.3 推奨

| 処理 | モデル(案) | 理由 |
|---|---|---|
| 献立生成・再提案 | Claude Sonnet 5.5 | 多数の制約(モード・品構成・余り物・制限食材・日持ち)を同時に守る必要があり、品質を優先。それでも月200円程度 |
| 食材名の正規化、アドバイス文 | Claude Haiku 5.5 | 単純な処理で、ほぼ無料 |

- Claude API の structured outputs(`output_config.format` に JSON スキーマを指定)は、**出力がスキーマに適合することを保証**します。設計書 5.3 の「スキーマ不適合時の再生成」がほぼ不要になります。ただし、アレルギー照合などの**内容の検証は引き続き必要**です
- モデル名は Edge Function の環境変数で切り替えられるようにし、⑤実装の最初に**同じ入力で 2〜3 モデルの献立を比較**してから確定します

```ts
// supabase/functions/_shared/llm.ts(イメージ)
import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const PLAN_MODEL = Deno.env.get("PLAN_MODEL") ?? "claude-sonnet-5-5";

export async function generatePlan(prompt: string, schema: object) {
  const res = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: { type: "json_schema", schema } },
  });
  if (res.stop_reason === "max_tokens") throw new Error("LLM_TRUNCATED");
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  return JSON.parse(text);
}
```

## 4. ホスティング・運用費の合計

| 項目 | サービス | 月額 |
|---|---|---|
| フロントエンド配信 | Vercel(Hobby プラン、個人・非商用) | 0円 |
| 認証・DB・同期・Edge Functions | Supabase(無料プラン) | 0円 |
| LLM | Claude API | 約200円(Sonnet 中心の場合) |
| CI・定期実行 | GitHub Actions(非公開リポジトリの無料枠) | 0円 |
| **合計** | | **約200円/月** |

## 5. 開発環境・ツール

| 用途 | ツール |
|---|---|
| パッケージ管理 | pnpm |
| ローカル開発 | Supabase CLI(`supabase start` でローカルに DB・Auth・Edge Functions を起動) |
| DB マイグレーション | Supabase CLI(`supabase/migrations/*.sql`) |
| 型生成 | `supabase gen types typescript` で DB スキーマから TypeScript の型を生成 |
| テスト | Vitest(ロジック)、Playwright(画面操作)、pgTAP(RLS のテスト) |
| Lint / Format | ESLint + Prettier |
| CI | GitHub Actions(lint・型チェック・テスト、keep-alive、月次バックアップ) |

### 5.1 RLS のテスト

家族以外がデータを見られないことはこのアプリの安全性の要なので、自動テストで確認します。

```sql
-- supabase/tests/rls.test.sql(pgTAP、イメージ)
begin;
select plan(2);

-- 許可リスト外のユーザーとして実行
set local role authenticated;
set local request.jwt.claims = '{"email": "stranger@example.com"}';
select is((select count(*) from meal_plans), 0::bigint, '部外者は献立を読めない');

-- 許可リストのユーザーとして実行
set local request.jwt.claims = '{"email": "member@example.com"}';
select ok((select count(*) from meal_plans) > 0, '家族は献立を読める');

select * from finish();
rollback;
```

## 6. ディレクトリ構成(案)

```
kondate-app/
├── apps/
│   └── web/                  # React + Vite PWA
│       ├── src/
│       │   ├── pages/        # S0〜S9
│       │   ├── features/     # plan / shopping / favorites / settings
│       │   ├── lib/          # supabase クライアント、オフラインキュー
│       │   └── types/        # supabase gen types の出力
│       └── vite.config.ts
├── supabase/
│   ├── migrations/           # テーブル定義、RLS
│   ├── functions/
│   │   ├── _shared/          # LLM クライアント、検証ロジック、スキーマ
│   │   ├── generate-plan/
│   │   └── regenerate/
│   ├── seed.sql              # 食材マスタ、売り場カテゴリ
│   └── tests/                # pgTAP
├── scripts/
│   └── ingredients/          # Python: 食品成分表から食材マスタを生成
├── .github/workflows/        # ci.yml / keep-alive.yml / backup.yml
└── docs/
```

## 7. 食材マスタの作り方

| ステップ | 内容 |
|---|---|
| 1 | 日本食品標準成分表(文部科学省)の Excel を取得 |
| 2 | Python で食品番号・食品名・栄養素を抽出し、献立でよく使う食材(初期 200〜300 品目)に絞る |
| 3 | 売り場カテゴリ・基本単位・1個あたりの重さ・日持ち目安を付与(LLM で下書きし、手で確認) |
| 4 | `seed.sql` として出力 |

成分表との対応付け(食品番号)は第2段階の栄養機能で使います。MVP では手順 3 までで買い物リストが動きます。

## 8. 決定履歴

| 日付 | 決定内容 |
|---|---|
| 2026-10-12 | フロントエンドは React + Vite(PWA) |
| 2026-10-12 | 献立生成は Claude Sonnet 5.5 中心、軽い処理は Claude Haiku 5.5 |
| 2026-10-12 | 実装前に Claude Design で画面デザインを固める |

## 出典

- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude API Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Supabase Pricing](https://supabase.com/pricing)
