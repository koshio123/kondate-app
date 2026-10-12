import { Link } from "react-router";
import { formatIsoShort } from "@/lib/date";
import { COURSE_LABEL, type PlanDay } from "@/lib/plans";
import { ModeBadge } from "./ModeBadge";

/** One day of a plan: date, mode and the dishes (S1 / S4). */
export function DayMenuCard({ day, warnings = [] }: { day: PlanDay; warnings?: string[] }) {
  const label = formatIsoShort(day.date);

  if (day.mode === "none") {
    return (
      <section
        aria-label={label}
        className="flex items-center gap-2 rounded-[18px] bg-[#F5EEE5] px-3.5 py-3.5"
      >
        <span className="font-display text-base font-bold text-muted">{label}</span>
        <ModeBadge mode="none" />
        <span className="text-[13px] text-muted">献立なし</span>
      </section>
    );
  }

  const total = day.dishes.reduce((sum, d) => sum + (d.recipe?.cook_minutes ?? 0), 0);
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-1 rounded-[18px] border border-line bg-surface px-3.5 pt-3 pb-2"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="font-display text-base font-bold">{label}</span>
        <ModeBadge mode={day.mode} />
        <span className={`text-xs ${day.mode === "quick" ? "font-bold text-quick" : "text-muted"}`}>
          合計{total}分
        </span>
      </div>
      {day.dishes.length === 0 ? (
        <p className="py-2 text-[13px] text-muted">料理がありません</p>
      ) : (
        <ul className="flex flex-col">
          {day.dishes.map((dish) => (
            <li key={dish.id}>
              <Link
                to={dish.recipe ? `/dishes/${dish.recipe.id}` : "#"}
                className="flex min-h-11 items-center gap-2.5 text-ink"
              >
                <span className="w-8 shrink-0 text-xs text-muted">{COURSE_LABEL[dish.course]}</span>
                <span
                  className={`flex-1 text-[15px] ${dish.course === "main" || dish.course === "one_dish" ? "font-bold" : ""}`}
                >
                  {dish.recipe?.title ?? "(削除された料理)"}
                </span>
                {dish.course !== "staple" ? (
                  <span className="text-xs text-muted">{dish.recipe?.cook_minutes ?? 0}分</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1 border-t border-dashed border-line pt-2">
          {warnings.map((w) => (
            <li key={w} className="text-xs leading-relaxed text-primary-strong">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
