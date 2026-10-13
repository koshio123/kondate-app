import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronRightIcon } from "@/components/icons";
import { PageTitle } from "@/components/ScreenHeader";
import { Sheet } from "@/components/Sheet";
import { toIsoDate } from "@/lib/date";
import {
  ACTIVITY_LABEL,
  type ActivityLevel,
  cleanLabel,
  describeMember,
  groupRestrictions,
  KIND_HINT,
  KIND_LABEL,
  type Member,
  QUICK_MAX,
  QUICK_MIN,
  type RestrictionGroup,
  type RestrictionKind,
  type Sex,
  SEX_LABEL,
  stepQuickMinutes,
} from "@/lib/family";
import {
  useDeleteMember,
  useDeleteRestrictions,
  useHouseholdSettings,
  useMembers,
  useRestrictions,
  useSaveMember,
  useSaveRestriction,
  useUpdateQuickMinutes,
} from "@/lib/familyQuery";
import { supabase } from "@/lib/supabase";

const AVATAR_COLORS = [
  "bg-primary-soft text-primary-strong",
  "bg-quick-soft text-[#1F4F66]",
  "bg-leftover-soft text-leftover",
  "bg-rest-soft text-rest",
];

type MemberTarget = Member | "new";
type RestrictionTarget = RestrictionGroup | "new";

