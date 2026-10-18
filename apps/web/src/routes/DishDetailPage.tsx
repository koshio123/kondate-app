import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { FullScreenMessage } from "@/components/FullScreenMessage";
import { BackIcon, HeartIcon } from "@/components/icons";
import { formatIsoShort } from "@/lib/date";
import { formatAmount } from "@/lib/leftovers";
import { MAKE_AHEAD_MAX_DAYS } from "@/lib/makeAhead";
import { COURSE_LABEL, useRecipe, useUpdateRecipe } from "@/lib/plans";

/** S5 料理詳細 */
export function DishDetailPage() {
  const { recipeId } = useParams();
  const recipe = useRecipe(recipeId);
  if (recipe.isPending) return <FullScreenMessage>読み込み中…</FullScreenMessage>;
  if (!recipe.data) return <FullScreenMessage>料理が見つかりません</FullScreenMessage>;
  return <DishDetail recipe={recipe.data} />;
}

type Recipe = NonNullable<ReturnType<typeof useRecipe>["data"]>;

function DishDetail({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const update = useUpdateRecipe(recipe.id);
  const [note, setNote] = useState(recipe.note);
  // From a plan: "?meals=3" on the cooking day of a make-ahead dish, "?madeOn=<date>" on a later day.
  const [params] = useSearchParams();
  const batchMeals = Math.min(
    Math.max(Number(params.get("meals")) || 1, 1),
    MAKE_AHEAD_MAX_DAYS + 1,
  );
  const madeOn = params.get("madeOn");
  const [meals, setMeals] = useState(batchMeals);
  const scaled = (amount: number | null) => (amount === null ? null : amount * meals);
  const main = recipe.recipe_ingredients.filter((i) => !i.is_pantry);
  const pantry = recipe.recipe_ingredients.filter((i) => i.is_pantry);

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          aria-label="戻る"
          onClick={() => navigate(-1)}
          className="flex size-11 items-center justify-center"
        >
          <BackIcon />
        </button>
        <span className="text-sm text-muted">{COURSE_LABEL[recipe.course]}</span>
        <button
          type="button"
          aria-label={recipe.is_favorite ? "お気に入りから外す" : "お気に入りに追加"}
          aria-pressed={recipe.is_favorite}
          onClick={() => update.mutate({ is_favorite: !recipe.is_favorite })}
          className="ml-auto flex size-11 items-center justify-center text-primary"
        >
          <HeartIcon fill={recipe.is_favorite ? "currentColor" : "none"} />
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6">
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-2xl leading-snug font-bold">{recipe.title}</h1>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {recipe.cook_minutes > 0 ? (
              <span className="rounded-full border border-line bg-surface px-2.5 py-1">
                {recipe.cook_minutes}分
              </span>
            ) : null}
            <span className="rounded-full border border-line bg-surface px-2.5 py-1">
              {recipe.servings * meals}人分
            </span>
          </div>
        </div>

        {madeOn && /^\d{4}-\d{2}-\d{2}$/.test(madeOn) ? (
          <p className="rounded-2xl bg-leftover-soft px-4 py-3 text-[13px] leading-relaxed text-leftover">
            <span className="font-bold">{formatIsoShort(madeOn)}に多めに作った作り置きです。</span>
            <br />
            冷蔵(日がたつなら冷凍)で保存し、温めて食べます。作り方と材料は作る日のものです。
          </p>
        ) : null}
        {batchMeals > 1 ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-leftover-soft px-4 py-3">
            <p className="text-[13px] leading-relaxed text-leftover">
              <span className="font-bold">作り置きの分も作る日です。</span>
              材料は{batchMeals}回分の量で表示しています。
            </p>
            <div role="group" aria-label="材料の量" className="flex gap-1.5">
              {[1, batchMeals].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={meals === n}
                  onClick={() => setMeals(n)}
                  className={`h-9 rounded-full px-3.5 text-[13px] ${meals === n ? "bg-leftover font-bold text-white" : "border border-[#BFD3AE] bg-surface"}`}
                >
                  {n}回分
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {recipe.recipe_ingredients.length > 0 ? (
          <section
            aria-labelledby="ingredients-heading"
            className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface px-4 py-3.5"
          >
            <h2 id="ingredients-heading" className="font-display text-base font-bold">
              材料
            </h2>
            <ul className="flex flex-col gap-1.5 text-[15px]">
              {main.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>{i.raw_name}</span>
                  <span className="text-muted">{formatAmount(scaled(i.amount), i.unit)}</span>
                </li>
              ))}
            </ul>
            {pantry.length > 0 ? (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-dashed border-line pt-2 text-[13px] text-muted">
                {pantry.map((i) => (
                  <li key={i.id}>
                    {i.raw_name} {formatAmount(scaled(i.amount), i.unit)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {recipe.steps.length > 0 ? (
          <section aria-labelledby="steps-heading" className="flex flex-col gap-2.5">
            <h2 id="steps-heading" className="font-display text-base font-bold">
              作り方
            </h2>
            <ol className="flex flex-col gap-2.5">
              {recipe.steps.map((step, index) => (
                <li key={`${index}-${step}`} className="flex gap-3 text-[15px] leading-relaxed">
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold text-primary-strong">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section
          aria-labelledby="review-heading"
          className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface px-4 py-3.5"
        >
          <h2 id="review-heading" className="font-display text-base font-bold">
            食べた感想
          </h2>
          <div role="group" aria-label="評価" className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((value) => {
              const filled = (recipe.rating ?? 0) >= value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={`${value}つ星`}
                  aria-pressed={recipe.rating === value}
                  onClick={() => update.mutate({ rating: recipe.rating === value ? null : value })}
                  className={`flex size-10 items-center justify-center ${filled ? "text-primary" : "text-[#CDBFAE]"}`}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill={filled ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
                  </svg>
                </button>
              );
            })}
          </div>
          <label htmlFor="dish-memo" className="text-[13px] text-muted">
            メモ
          </label>
          <input
            id="dish-memo"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== recipe.note && update.mutate({ note })}
            placeholder="次はにんにくを足したい、など"
            className="h-11 rounded-xl border border-[#D9CBB9] bg-canvas px-3 text-[15px]"
          />
        </section>
      </main>
    </div>
  );
}
