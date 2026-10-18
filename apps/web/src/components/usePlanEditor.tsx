import { useState } from "react";
import { makeAheadOptions, remainingDays } from "@/lib/makeAhead";
import { useMakeAhead, useRegenerate, useSwapDish, type Plan, type PlanDay } from "@/lib/plans";
import { useBuildShoppingList } from "@/lib/shoppingList";
import type { DayEditControls } from "./DayMenuCard";
import { MakeAheadSheet, type MakeAheadTarget } from "./MakeAheadSheet";
import { ResuggestSheet, type ResuggestTarget } from "./ResuggestSheet";

/**
 * Changing part of a proposed or confirmed plan: re-suggest a day or a dish, swap in a
 * favourite, or make a dish ahead for later days. Shared by S4 and S1.
 *
 * Returns the controls for each DayMenuCard, the bottom sheets to render once, and the
 * state of the change in progress. A confirmed plan's shopping list is rebuilt after each
 * change (checks are kept).
 */
export function usePlanEditor(plan: Plan, initialSheet: ResuggestTarget | null = null) {
  const buildList = useBuildShoppingList();
  const partial = useRegenerate();
  const swap = useSwapDish();
  const makeAhead = useMakeAhead();
  const [sheet, setSheet] = useState<ResuggestTarget | null>(initialSheet);
  const [makeAheadTarget, setMakeAheadTarget] = useState<MakeAheadTarget | null>(null);
  const [busyDayId, setBusyDayId] = useState<string | null>(null);

  const changing = partial.isPending || swap.isPending || makeAhead.isPending;
  const error = partial.error ?? swap.error ?? makeAhead.error;

  const afterChange = () => {
    if (plan.status === "confirmed") buildList.mutate(plan.id);
  };
  const resetAll = () => {
    partial.reset();
    swap.reset();
    makeAhead.reset();
  };

  function regenerateTarget(target: ResuggestTarget, hint: string) {
    setSheet(null);
    setBusyDayId(target.day.id);
    resetAll();
    partial.mutate(
      { planId: plan.id, dayId: target.day.id, dishId: target.dish?.id, hint },
      { onSuccess: afterChange, onSettled: () => setBusyDayId(null) },
    );
  }

  function swapTarget(target: ResuggestTarget, recipeId: string) {
    setSheet(null);
    resetAll();
    if (target.dish) swap.mutate({ dishId: target.dish.id, recipeId }, { onSuccess: afterChange });
  }

  function makeAheadFor(
    target: MakeAheadTarget,
    targets: { day_id: string; replace_dish_id: string }[],
  ) {
    setMakeAheadTarget(null);
    resetAll();
    makeAhead.mutate({ dishId: target.dish.id, targets }, { onSuccess: afterChange });
  }

  // A dish can be made ahead when a later day can take it and it is not at 3 meals yet.
  const canMakeAhead = (target: ResuggestTarget) =>
    target.dish !== undefined &&
    makeAheadOptions(plan.days, target.day, target.dish).length > 0 &&
    remainingDays(plan.days, target.dish) > 0;

  const editFor = (day: PlanDay): DayEditControls => ({
    onDay: () => setSheet({ day }),
    onDish: (dish) => setSheet({ day, dish }),
    busy: busyDayId === day.id,
    disabled: changing,
  });

  const sheets = (
    <>
      {sheet ? (
        <ResuggestSheet
          target={sheet}
          onClose={() => setSheet(null)}
          onRegenerate={(hint) => regenerateTarget(sheet, hint)}
          onSwap={(recipeId) => swapTarget(sheet, recipeId)}
          onMakeAhead={
            canMakeAhead(sheet)
              ? () => {
                  setSheet(null);
                  setMakeAheadTarget({ day: sheet.day, dish: sheet.dish! });
                }
              : undefined
          }
        />
      ) : null}
      {makeAheadTarget ? (
        <MakeAheadSheet
          days={plan.days}
          target={makeAheadTarget}
          onClose={() => setMakeAheadTarget(null)}
          onSubmit={(targets) => makeAheadFor(makeAheadTarget, targets)}
        />
      ) : null}
    </>
  );

  return {
    editFor,
    sheets,
    /** A change is being saved. */
    changing,
    error,
    /** The shopping list is being rebuilt after a change. */
    rebuilding: buildList.isPending,
  };
}
