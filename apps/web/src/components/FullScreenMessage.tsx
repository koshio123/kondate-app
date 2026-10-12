import type { ReactNode } from "react";

export function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8 text-center text-sm text-muted">
      <p role="status">{children}</p>
    </div>
  );
}
