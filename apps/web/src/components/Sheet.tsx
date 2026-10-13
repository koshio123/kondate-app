import { useEffect, useId, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/** Bottom sheet dialog: dimmed backdrop, title, close button, scrollable body. Esc closes. */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-[#2A211B]/40"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[24px] bg-canvas pb-[max(20px,env(safe-area-inset-bottom))]"
      >
        <header className="flex items-center gap-2 px-5 pt-4 pb-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id={titleId} className="font-display text-lg font-bold">
              {title}
            </h2>
            {subtitle ? <p className="truncate text-[13px] text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onClose}
            className="flex size-11 items-center justify-center text-muted"
          >
            <CloseIcon size={20} />
          </button>
        </header>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-2">{children}</div>
      </div>
    </div>
  );
}
