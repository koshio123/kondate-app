import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { PageTitle } from "@/components/ScreenHeader";
import { formatIsoShort } from "@/lib/date";
import { useActivePlans, type Plan } from "@/lib/plans";
import { formatQuantity } from "@/lib/shopping";
import {
  useAddManualItem,
  useBuildShoppingList,
  useCategories,
  useDeleteManualItem,
  useOnline,
  useShoppingList,
  useToggleItem,
  type ShoppingItem,
  type ShoppingList,
} from "@/lib/shoppingList";

const PANTRY_SECTION = "常備品(家にあるか確認)";

/** S6 買い物リスト */
export function ShoppingPage() {
  const active = useActivePlans();
  const [params, setParams] = useSearchParams();

  if (active.isPending) return <Shell>読み込み中…</Shell>;
  const all = active.data ?? [];
  const confirmed = all.filter((p) => p.status === "confirmed");
  // ?plan= picks a list (from the home card or after deciding); otherwise the earliest one.
  const plan = confirmed.find((p) => p.id === params.get("plan")) ?? confirmed[0];
  if (!plan) {
    const pending = all.find((p) => p.status === "proposed");
    return (
      <Shell>
        献立を決定すると、ここに売り場ごとの買い物リストが表示されます。
        {pending ? (
          <Link to={`/plans/${pending.id}/proposal`} className="mt-3 block font-bold text-primary">
            献立の提案を確認する
          </Link>
        ) : null}
      </Shell>
    );
  }
  return (
    <>
      {confirmed.length > 1 ? (
        <div role="group" aria-label="どの献立の買い物リストか" className="flex gap-2 px-5 pt-4">
          {confirmed.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === plan.id}
              onClick={() => setParams({ plan: p.id }, { replace: true })}
              className={`h-9 rounded-full px-3.5 text-[13px] ${p.id === plan.id ? "bg-ink font-bold text-white" : "border border-[#D9CBB9] bg-surface"}`}
            >
              {formatIsoShort(p.start_date)}〜
            </button>
          ))}
        </div>
      ) : null}
      <PlanShopping key={plan.id} plan={plan} />
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <PageTitle>買い物リスト</PageTitle>
      <main className="px-5 py-6 text-sm leading-relaxed text-muted">{children}</main>
    </>
  );
}

