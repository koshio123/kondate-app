import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { FullScreenMessage } from "@/components/FullScreenMessage";
import { BackIcon } from "@/components/icons";
import type { DayMode } from "@/components/ModeBadge";
import { addDays, datesInRange, formatIsoShort, toIsoDate } from "@/lib/date";
import { usePlan, useSavePlanDraft, type Plan } from "@/lib/plans";

const MAX_DAYS = 10;
const DEFAULT_DAYS = 5;

const MODES: { mode: DayMode; label: string; selected: string }[] = [
  { mode: "normal", label: "通常", selected: "bg-primary text-white" },
  { mode: "quick", label: "時短", selected: "bg-quick text-white" },
  { mode: "none", label: "なし", selected: "bg-rest text-white" },
];

const HINTS: Record<DayMode, string> = {
  normal: "主食・主菜・副菜・汁物",
  quick: "調理時間の上限内・品数は柔軟",
  none: "献立・買い物の対象外",
};

/** S2 計画作成 (new plan at /plan/new, or edit at /plans/:planId/edit). */
export function PlanEditPage() {
  const { planId } = useParams();
  const plan = usePlan(planId);

  if (planId && plan.isPending) return <FullScreenMessage>読み込み中…</FullScreenMessage>;
  if (planId && !plan.data) return <FullScreenMessage>献立が見つかりません</FullScreenMessage>;
  return <PlanEditForm key={planId ?? "new"} plan={plan.data ?? null} />;
}

function PlanEditForm({ plan }: { plan: Plan | null }) {
  const navigate = useNavigate();
  const save = useSavePlanDraft();
  const tomorrow = addDays(toIsoDate(new Date()), 1);

  const [start, setStart] = useState(plan?.start_date ?? tomorrow);
  const [end, setEnd] = useState(plan?.end_date ?? addDays(tomorrow, DEFAULT_DAYS - 1));
  const [modes, setModes] = useState<Record<string, DayMode>>(() =>
    Object.fromEntries((plan?.days ?? []).map((d) => [d.date, d.mode])),
  );

  const dates = useMemo(() => datesInRange(start, end), [start, end]);
  const rangeError =
    dates.length === 0
      ? "終了日は開始日以降にしてください"
      : dates.length > MAX_DAYS
        ? `最大${MAX_DAYS}日まで計画できます`
        : null;
  const days = dates.map((date) => ({ date, mode: modes[date] ?? ("normal" as DayMode) }));
  const count = (mode: DayMode) => days.filter((d) => d.mode === mode).length;
  const allNone = days.length > 0 && count("none") === days.length;

  function changeStart(value: string) {
    if (!value) return;
    const length = Math.max(1, Math.min(MAX_DAYS, dates.length || DEFAULT_DAYS));
    setStart(value);
    setEnd(addDays(value, length - 1));
  }

  async function submit() {
    const id = await save.mutateAsync({ planId: plan?.id ?? null, start, end, days });
    navigate(`/plans/${id}/leftovers`);
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2">
        <Link to="/" aria-label="戻る" className="flex size-11 items-center justify-center">
          <BackIcon />
        </Link>
        <h1 className="font-display text-lg font-bold">献立を計画する</h1>
        <span className="ml-auto pr-3 text-[13px] text-muted">1 / 2</span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-1 pb-4">
        <section aria-labelledby="period-heading" className="flex flex-col gap-2">
          <h2 id="period-heading" className="text-sm font-bold text-muted">
            期間
          </h2>
          <div className="flex items-center gap-2">
            <DateField label="開始日" value={start} onChange={changeStart} />
            <span aria-hidden="true" className="text-muted">
              〜
            </span>
            <DateField
              label="終了日"
              value={end}
              min={start}
              max={addDays(start, MAX_DAYS - 1)}
              onChange={(v) => v && setEnd(v)}
            />
          </div>
          <p
            className={`text-xs ${rangeError ? "font-bold text-danger" : "text-muted"}`}
            role={rangeError ? "alert" : undefined}
          >
            {rangeError ?? `${dates.length}日間・最大${MAX_DAYS}日まで計画できます`}
          </p>
        </section>

        {!rangeError ? (
          <section aria-labelledby="days-heading" className="flex flex-col gap-2">
            <h2 id="days-heading" className="text-sm font-bold text-muted">
              日ごとの設定
            </h2>
            <ul className="flex flex-col gap-2">
              {days.map((day) => (
                <li
                  key={day.date}
                  className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface px-3 py-2"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-bold">{formatIsoShort(day.date)}</span>
                    <span className="text-xs text-muted">{HINTS[day.mode]}</span>
                  </div>
                  <div
                    role="group"
                    aria-label={`${formatIsoShort(day.date)}のモード`}
                    className="grid grid-cols-3 gap-1 rounded-full bg-[#F5EEE5] p-1"
                  >
                    {MODES.map((option) => {
                      const selected = day.mode === option.mode;
                      return (
                        <button
                          key={option.mode}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setModes((m) => ({ ...m, [day.date]: option.mode }))}
                          className={`h-10 rounded-full text-sm font-bold ${selected ? option.selected : "text-muted"}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-surface px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
        <p className="text-center text-[13px] text-muted">
          {allNone
            ? "すべて「なし」です。献立を作る日を1日以上選んでください"
            : `通常 ${count("normal")}日・時短 ${count("quick")}日・なし ${count("none")}日`}
        </p>
        {save.isError ? (
          <p role="alert" className="text-center text-xs text-danger">
            保存できませんでした。もう一度お試しください。
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={Boolean(rangeError) || allNone || save.isPending}
          className="h-[52px] rounded-full bg-primary text-base font-bold text-white disabled:opacity-50"
        >
          {save.isPending ? "保存しています…" : "次へ:余り物を入力"}
        </button>
      </footer>
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative flex h-[52px] flex-1 flex-col justify-center rounded-2xl border border-line bg-surface px-3.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="text-base font-bold">{formatIsoShort(value)}</span>
      {/*
        The native date input sits on top, invisible, so the field shows "10/13(火)" while the
        browser's own picker does the editing. Phones open the picker on any tap, but desktop
        browsers only open it from the small calendar icon, so open it explicitly.
      */}
      <input
        type="date"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        required
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => openPicker(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker(e.currentTarget);
          }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

function openPicker(input: HTMLInputElement) {
  try {
    input.showPicker();
  } catch {
    // Older browsers (or a call without a user gesture): focusing the field still allows typing.
  }
}
