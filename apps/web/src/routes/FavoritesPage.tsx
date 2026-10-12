import { useState } from "react";
import { Link } from "react-router";
import { ChevronRightIcon, SearchIcon } from "@/components/icons";
import { formatIsoShort } from "@/lib/date";
import { type FavoriteFilter, filterFavorites, QUICK_MINUTES } from "@/lib/favorites";
import { useFavorites } from "@/lib/favoritesQuery";
import { COURSE_LABEL } from "@/lib/plans";

const FILTERS: { value: FavoriteFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "main", label: "主菜" },
  { value: "side", label: "副菜" },
  { value: "soup", label: "汁物" },
  { value: "one_dish", label: "一品" },
  { value: "quick", label: `${QUICK_MINUTES}分以内` },
];

/** S7 お気に入り */
export function FavoritesPage() {
  const favorites = useFavorites();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FavoriteFilter>("all");
  const all = favorites.data ?? [];
  const shown = filterFavorites(all, query, filter);

  return (
    <div className="flex flex-col pb-4">
      <header className="flex flex-col gap-3 px-5 pt-5 pb-3">
        <h1 className="font-display text-2xl font-bold">お気に入り</h1>
        <label className="flex h-[46px] items-center gap-2 rounded-[14px] border border-[#D9CBB9] bg-surface px-3.5">
          <SearchIcon size={18} className="text-muted" />
          <span className="sr-only">料理を検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="料理名・食材で検索"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
        <div
          role="group"
          aria-label="区分で絞り込み"
          className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]"
        >
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.value)}
                className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] ${active ? "bg-ink font-bold text-white" : "border border-[#D9CBB9] bg-surface"}`}
              >
                {f.label}
                {f.value === "all" && favorites.data ? ` ${all.length}` : ""}
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex flex-col gap-2.5 px-4">
        {favorites.isPending ? (
          <p className="px-1 text-sm text-muted">読み込み中…</p>
        ) : favorites.isError ? (
          <p role="alert" className="px-1 text-sm text-danger">
            読み込めませんでした。電波の良い場所でもう一度お試しください。
          </p>
        ) : all.length === 0 ? (
          <p className="px-1 text-sm leading-relaxed text-muted">
            まだお気に入りがありません。料理の詳細画面でハートを付けると、ここに並びます。献立の提案で品を入れ替えるときにも選べます。
          </p>
        ) : shown.length === 0 ? (
          <p className="px-1 text-sm text-muted">条件に合う料理がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {shown.map((f) => (
              <li key={f.id}>
                <Link
                  to={`/dishes/${f.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3.5 text-ink"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary-strong">
                        {COURSE_LABEL[f.course]}
                      </span>
                      <span className="truncate text-base font-bold">{f.title}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-muted">
                      {f.rating ? (
                        <span
                          className="tracking-[1px] text-primary"
                          aria-label={`評価 ${f.rating} / 5`}
                        >
                          {"★".repeat(f.rating)}
                          {"☆".repeat(5 - f.rating)}
                        </span>
                      ) : (
                        <span>評価なし</span>
                      )}
                      <span>{f.cook_minutes}分</span>
                      {f.lastDate ? <span>最後に作った日 {formatIsoShort(f.lastDate)}</span> : null}
                    </div>
                  </div>
                  <ChevronRightIcon size={20} className="shrink-0 text-[#B9A894]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
