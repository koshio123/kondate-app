import { useEffect, useId, useState, type FormEvent } from "react";
import { formatIsoShort } from "@/lib/date";
import type { Favorite } from "@/lib/favorites";
import { useFavorites } from "@/lib/favoritesQuery";
import { COURSE_LABEL, type PlanDay, type PlanDish } from "@/lib/plans";
import { CloseIcon, RefreshIcon } from "./icons";

const HINTS = ["さっぱり", "こってり", "魚で", "肉で", "もっと簡単に", "野菜多め"];

export type ResuggestTarget = { day: PlanDay; dish?: PlanDish };

/**
 * Bottom sheet for re-suggesting a day or a dish (S4). For a dish it also lists favourites
 * of the same course to put in its place.
 */
export function ResuggestSheet({
  target,
  onClose,
  onRegenerate,
  onSwap,
}: {
  target: ResuggestTarget;
  onClose: () => void;
  onRegenerate: (hint: string) => void;
  onSwap: (recipeId: string) => void;
}) {
  const titleId = useId();
  const [hint, setHint] = useState("");
  const { day, dish } = target;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onRegenerate(hint);
  }

  const heading = dish
    ? `${COURSE_LABEL[dish.course]}を入れ替える`
    : `${formatIsoShort(day.date)}を作り直す`;

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
              {heading}
            </h2>
            {dish?.recipe ? (
              <p className="truncate text-[13px] text-muted">いま:{dish.recipe.title}</p>
            ) : null}
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

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-2">
          <form onSubmit={submit} className="flex flex-col gap-2.5">
            <label htmlFor="resuggest-hint" className="text-[13px] font-bold">
              希望があれば(任意)
            </label>
            <input
              id="resuggest-hint"
              type="text"
              value={hint}
              maxLength={200}
              onChange={(e) => setHint(e.target.value)}
              placeholder="例:魚以外で、子どもも食べやすく"
              className="h-11 rounded-xl border border-[#D9CBB9] bg-surface px-3 text-base"
            />
            <div role="group" aria-label="よく使う希望" className="flex flex-wrap gap-1.5">
              {HINTS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={hint === h}
                  onClick={() => setHint((v) => (v === h ? "" : h))}
                  className={`h-9 rounded-full px-3 text-[13px] ${hint === h ? "bg-ink font-bold text-white" : "border border-[#D9CBB9] bg-surface"}`}
                >
                  {h}
                </button>
              ))}
            </div>
            <button
              type="submit"
              className="mt-1 flex h-[52px] items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-white"
            >
              <RefreshIcon size={20} />
              {dish ? "別の案を出してもらう" : "この日を作り直してもらう"}
            </button>
            <p className="text-center text-xs text-muted">30秒ほどかかります</p>
          </form>

          {dish ? <FavoritePicker dish={dish} day={day} onPick={onSwap} /> : null}
        </div>
      </div>
    </div>
  );
}

function FavoritePicker({
  dish,
  day,
  onPick,
}: {
  dish: PlanDish;
  day: PlanDay;
  onPick: (recipeId: string) => void;
}) {
  const favorites = useFavorites();
  // Skip what the day already has (the same recipe, or a saved copy with the same name).
  const inDay = new Set(day.dishes.flatMap((d) => (d.recipe ? [d.recipe.id, d.recipe.title] : [])));
  // A normal day keeps its 主食・主菜・副菜・汁物 shape; a quick day takes any non-staple dish.
  const fits = (f: Favorite) =>
    !inDay.has(f.id) &&
    !inDay.has(f.title) &&
    (day.mode === "quick" ? f.course !== "staple" : f.course === dish.course);
  const list = (favorites.data ?? []).filter(fits);

  return (
    <section aria-labelledby="fav-picker" className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 id="fav-picker" className="text-[13px] font-bold">
        お気に入りから選ぶ
      </h3>
      {favorites.isPending ? (
        <p className="text-[13px] text-muted">読み込み中…</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">
          {COURSE_LABEL[dish.course]}
          のお気に入りはまだありません。料理の詳細でハートを付けると、ここから選べます。
        </p>
      ) : (
        <ul className="divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-surface">
          {list.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onPick(f.id)}
                className="flex min-h-12 w-full items-center gap-2.5 px-3.5 py-2 text-left"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px]">{f.title}</span>
                  <span className="text-xs text-muted">
                    {f.rating ? (
                      <span className="text-primary" aria-label={`評価 ${f.rating} / 5`}>
                        {"★".repeat(f.rating)}
                      </span>
                    ) : null}{" "}
                    {f.cook_minutes}分
                  </span>
                </span>
                <span className="text-xs font-bold text-primary">これにする</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
