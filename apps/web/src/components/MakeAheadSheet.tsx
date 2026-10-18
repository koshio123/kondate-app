import { useState } from "react";
import { formatIsoShort } from "@/lib/date";
import {
  FREEZE_FROM_DAYS,
  makeAheadCaution,
  makeAheadOptions,
  remainingDays,
} from "@/lib/makeAhead";
import type { PlanDay, PlanDish } from "@/lib/plans";
import { Sheet } from "./Sheet";

export type MakeAheadTarget = { day: PlanDay; dish: PlanDish };

/**
 * Bottom sheet for eating a dish again on later days (S4). On each chosen day it replaces
 * the dish of the same course.
 */
export function MakeAheadSheet({
  days,
  target,
  onClose,
  onSubmit,
}: {
  days: PlanDay[];
  target: MakeAheadTarget;
  onClose: () => void;
  onSubmit: (targets: { day_id: string; replace_dish_id: string }[]) => void;
}) {
  const { day, dish } = target;
  const options = makeAheadOptions(days, day, dish);
  const slots = remainingDays(days, dish);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const caution = dish.recipe ? makeAheadCaution(dish.recipe.title) : null;
  const full = picked.size >= slots;

  function toggle(dayId: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(dayId)) next.delete(dayId);
      else if (next.size < slots) next.add(dayId);
      return next;
    });
  }

  return (
    <Sheet
      title="作り置きにする"
      subtitle={`${formatIsoShort(day.date)}に作る:${dish.recipe?.title ?? ""}`}
      onClose={onClose}
    >
      <p className="text-[13px] leading-relaxed text-muted">
        食べる日を選んでください(あと{slots}日まで)。材料は食べる回数分が買い物リストに入ります。
      </p>
      {caution ? (
        <p className="rounded-2xl bg-primary-soft px-3.5 py-2.5 text-xs leading-relaxed text-primary-strong">
          {caution}
        </p>
      ) : null}

      {options.length === 0 || slots === 0 ? (
        <p className="text-[13px] text-muted">
          {slots === 0
            ? "この料理はもう3回分の作り置きになっています。"
            : "この日より後に、入れ替えられる料理のある日がありません。"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((option) => {
            const on = picked.has(option.day.id);
            return (
              <li key={option.day.id}>
                <label
                  className={`flex min-h-14 items-center gap-3 rounded-2xl border bg-surface px-3.5 py-2.5 ${on ? "border-leftover" : "border-line"} ${!on && full ? "opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && full}
                    onChange={() => toggle(option.day.id)}
                    className="size-5 shrink-0 accent-[var(--color-leftover)]"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[15px] font-bold">
                        {formatIsoShort(option.day.date)}
                      </span>
                      <span className="text-xs text-muted">
                        {option.daysLater}日後
                        {option.daysLater >= FREEZE_FROM_DAYS ? "・冷凍保存がおすすめ" : ""}
                      </span>
                    </span>
                    <span className="text-[13px] text-muted">
                      「{option.replaces.recipe?.title ?? "(削除された料理)"}」と入れ替え
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        disabled={picked.size === 0}
        onClick={() =>
          onSubmit(
            options
              .filter((o) => picked.has(o.day.id))
              .map((o) => ({ day_id: o.day.id, replace_dish_id: o.replaces.id })),
          )
        }
        className="h-[52px] rounded-full bg-leftover text-base font-bold text-white disabled:opacity-40"
      >
        {picked.size === 0 ? "食べる日を選んでください" : `${picked.size + 1}回分作る`}
      </button>
    </Sheet>
  );
}
