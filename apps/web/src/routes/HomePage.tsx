import { Link } from "react-router";
import { PlusIcon } from "@/components/icons";
import { PageTitle } from "@/components/ScreenHeader";
import { formatMonthDayLong } from "@/lib/date";

/** S1 ホーム. Shows the empty state until meal plans are implemented. */
export function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="px-5 pt-6 text-[13px] text-muted">{formatMonthDayLong(new Date())}</div>
      <PageTitle>今週のこんだて</PageTitle>
      <main className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <section className="flex flex-col items-center gap-2 rounded-[20px] border border-line bg-surface px-5 py-10 text-center">
          <p className="font-display text-base font-bold">まだ献立がありません</p>
          <p className="text-sm leading-relaxed text-muted">
            期間と日ごとの予定を決めると、
            <br />
            夕食の献立を提案します。
          </p>
        </section>
        <Link
          to="/plan/new"
          className="mt-auto flex h-[52px] items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-white"
        >
          <PlusIcon size={20} />
          献立を計画する
        </Link>
      </main>
    </div>
  );
}
