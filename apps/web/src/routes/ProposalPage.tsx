import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { DayMenuCard } from "@/components/DayMenuCard";
import { FullScreenMessage } from "@/components/FullScreenMessage";
import { DeletePlanButton } from "@/components/DeletePlanButton";
import { AppMark, BackIcon, RefreshIcon } from "@/components/icons";
import { usePlanEditor } from "@/components/usePlanEditor";
import { useConfirmPlan, usePlan, useStartGeneration, type Plan } from "@/lib/plans";
import { useBuildShoppingList } from "@/lib/shoppingList";

/** S4 献立提案の確認 (also shows the generating / failed states). */
export function ProposalPage() {
  const { planId } = useParams();
  const plan = usePlan(planId);

  if (plan.isPending) return <FullScreenMessage>読み込み中…</FullScreenMessage>;
  if (!plan.data) return <FullScreenMessage>献立が見つかりません</FullScreenMessage>;

  const p = plan.data;
  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2">
        <Link
          to={p.status === "confirmed" ? "/" : `/plans/${p.id}/leftovers`}
          aria-label="戻る"
          className="flex size-11 items-center justify-center"
        >
          <BackIcon />
        </Link>
        <h1 className="font-display text-lg font-bold">献立の提案</h1>
      </header>
      {p.status === "generating" ? (
        <Generating />
      ) : p.status === "draft" ? (
        <NotGenerated plan={p} />
      ) : (
        <Proposal plan={p} />
      )}
    </div>
  );
}

function Generating() {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-5 px-8 pb-16 text-center"
      aria-live="polite"
    >
      <div className="flex size-24 animate-pulse items-center justify-center rounded-[32px] bg-primary-soft text-primary">
        <AppMark size={56} />
      </div>
      <p className="font-display text-lg font-bold">献立を考えています</p>
      <p className="text-sm leading-relaxed text-muted">
        1分ほどかかります。
        <br />
        この画面を閉じても、できあがるとホームに表示されます。
      </p>
    </main>
  );
}

function NotGenerated({ plan }: { plan: Plan }) {
  const start = useStartGeneration();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-16 text-center">
      {plan.generation_error ? (
        <div
          role="alert"
          className="w-full rounded-2xl border border-[#EBC3B6] bg-danger-soft px-4 py-3 text-left text-[13px] leading-relaxed text-danger"
        >
          {plan.generation_error}
        </div>
      ) : (
        <p className="text-sm text-muted">まだ献立が作られていません。</p>
      )}
      {start.isError ? (
        <p role="alert" className="text-xs text-danger">
          {start.error.message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => start.mutate({ planId: plan.id })}
        disabled={start.isPending}
        className="h-[52px] w-full rounded-full bg-primary text-base font-bold text-white disabled:opacity-50"
      >
        {plan.generation_error ? "もう一度作る" : "献立を提案してもらう"}
      </button>
      <Link to={`/plans/${plan.id}/edit`} className="text-sm text-muted">
        期間や日ごとの設定を変える
      </Link>
      <DeletePlanButton plan={plan} disabled={start.isPending} />
    </main>
  );
}

function Proposal({ plan }: { plan: Plan }) {
  const navigate = useNavigate();
  const confirm = useConfirmPlan();
  const regenerate = useStartGeneration();
  const buildList = useBuildShoppingList();
  // "?day=2026-10-14" (from S2 when a single day of this plan is planned again) opens that day.
  const [params, setParams] = useSearchParams();
  const [initialDay] = useState(() =>
    plan.days.find((d) => d.date === params.get("day") && d.mode !== "none"),
  );
  const editor = usePlanEditor(plan, initialDay ? { day: initialDay } : null);
  useEffect(() => {
    if (params.has("day")) setParams({}, { replace: true });
  }, [params, setParams]);
  const general = plan.warnings.filter((w) => !w.date).map((w) => w.message);
  const { changing, error: changeError } = editor;

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <p className="mx-1 flex flex-wrap items-center gap-1 text-[13px] leading-relaxed text-muted">
          気になる品は
          <RefreshIcon size={14} className="text-primary" />
          で入れ替え・作り置きにできます
        </p>
        {changeError ? (
          <p
            role="alert"
            className="rounded-2xl border border-[#EBC3B6] bg-danger-soft px-4 py-3 text-[13px] leading-relaxed text-danger"
          >
            {changeError.message || "入れ替えられませんでした。もう一度お試しください。"}
          </p>
        ) : null}
        {general.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-2xl bg-primary-soft px-3.5 py-2.5">
            {general.map((message) => (
              <li key={message} className="text-xs leading-relaxed text-primary-strong">
                {message}
              </li>
            ))}
          </ul>
        ) : null}
        {plan.days.map((day) => (
          <DayMenuCard
            key={day.id}
            day={day}
            warnings={plan.warnings.filter((w) => w.date === day.date).map((w) => w.message)}
            edit={editor.editFor(day)}
          />
        ))}
      </main>

      {editor.sheets}

      <footer className="flex shrink-0 flex-col gap-2 border-t border-line bg-surface px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
        {plan.status === "confirmed" ? (
          <p className="py-3 text-center text-sm leading-relaxed text-leftover">
            <span className="font-bold">この献立で決定済みです</span>
            <br />
            <span className="text-xs">
              {editor.rebuilding
                ? "買い物リストを更新しています…"
                : "入れ替えると買い物リストも更新されます(チェックは残ります)"}
            </span>
          </p>
        ) : (
          <>
            {confirm.isError || regenerate.isError ? (
              <p role="alert" className="text-center text-xs text-danger">
                {regenerate.error?.message ?? "決定できませんでした。もう一度お試しください。"}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() =>
                confirm.mutate(plan.id, {
                  // The list can also be built later from the shopping tab if this fails.
                  onSuccess: () =>
                    buildList.mutate(plan.id, {
                      onSettled: () => navigate(`/shopping?plan=${plan.id}`),
                    }),
                })
              }
              disabled={
                confirm.isPending || buildList.isPending || regenerate.isPending || changing
              }
              className="h-[52px] rounded-full bg-primary text-base font-bold text-white disabled:opacity-50"
            >
              {buildList.isPending ? "買い物リストを作っています…" : "決定して買い物リストを作る"}
            </button>
            <button
              type="button"
              onClick={() => regenerate.mutate({ planId: plan.id })}
              disabled={confirm.isPending || regenerate.isPending || changing}
              className="h-10 text-sm text-muted disabled:opacity-50"
            >
              全体を作り直す
            </button>
          </>
        )}
        <DeletePlanButton
          plan={plan}
          disabled={changing || buildList.isPending || editor.rebuilding}
        />
      </footer>
    </>
  );
}
