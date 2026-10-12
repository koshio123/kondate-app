import type { ReactNode } from "react";
import { PageTitle, ScreenHeader } from "@/components/ScreenHeader";

/** Screens that are routed but not built yet. Each is replaced as its feature lands. */
function NotYet({ children }: { children: ReactNode }) {
  return (
    <main className="px-5 py-8 text-sm leading-relaxed text-muted">
      <p>{children}</p>
    </main>
  );
}

/** S2 計画作成 */
export function PlanCreatePage() {
  return (
    <>
      <ScreenHeader title="献立を計画する" backTo="/" />
      <NotYet>期間と日ごとのモード(通常・時短・なし)の設定は次のステップで実装します。</NotYet>
    </>
  );
}

/** S3 余り物入力 */
export function LeftoversPage() {
  return (
    <>
      <ScreenHeader title="冷蔵庫の余り物" backTo="/plan/new" />
      <NotYet>余り物の入力は次のステップで実装します。</NotYet>
    </>
  );
}

/** S4 献立提案の確認 */
export function ProposalPage() {
  return (
    <>
      <ScreenHeader title="献立の提案" backTo="/" />
      <NotYet>献立の提案は Edge Function の実装後に表示します。</NotYet>
    </>
  );
}

/** S5 料理詳細 */
export function DishDetailPage() {
  return (
    <>
      <ScreenHeader title="料理" backTo="/" />
      <NotYet>料理の詳細は献立の提案と合わせて実装します。</NotYet>
    </>
  );
}

/** S6 買い物リスト */
export function ShoppingPage() {
  return (
    <>
      <PageTitle>買い物リスト</PageTitle>
      <NotYet>献立を確定すると、ここに売り場ごとの買い物リストが表示されます。</NotYet>
    </>
  );
}

/** S7 お気に入り */
export function FavoritesPage() {
  return (
    <>
      <PageTitle>お気に入り</PageTitle>
      <NotYet>美味しかった料理を保存すると、ここに表示されます。</NotYet>
    </>
  );
}
