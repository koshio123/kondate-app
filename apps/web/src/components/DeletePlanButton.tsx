import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { formatIsoShort } from "@/lib/date";
import { useDeletePlan, type Plan } from "@/lib/plans";

/** "この献立を削除": the first tap asks, the second deletes (no browser dialog). */
export function DeletePlanButton({ plan, disabled = false }: { plan: Plan; disabled?: boolean }) {
  const navigate = useNavigate();
  const remove = useDeletePlan();
  const [armed, setArmed] = useState(false);

  // An unanswered confirmation goes back to normal after a while.
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 6000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  async function onClick() {
    if (!armed) {
      setArmed(true);
      return;
    }
    await remove.mutateAsync(plan.id).then(
      () => navigate("/", { replace: true }),
      () => setArmed(false),
    );
  }

  const period = `${formatIsoShort(plan.start_date)}〜${formatIsoShort(plan.end_date)}`;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={disabled || remove.isPending}
        className={`min-h-10 rounded-full px-4 text-sm disabled:opacity-50 ${armed ? "bg-danger font-bold text-white" : "text-danger"}`}
      >
        {remove.isPending
          ? "削除しています…"
          : armed
            ? `もう一度押すと${period}の献立と買い物リストを削除します`
            : "この献立を削除"}
      </button>
      {remove.isError ? (
        <p role="alert" className="text-center text-xs text-danger">
          {remove.error.message}
        </p>
      ) : null}
    </div>
  );
}
