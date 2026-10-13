import { DeletePlanButton } from "@/components/DeletePlanButton";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FullScreenMessage } from "@/components/FullScreenMessage";
import { BackIcon, PlusIcon } from "@/components/icons";
import { formatAmount, parseLeftover } from "@/lib/leftovers";
import {
  useAddLeftover,
  useDeleteLeftover,
  useLeftovers,
  usePlan,
  useStartGeneration,
  type Plan,
} from "@/lib/plans";

/** S3 余り物入力 */
export function LeftoversPage() {
  const { planId } = useParams();
  const plan = usePlan(planId);
  if (plan.isPending) return <FullScreenMessage>読み込み中…</FullScreenMessage>;
  if (!plan.data) return <FullScreenMessage>献立が見つかりません</FullScreenMessage>;
  return <LeftoversForm plan={plan.data} />;
}

function LeftoversForm({ plan }: { plan: Plan }) {
  const navigate = useNavigate();
  const leftovers = useLeftovers(plan.id);
  const add = useAddLeftover();
  const remove = useDeleteLeftover();
  const start = useStartGeneration();
  const [text, setText] = useState("");
  const [request, setRequest] = useState(plan.request);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = parseLeftover(text);
    if (!parsed) return;
    await add.mutateAsync(parsed);
    setText("");
  }

  async function onGenerate() {
    await start.mutateAsync({ planId: plan.id, request });
    navigate(`/plans/${plan.id}/proposal`);
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2">
        <Link
          to={`/plans/${plan.id}/edit`}
          aria-label="戻る"
          className="flex size-11 items-center justify-center"
        >
          <BackIcon />
        </Link>
        <h1 className="font-display text-lg font-bold">冷蔵庫の余り物</h1>
        <span className="ml-auto pr-3 text-[13px] text-muted">2 / 2</span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-1 pb-4">
        <p className="text-sm leading-relaxed text-muted">
          使い切りたい食材を入れると、期間の前半の献立で優先して使います。
        </p>

        <section aria-labelledby="leftovers-heading" className="flex flex-col gap-2.5">
          <form onSubmit={(e) => void onAdd(e)} className="flex flex-col gap-2.5">
            <label
              id="leftovers-heading"
              htmlFor="leftover-input"
              className="text-sm font-bold text-muted"
            >
              食材を追加
            </label>
            <div className="flex gap-2">
              <input
                id="leftover-input"
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="例:にんじん 1本"
                enterKeyHint="done"
                className="h-12 min-w-0 flex-1 rounded-2xl border border-[#D9CBB9] bg-surface px-3.5 text-base"
              />
              <button
                type="submit"
                aria-label="追加"
                disabled={!text.trim() || add.isPending}
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white disabled:opacity-50"
              >
                <PlusIcon size={22} />
              </button>
            </div>
          </form>

          {(leftovers.data ?? []).length > 0 ? (
            <ul
              aria-label="入力済みの余り物"
              className="divide-y divide-divider rounded-2xl border border-line bg-surface"
            >
              {leftovers.data!.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-4">
                  <span className="flex-1 text-[15px]">{item.raw_name}</span>
                  <span className="text-sm text-muted">{formatAmount(item.amount, item.unit)}</span>
                  <button
                    type="button"
                    aria-label={`${item.raw_name}を削除`}
                    onClick={() => remove.mutate(item.id)}
                    className="flex size-11 items-center justify-center text-muted"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : leftovers.isSuccess ? (
            <p className="text-[13px] text-muted">余り物がなければ、そのまま提案に進めます。</p>
          ) : null}
        </section>

        <section className="flex flex-col gap-2.5">
          <label htmlFor="request-input" className="text-sm font-bold text-muted">
            リクエスト(任意)
          </label>
          <input
            id="request-input"
            type="text"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="例:魚料理を1回入れて"
            className="h-12 rounded-2xl border border-[#D9CBB9] bg-surface px-3.5 text-base"
          />
        </section>
        <div className="mt-2">
          <DeletePlanButton plan={plan} disabled={start.isPending} />
        </div>
      </main>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-line bg-surface px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
        {start.isError ? (
          <p role="alert" className="text-center text-xs text-danger">
            {start.error.message}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={start.isPending}
          className="h-[52px] rounded-full bg-primary text-base font-bold text-white disabled:opacity-50"
        >
          {start.isPending ? "送信しています…" : "献立を提案してもらう"}
        </button>
      </footer>
    </div>
  );
}
