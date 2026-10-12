import type { ComponentType } from "react";
import { NavLink, Outlet } from "react-router";
import { CartIcon, GearIcon, HeartIcon, HomeIcon } from "./icons";

const TABS: { to: string; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { to: "/", label: "ホーム", Icon: HomeIcon },
  { to: "/shopping", label: "買い物", Icon: CartIcon },
  { to: "/favorites", label: "お気に入り", Icon: HeartIcon },
  { to: "/settings", label: "設定", Icon: GearIcon },
];

/** Screens with the bottom tab bar (S1, S6, S7, S8). */
export function AppLayout() {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
      <nav
        aria-label="メインメニュー"
        className="grid shrink-0 grid-cols-4 border-t border-line bg-surface pb-[max(8px,env(safe-area-inset-bottom))]"
      >
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex h-[68px] flex-col items-center justify-center gap-1 text-[11px] ${
                isActive ? "font-bold text-primary" : "text-muted"
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