/** S8 設定 */
export function SettingsPage() {
  const [memberSheet, setMemberSheet] = useState<MemberTarget | null>(null);
  const [restrictionSheet, setRestrictionSheet] = useState<RestrictionTarget | null>(null);

  return (
    <div className="flex flex-col pb-5">
      <PageTitle>設定</PageTitle>
      <main className="flex flex-col gap-[18px] px-4">
        <MembersSection onOpen={setMemberSheet} />
        <RestrictionsSection onOpen={setRestrictionSheet} />
        <ConditionsSection />
        <AccountsSection />
      </main>
      <p className="mt-4 px-5 text-xs leading-relaxed text-muted">
        家族や食べられないものの変更は、次に献立を作るとき(作り直しを含む)から反映されます。
      </p>

      {memberSheet ? (
        <MemberSheet target={memberSheet} onClose={() => setMemberSheet(null)} />
      ) : null}
      {restrictionSheet ? (
        <RestrictionSheet target={restrictionSheet} onClose={() => setRestrictionSheet(null)} />
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <h2 className="mx-1 text-[13px] font-bold text-muted">{title}</h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 食べる人
// ---------------------------------------------------------------------------

function MembersSection({ onOpen }: { onOpen: (target: MemberTarget) => void }) {
  const members = useMembers();
  const today = toIsoDate(new Date());
  return (
    <Section title="食べる人">
      <div className="flex flex-col divide-y divide-divider rounded-2xl border border-line bg-surface">
        {members.isPending ? (
          <p className="px-3.5 py-3 text-sm text-muted">読み込み中…</p>
        ) : (
          (members.data ?? []).map((member, i) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onOpen(member)}
              className="flex min-h-[60px] items-center gap-3 px-3.5 py-2 text-left"
            >
              <span
                aria-hidden="true"
                className={`flex size-9 shrink-0 items-center justify-center rounded-full font-bold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
              >
                {member.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{member.name}</span>
                <span className="text-xs text-muted">{describeMember(member, today)}</span>
              </span>
              <ChevronRightIcon size={18} className="shrink-0 text-[#B9A894]" />
            </button>
          ))
        )}
        <button
          type="button"
          onClick={() => onOpen("new")}
          className="min-h-12 text-sm font-bold text-primary"
        >
          ＋ 家族を追加
        </button>
      </div>
      <p className="mx-1 text-xs text-muted">
        献立の分量は {members.data?.length ?? "…"} 人分で作ります。
      </p>
    </Section>
  );
}

function MemberSheet({ target, onClose }: { target: MemberTarget; onClose: () => void }) {
  const isNew = target === "new";
  const members = useMembers();
  const save = useSaveMember();
  const remove = useDeleteMember();
  const [name, setName] = useState(isNew ? "" : target.name);
  const [birthDate, setBirthDate] = useState(isNew ? "" : (target.birth_date ?? ""));
  const [sex, setSex] = useState<Sex | null>(isNew ? null : target.sex);
  const [activity, setActivity] = useState<ActivityLevel>(isNew ? "normal" : target.activity_level);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isLast = (members.data?.length ?? 0) <= 1;
  const trimmed = name.trim().slice(0, 20);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    await save.mutateAsync({
      id: isNew ? undefined : target.id,
      name: trimmed,
      birth_date: birthDate || null,
      sex,
      activity_level: activity,
    });
    onClose();
  }

  async function deleteMember() {
    if (isNew) return;
    await remove.mutateAsync(target.id);
    onClose();
  }

  return (
    <Sheet title={isNew ? "家族を追加" : "家族の情報"} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <Field label="名前" htmlFor="member-name">
          <input
            id="member-name"
            type="text"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="例:Ken"
            autoFocus={isNew}
            className="h-11 rounded-xl border border-[#D9CBB9] bg-surface px-3 text-base"
          />
        </Field>
        <Field label="生年月日(任意・栄養の目安に使います)" htmlFor="member-birth">
          <input
            id="member-birth"
            type="date"
            value={birthDate}
            max={toIsoDate(new Date())}
            onChange={(e) => setBirthDate(e.target.value)}
            className="h-11 rounded-xl border border-[#D9CBB9] bg-surface px-3 text-base"
          />
        </Field>
        <Choice
          label="性別(任意)"
          options={[
            { value: null, label: "未設定" },
            { value: "male" as const, label: SEX_LABEL.male },
            { value: "female" as const, label: SEX_LABEL.female },
          ]}
          value={sex}
          onChange={setSex}
        />
        <Choice
          label="活動量"
          options={(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((value) => ({
            value,
            label: ACTIVITY_LABEL[value],
          }))}
          value={activity}
          onChange={setActivity}
        />
        {save.isError ? (
          <p role="alert" className="text-xs text-danger">
            保存できませんでした。もう一度お試しください。
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!trimmed || save.isPending}
          className="h-[52px] rounded-full bg-primary text-base font-bold text-white disabled:opacity-50"
        >
          {save.isPending ? "保存しています…" : isNew ? "追加する" : "保存する"}
        </button>
      </form>

      {!isNew ? (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          {isLast ? (
            <p className="text-center text-xs text-muted">食べる人は1人以上必要です</p>
          ) : (
            <button
              type="button"
              onClick={() => (confirmDelete ? void deleteMember() : setConfirmDelete(true))}
              disabled={remove.isPending}
              className="h-11 text-sm font-bold text-danger"
            >
              {confirmDelete
                ? `もう一度押すと削除します(${target.name}の苦手な食材も消えます)`
                : "この人を削除"}
            </button>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// 食べられないもの
// ---------------------------------------------------------------------------

function RestrictionsSection({ onOpen }: { onOpen: (target: RestrictionTarget) => void }) {
  const members = useMembers();
  const restrictions = useRestrictions();
  const groups = groupRestrictions(restrictions.data ?? [], members.data ?? []);
  const allergies = groups.filter((g) => g.kind === "allergy");
  const dislikes = groups.filter((g) => g.kind !== "allergy");
  const showNames = (members.data?.length ?? 0) > 1;
  const everyone = members.data?.length ?? 0;

  const chips = (list: RestrictionGroup[], empty: string) =>
    list.length === 0 ? (
      <span className="text-[13px] text-muted">{empty}</span>
    ) : (
      <ul className="flex flex-wrap gap-1.5">
        {list.map((g) => (
          <li key={g.label}>
            <button
              type="button"
              onClick={() => onOpen(g)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] ${g.kind === "avoid" ? "border border-[#B9A894]" : "bg-ink text-white"}`}
            >
              {g.label}
              <span className={`text-[11px] ${g.kind === "avoid" ? "text-muted" : "opacity-85"}`}>
                {g.kind === "allergy" ? "" : KIND_LABEL[g.kind]}
                {showNames && g.members.length < everyone
                  ? `${g.kind === "allergy" ? "" : "・"}${g.members.map((m) => m.name).join("、")}`
                  : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <Section title="食べられないもの">
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">アレルギー</span>
            <span className="text-xs text-muted">必ず除外</span>
          </div>
          {chips(allergies, "登録なし")}
        </div>
        <div className="h-px bg-divider" />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold">苦手な食材</span>
          {chips(dislikes, "登録なし")}
        </div>
        <button
          type="button"
          onClick={() => onOpen("new")}
          className="h-10 self-start rounded-full border border-dashed border-[#B9A894] px-3.5 text-sm"
        >
          ＋ 食材を追加
        </button>
      </div>
    </Section>
  );
}

function RestrictionSheet({ target, onClose }: { target: RestrictionTarget; onClose: () => void }) {
  const isNew = target === "new";
  const members = useMembers();
  const restrictions = useRestrictions();
  const save = useSaveRestriction();
  const remove = useDeleteRestrictions();
  const allIds = (members.data ?? []).map((m) => m.id);

  const [label, setLabel] = useState(isNew ? "" : target.label);
  const [kind, setKind] = useState<RestrictionKind>(isNew ? "never" : target.kind);
  // null until changed: everyone for a new food (members may still be loading).
  const [memberIds, setMemberIds] = useState<string[] | null>(
    isNew ? null : target.members.map((m) => m.id),
  );
  const cleaned = cleanLabel(label);
  const selected = memberIds ?? allIds;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cleaned || selected.length === 0) return;
    const previous = isNew
      ? []
      : (restrictions.data ?? []).filter((r) => target.ids.includes(r.id));
    await save.mutateAsync({ label: cleaned, kind, memberIds: selected, previous });
    onClose();
  }

  async function deleteGroup() {
    if (isNew) return;
    await remove.mutateAsync(target.ids);
    onClose();
  }

  const toggleMember = (id: string) =>
    setMemberIds(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Sheet title={isNew ? "食べられないものを追加" : target.label} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        {isNew ? (
          <Field label="食材" htmlFor="restriction-label">
            <input
              id="restriction-label"
              type="text"
              value={label}
              maxLength={40}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例:セロリ、えび、そば"
              autoFocus
              className="h-11 rounded-xl border border-[#D9CBB9] bg-surface px-3 text-base"
            />
          </Field>
        ) : null}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-bold">どのくらい避けるか</legend>
          {(Object.keys(KIND_LABEL) as RestrictionKind[]).map((value) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${kind === value ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}
            >
              <input
                type="radio"
                name="restriction-kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="size-[18px] accent-primary"
              />
              <span className="flex flex-col">
                <span className="text-[15px] font-bold">{KIND_LABEL[value]}</span>
                <span className="text-xs text-muted">{KIND_HINT[value]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {(members.data?.length ?? 0) > 1 ? (
          <div role="group" aria-label="誰が" className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold">誰が</span>
            <div className="flex flex-wrap gap-1.5">
              {(members.data ?? []).map((m) => {
                const on = selected.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleMember(m.id)}
                    className={`h-9 rounded-full px-3.5 text-[13px] ${on ? "bg-ink font-bold text-white" : "border border-[#D9CBB9] bg-surface"}`}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              家族は同じ献立を食べるので、誰か1人でも当てはまれば献立から外します。
            </p>
          </div>
        ) : null}

        {save.isError ? (
          <p role="alert" className="text-xs text-danger">
            保存できませんでした。もう一度お試しください。
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!cleaned || selected.length === 0 || save.isPending}
          className="h-[52px] rounded-full bg-primary text-base font-bold text-white disabled:opacity-50"
        >
          {save.isPending ? "保存しています…" : isNew ? "追加する" : "保存する"}
        </button>
      </form>
      {!isNew ? (
        <button
          type="button"
          onClick={() => void deleteGroup()}
          disabled={remove.isPending}
          className="h-11 border-t border-line pt-1 text-sm font-bold text-danger"
        >
          「{target.label}」を削除
        </button>
      ) : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// 献立の条件
// ---------------------------------------------------------------------------

function ConditionsSection() {
  const settings = useHouseholdSettings();
  const update = useUpdateQuickMinutes();
  const minutes = settings.data?.quick_mode_max_minutes ?? 15;
  const ratio = settings.data?.dinner_ratio ?? 1 / 3;

  return (
    <Section title="献立の条件">
      <div className="flex flex-col divide-y divide-divider rounded-2xl border border-line bg-surface">
        <div className="flex min-h-[60px] items-center gap-3 py-2 pr-2 pl-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px]">時短の日の調理時間</span>
            <span className="text-xs text-muted">この時間以内の献立にします</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="5分短くする"
              onClick={() => update.mutate(stepQuickMinutes(minutes, -1))}
              disabled={!settings.data || minutes <= QUICK_MIN}
              className="size-10 rounded-full border border-[#D9CBB9] bg-surface text-lg disabled:opacity-40"
            >
              −
            </button>
            <span aria-live="polite" className="w-[52px] text-center text-base font-bold">
              {minutes}分
            </span>
            <button
              type="button"
              aria-label="5分長くする"
              onClick={() => update.mutate(stepQuickMinutes(minutes, 1))}
              disabled={!settings.data || minutes >= QUICK_MAX}
              className="size-10 rounded-full border border-[#D9CBB9] bg-surface text-lg disabled:opacity-40"
            >
              ＋
            </button>
          </div>
        </div>
        <div className="flex min-h-[60px] items-center gap-3 px-3.5 py-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px]">夕食の割合</span>
            <span className="text-xs text-muted">
              1日の栄養の目安のうち夕食でとる割合(仮定・栄養機能で使います)
            </span>
          </div>
          <span className="text-base font-bold">
            {Math.abs(ratio - 1 / 3) < 0.01 ? "1/3" : `${Math.round(ratio * 100)}%`}
          </span>
        </div>
      </div>
      {update.isError ? (
        <p role="alert" className="mx-1 text-xs text-danger">
          保存できませんでした。もう一度お試しください。
        </p>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// ログインできるアカウント
// ---------------------------------------------------------------------------

function AccountsSection() {
  const { session } = useAuth();
  const myEmail = session?.user.email?.toLowerCase();
  const accounts = useQuery({
    queryKey: ["household_members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_members")
        .select("id, email, display_name")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  return (
    <Section title="ログインできるアカウント">
      <ul className="divide-y divide-divider rounded-2xl border border-line bg-surface">
        {(accounts.data ?? []).map((account) => (
          <li key={account.id} className="flex min-h-12 items-center gap-2 px-3.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{account.email}</span>
            {account.email === myEmail ? (
              <span className="text-xs text-muted">ログイン中</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mx-1 text-xs text-muted">アカウントの追加は管理者が Supabase で行います。</p>
      <button
        type="button"
        onClick={() => void supabase.auth.signOut()}
        className="mt-2 h-12 rounded-full border border-[#D9CBB9] text-[15px] text-muted"
      >
        ログアウト
      </button>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Form parts
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

function Choice<T extends string | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold">{label}</span>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-[#F5EEE5] p-1">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(option.value)}
              className={`h-10 rounded-full text-sm font-bold ${on ? "bg-ink text-white" : "text-muted"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
