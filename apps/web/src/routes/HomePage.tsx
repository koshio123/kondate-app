import { Link } from "react-router";
import { DayMenuCard } from "@/components/DayMenuCard";
import { CartIcon, PlusIcon } from "@/components/icons";
import { PageTitle } from "@/components/ScreenHeader";
import { formatIsoShort, formatMonthDayLong, toIsoDate } from "@/lib/date";
import { useActivePlans, type Plan } from "@/lib/plans";
import { useShoppingList } from "@/lib/shoppingList";

/** S1 ホーム */
export function HomePage() {
  const current = useActivePlans();
  // Today's plan (or the next one) in full; any later plans as links below it.
  const [plan = null, ...later] = current.data ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-5 pt-6 text-[13px] text-muted">{formatMonthDayLong(new Date())}</div>
      <PageTitle
        sub={
          plan
            ? `${formatIsoShort(plan.start_date)} 〜 ${formatIsoShort(plan.end_date)}・${plan.days.length}日間`
            : undefined
        }
      >
        今週のこんだて
      </PageTitle>
      <main className="flex flex-1 flex-col gap-4 px-5 pb-5">
        {current.isPending ? (
          <p className="py-10 text-center text-sm text-muted">読み込み中…</p>
        ) : current.isError ? (
          <p role="alert" className="py-10 text-center text-sm text-danger">
            献立を読み込めませんでした。電波の良い場所で開き直してください。
          </p>
        ) : plan ? (
          <>
            <PlanSummary plan={plan} />
            {later.length > 0 ? <LaterPlans plans={later} /> : null}
          </>
        ) : (
          <EmptyState />
        )}
        {!plan || (plan.status === "confirmed" && later.length === 0) ? (
          <Link
            to="/plan/new"
            className={`mt-auto flex h-[52px] items-center justify-center gap-2 rounded-full text-base font-bold ${
              plan ? "border-2 border-primary text-primary" : "bg-primary text-white"
            }`}
          >
            <PlusIcon size={20} />
            {plan ? "次の献立を計画する" : "献立を計画する"}
          </Link>
        ) : null}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center gap-2 rounded-[20px] border border-line bg-surface px-5 py-10 text-center">
      <p className="font-display text-base font-bold">まだ献立がありません</p>
      <p className="text-sm leading-relaxed text-muted">
        期間と日ごとの予定を決めると、
        <br />
        夕食の献立を提案します。
      </p>
    </section>
  );
}

const STATUS_BANNER: Partial<
  Record<Plan["status"], { text: string; action: string; to: (id: string) => string }>
> = {
  draft: { text: "献立の計画が途中です", action: "続きから", to: (id) => `/plans/${id}/leftovers` },
  generating: {
    text: "献立を考えています…",
    action: "様子を見る",
    to: (id) => `/plans/${id}/proposal`,
  },
  proposed: {
    text: "献立の提案が届きました",
    action: "確認する",
    to: (id) => `/plans/${id}/proposal`,
  },
};

function PlanSummary({ plan }: { plan: Plan }) {
  const banner = STATUS_BANNER[plan.status];
  if (banner) {
    return (
      <Link
        to={banner.to(plan.id)}
        className="flex min-h-16 items-center gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-ink"
      >
        <span
          className={`flex-1 text-[15px] font-bold ${plan.status === "generating" ? "animate-pulse" : ""}`}
        >
          {plan.generation_error && plan.status === "draft"
            ? "献立を作れませんでした"
            : banner.text}
        </span>
        <span className="text-sm font-bold text-primary">{banner.action}</span>
      </Link>
    );
  }

  // Confirmed: today's (or the next) dinner first, then the rest of the period.
  const today = toIsoDate(new Date());
  const upcoming = plan.days.filter((d) => d.date >= today);
  const [next, ...rest] = upcoming.length > 0 ? upcoming : plan.days;
  return (
    <>
      <ShoppingProgressCard planId={plan.id} />
      {next ? (
        <section aria-labelledby="next-heading" className="flex flex-col gap-2">
          <h2 id="next-heading" className="font-display text-base font-bold">
            {next.date === today ? "今日の夕食" : "次の夕食"}
          </h2>
          <DayMenuCard day={next} />
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section aria-labelledby="later-heading" className="flex flex-col gap-2">
          <h2 id="later-heading" className="font-display text-base font-bold">
            この先の献立
          </h2>
          {rest.map((day) => (
            <DayMenuCard key={day.id} day={day} />
          ))}
        </section>
      ) : null}
    </>
  );
}

const STATUS_LABEL: Record<Plan["status"], string> = {
  draft: "計画中",
  generating: "献立を考えています",
  proposed: "提案を確認してください",
  confirmed: "決定済み",
  archived: "",
};

function LaterPlans({ plans }: { plans: Plan[] }) {
  return (
    <section aria-labelledby="later-plans-heading" className="flex flex-col gap-2">
      <h2 id="later-plans-heading" className="font-display text-base font-bold">
        次の献立
      </h2>
      {plans.map((p) => (
        <Link
          key={p.id}
          to={p.status === "draft" ? `/plans/${p.id}/leftovers` : `/plans/${p.id}/proposal`}
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-ink"
        >
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-bold">
              {formatIsoShort(p.start_date)} 〜 {formatIsoShort(p.end_date)}
            </span>
            <span className="text-xs text-muted">{STATUS_LABEL[p.status]}</span>
          </span>
          <span className="text-sm font-bold text-primary">開く</span>
        </Link>
      ))}
    </section>
  );
}

function ShoppingProgressCard({ planId }: { planId: string }) {
  const list = useShoppingList(planId);
  const items = list.data?.items ?? [];
  const done = items.filter((i) => i.checked).length;
  return (
    <Link
      to={`/shopping?plan=${planId}`}
      className="flex min-h-11 items-center gap-3.5 rounded-2xl bg-primary-soft px-4 py-3.5 text-ink"
    >
      <CartIcon className="text-primary" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex justify-between text-sm">
          <span className="font-bold">買い物リスト</span>
          <span className="text-muted">
            {list.data ? `${done} / ${items.length} 品` : "まだ作っていません"}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-1.5 bg-primary"
            style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