function PlanShopping({ plan }: { plan: Plan }) {
  const list = useShoppingList(plan.id);
  const build = useBuildShoppingList();
  const cookingDays = plan.days.filter((d) => d.mode !== "none").length;
  const sub = `${formatIsoShort(plan.start_date)}〜${formatIsoShort(plan.end_date)}・${cookingDays}日分`;

  if (list.isPending) return <Shell>読み込み中…</Shell>;
  if (!list.data) {
    return (
      <>
        <PageTitle sub={sub}>買い物リスト</PageTitle>
        <main className="flex flex-col gap-3 px-5 py-6">
          <p className="text-sm text-muted">
            決定した献立から、売り場ごとの買い物リストを作ります。
          </p>
          {build.isError ? (
            <p role="alert" className="text-xs text-danger">
              作れませんでした。電波の良い場所でもう一度お試しください。
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => build.mutate(plan.id)}
            disabled={build.isPending}
            className="h-[52px] rounded-full bg-primary text-base font-bold text-white disabled:opacity-50"
          >
            {build.isPending ? "作っています…" : "買い物リストを作る"}
          </button>
        </main>
      </>
    );
  }
  return <ListView plan={plan} list={list.data} live={list.live} sub={sub} />;
}

function ListView({
  plan,
  list,
  live,
  sub,
}: {
  plan: Plan;
  list: ShoppingList;
  live: boolean;
  sub: string;
}) {
  const categories = useCategories();
  const toggle = useToggleItem();
  const removeManual = useDeleteManualItem();
  const rebuild = useBuildShoppingList();
  const online = useOnline();
  const [adding, setAdding] = useState(false);

  const done = list.items.filter((i) => i.checked).length;
  const total = list.items.length;
  const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const order = new Map((categories.data ?? []).map((c) => [c.id, c.sort_order]));

  const sections = new Map<string, ShoppingItem[]>();
  for (const item of [...list.items].sort(
    (a, b) =>
      Number(a.is_pantry) - Number(b.is_pantry) ||
      (order.get(a.category_id) ?? 999) - (order.get(b.category_id) ?? 999) ||
      a.position - b.position,
  )) {
    const name = item.is_pantry ? PANTRY_SECTION : (names.get(item.category_id) ?? "その他");
    sections.set(name, [...(sections.get(name) ?? []), item]);
  }

  return (
    <div className="flex flex-col pb-4">
      <header className="flex flex-col gap-2.5 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-2xl font-bold">買い物リスト</h1>
            <span className="text-[13px] text-muted">{sub}</span>
          </div>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="h-11 rounded-full border border-[#D9CBB9] bg-surface px-3.5 text-sm"
          >
            ＋ 追加
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label="購入済み"
            className="h-2 flex-1 overflow-hidden rounded-full bg-[#EFE4D6]"
          >
            <div
              className="h-2 rounded-full bg-primary transition-[width]"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[13px] font-bold">
            {done} / {total} 品
          </span>
        </div>
        <p
          className={`flex items-center gap-1.5 text-xs ${online ? "text-leftover" : "text-danger"}`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${online ? "bg-leftover" : "bg-danger"}`}
          />
          {!online
            ? "オフライン:チェックは電波が戻ったときに送られます"
            : live
              ? "2人で共有中"
              : "接続しています…"}
        </p>
        {adding ? <AddItemForm plan={plan} list={list} onDone={() => setAdding(false)} /> : null}
      </header>

      <main className="flex flex-col gap-3.5 px-4">
        {[...sections.entries()].map(([section, items]) => (
          <section key={section} aria-label={section} className="flex flex-col gap-1.5">
            <h2 className="mx-1 flex justify-between text-sm font-bold text-muted">
              <span>{section}</span>
              <span className="font-normal">
                {items.filter((i) => i.checked).length} / {items.length}
              </span>
            </h2>
            <ul className="divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-surface">
              {items.map((item) => (
                <li key={item.id} className="flex items-center">
                  <label className="flex min-h-12 flex-1 cursor-pointer items-center gap-3 px-3.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) =>
                        toggle.mutate({
                          planId: plan.id,
                          itemId: item.id,
                          checked: e.target.checked,
                        })
                      }
                      className="size-[22px] shrink-0 accent-primary"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={`text-base ${item.checked ? "text-[#9A8D80] line-through" : ""}`}
                      >
                        {item.display_name}
                      </span>
                      {item.note ? (
                        <span className="text-xs text-leftover">{item.note}</span>
                      ) : null}
                    </span>
                    {item.amount !== null || item.unit ? (
                      <span className={`text-sm ${item.checked ? "text-[#9A8D80]" : "text-muted"}`}>
                        {item.amount !== null ? formatQuantity(item.amount, item.unit) : item.unit}
                      </span>
                    ) : null}
                  </label>
                  {item.is_manual ? (
                    <button
                      type="button"
                      aria-label={`${item.display_name}を削除`}
                      onClick={() => removeManual.mutate({ planId: plan.id, itemId: item.id })}
                      className="flex size-11 items-center justify-center text-muted"
                    >
                      <svg
                        width="16"
                        height="16"
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
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <button
          type="button"
          onClick={() => rebuild.mutate(plan.id)}
          disabled={rebuild.isPending || !online}
          className="mt-2 h-10 text-sm text-muted disabled:opacity-50"
        >
          {rebuild.isPending ? "作り直しています…" : "献立からリストを作り直す(チェックは残ります)"}
        </button>
      </main>
    </div>
  );
}

function AddItemForm({
  plan,
  list,
  onDone,
}: {
  plan: Plan;
  list: ShoppingList;
  onDone: () => void;
}) {
  const categories = useCategories();
  const add = useAddManualItem();
  const [name, setName] = useState("");
  const other = categories.data?.find((c) => c.name === "その他");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !other) return;
    await add.mutateAsync({
      planId: plan.id,
      listId: list.id,
      name: name.trim(),
      categoryId: other.id,
    });
    setName("");
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex gap-2">
      <label htmlFor="manual-item" className="sr-only">
        追加する品物
      </label>
      <input
        id="manual-item"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="例:洗剤、牛乳"
        autoFocus
        className="h-11 min-w-0 flex-1 rounded-xl border border-[#D9CBB9] bg-surface px-3 text-base"
      />
      <button
        type="submit"
        disabled={!name.trim() || add.isPending}
        className="h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        追加
      </button>
    </form>
  );
}
