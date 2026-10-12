import type { ReactNode } from "react";
import { Link } from "react-router";
import { BackIcon } from "./icons";

/** Header for screens outside the tab bar (S2-S5): back button, title, optional right slot. */
export function ScreenHeader({
  title,
  backTo,
  right,
}: {
  title: string;
  backTo: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2">
      <Link
        to={backTo}
        aria-label="戻る"
        className="flex size-11 items-center justify-center rounded-full text-ink"
      >
        <BackIcon />
      </Link>
      <h1 className="font-display text-lg font-bold">{title}</h1>
      {right ? <div className="ml-auto pr-3">{right}</div> : null}
    </header>
  );
}

/** Large page title for tab screens (S1, S6-S8). */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1 px-5 pt-6 pb-3">
      <h1 className="font-display text-2xl leading-snug font-bold">{children}</h1>
      {sub ? <p className="text-sm text-muted">{sub}</p> : null}
    </header>
  );
}
