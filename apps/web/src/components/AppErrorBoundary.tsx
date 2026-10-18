import { Component, type ReactNode } from "react";

/** localStorage key of the saved query cache (see main.tsx). */
export const CACHE_KEY = "kondate-cache";

/**
 * Shows a way out instead of a blank page when rendering fails. The usual cause is data
 * saved by an older version of the app, so reopening drops the saved cache first.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-lg font-bold">画面を表示できませんでした</p>
        <p className="text-sm leading-relaxed text-muted">
          アプリの更新前のデータが残っている可能性があります。
          <br />
          開き直すと、最新のデータを読み込み直します。
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem(CACHE_KEY);
            } catch {
              // storage may be unavailable; reloading still helps
            }
            location.reload();
          }}
          className="h-[52px] w-full rounded-full bg-primary text-base font-bold text-white"
        >
          開き直す
        </button>
      </main>
    );
  }
}
