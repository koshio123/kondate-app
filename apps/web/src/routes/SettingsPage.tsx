import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { PageTitle } from "@/components/ScreenHeader";
import { supabase } from "@/lib/supabase";

/** S8 設定. Account section only for now; family and food settings come next. */
export function SettingsPage() {
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
    <div className="flex flex-col pb-5">
      <PageTitle>設定</PageTitle>
      <main className="flex flex-col gap-4 px-4">
        <section aria-labelledby="accounts-heading" className="flex flex-col gap-1.5">
          <h2 id="accounts-heading" className="mx-1 text-[13px] font-bold text-muted">
            ログインできるアカウント
          </h2>
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
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="mt-2 h-12 rounded-full border border-[#D9CBB9] text-[15px] text-muted"
          >
            ログアウト
          </button>
        </section>
      </main>
    </div>
  );
}
