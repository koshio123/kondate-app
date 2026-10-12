import type { ReactNode } from "react";
import { PageTitle } from "@/components/ScreenHeader";

/** Screens that are routed but not built yet. Each is replaced as its feature lands. */
function NotYet({ children }: { children: ReactNode }) {
  return (
    <main className="px-5 py-8 text-sm leading-relaxed text-muted">
      <p>{children}</p>
    </main>
  );
}

/** S7 お気に入り */
export function FavoritesPage() {
  return (
    <>
      <PageTitle>お気に入り</PageTitle>
      <NotYet>
        料理の詳細画面でハートを付けると、ここに一覧で表示されます(次のステップで実装)。
      </NotYet>
    </>
  );
}
