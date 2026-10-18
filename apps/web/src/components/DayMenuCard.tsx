import type { ReactNode } from "react";
import { Link } from "react-router";
import { formatIsoShort } from "@/lib/date";
import { dishLink, dishMinutes } from "@/lib/makeAhead";
import { COURSE_LABEL, type PlanDay, type PlanDish } from "@/lib/plans";
import { RefreshIcon } from "./icons";
import { ModeBadge } from "./ModeBadge";

/** Re-suggest controls, shown on S4 only. */
export interface DayEditControls {
  onDay: () => void;
  onDish: (dish: PlanDish) => void;
  /** This day is being re-suggested. */
  busy: boolean;
  /** Another change is in progress. */
  disabled: boolean;
}

/** One day of a plan: date, mode and the dishes (S1 / S4). */
export function DayMenuCard({
  day,
  warnings = [],
  edit,
  action,
}: {
  day: PlanDay;
  warnings?: string[];
  edit?: DayEditControls;
  /** Shown at the right of the header when there are no edit controls (S1). */
  action?: ReactNode;
}) {
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

  const total = day.dishes.reduce((sum, d) => sum + dishMinutes(d), 0);
  return (
    <section
      aria-label={label}
      aria-busy={edit?.busy ?? false}
      className={`flex flex-col gap-1 rounded-[18px] border border-line bg-surface pt-3 pb-2 pl-3.5 ${edit ? "pr-1.5" : "pr-3.5"}`}
    >
      <div className={`mb-1 flex items-center gap-2 ${edit ? "pr-1.5" : ""}`}>
        <span className="font-display text-base font-bold">{label}</span>
        <ModeBadge mode={day.mode} />
        <span className={`text-xs ${day.mode === "quick" ? "font-bold text-quick" : "text-muted"}`}>
          合計{total}分
        </span>
        {!edit && action ? <div className="ml-auto">{action}</div> : null}
        {edit ? (
          <button
            type="button"
            onClick={edit.onDay}
            disabled={edit.disabled || edit.busy}
            className="ml-auto h-8 rounded-full border border-[#D9CBB9] px-2.5 text-xs text-muted disabled:opacity-50"
          >
            この日を再提案
          </button>
        ) : null}
      </div>

      {edit?.busy ? (
        <p
          aria-live="polite"
          className="flex items-center gap-2 py-3 text-[13px] text-primary-strong"
        >
          <RefreshIcon size={18} className="animate-spin" />
          新しい案を考えています(30秒ほど)
        </p>
      ) : day.dishes.length === 0 ? (
        <p className="py-2 text-[13px] text-muted">料理がありません</p>
      ) : (
        <ul className="flex flex-col">
          {day.dishes.map((dish) => (
            <li key={dish.id} className="flex items-center">
              <Link
                to={dishLink(dish)}
                className="flex min-h-11 flex-1 items-center gap-2.5 py-1 text-ink"
              >
                <span className="w-8 shrink-0 text-xs text-muted">{COURSE_LABEL[dish.course]}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`text-[15px] ${dish.course === "main" || dish.course === "one_dish" ? "font-bold" : ""}`}
                  >
                    {dish.recipe?.title ?? "(削除された料理)"}
                  </span>
                  <MakeAheadNote dish={dish} />
                </span>
                {dish.course !== "staple" ? (
                  <span className="text-xs text-muted">
                    {dish.madeOn ? "温め" : ""}
                    {dishMinutes(dish)}分
                  </span>
                ) : null}
              </Link>
              {edit ? (
                dish.course === "staple" ? (
                  <span className="size-11 shrink-0" />
                ) : (
                  <button
                    type="button"
                    aria-label={`${COURSE_LABEL[dish.course]}「${dish.recipe?.title ?? ""}」を入れ替える`}
                    onClick={() => edit.onDish(dish)}
                    disabled={edit.disabled}
                    className="flex size-11 shrink-0 items-center justify-center text-primary disabled:opacity-40"
                  >
                    <RefreshIcon size={20} />
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && !edit?.busy ? (
        <ul className="mt-1 mr-2 flex flex-col gap-1 border-t border-dashed border-line pt-2">
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

/** "10/13(月)の作り置き" on the later day, "多めに作る(10/15・10/16にも)" on the cooking day. */
function MakeAheadNote({ dish }: { dish: PlanDish }) {
  if (dish.madeOn) {
    return (
      <span className="text-xs font-bold text-leftover">
        作り置き・{formatIsoShort(dish.madeOn.date)}に作ったもの
      </span>
    );
  }
  if (dish.alsoOn.length === 0) return null;
  return (
    <span className="text-xs font-bold text-leftover">
      {dish.alsoOn.length + 1}回分作る({dish.alsoOn.map(formatIsoShort).join("・")}にも)
    </span>
  );
}
