import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "@/auth/AuthProvider";
import { AlertIcon, AppMark, GoogleIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "家族として登録されていないアカウントです。別のアカウントでログインしてください。",
  callback: "ログインを完了できませんでした。もう一度お試しください。",
};

/** S0 ログイン */
export function LoginPage() {
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  const errorKey = params.get("error");
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  if (!loading && session && !errorKey) return <Navigate to="/" replace />;

  async function signInWithGoogle() {
    setPending(true);
    setRequestError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setRequestError("Google に接続できませんでした。もう一度お試しください。");
      setPending(false);
    }
  }

  const message = requestError ?? (errorKey ? ERROR_MESSAGES[errorKey] : undefined);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-10 px-8 py-10">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-28 items-center justify-center rounded-[36px] bg-primary-soft text-primary">
          <AppMark />
        </div>
        <h1 className="font-display text-[32px] font-bold tracking-wider">こんだて</h1>
        <p className="text-center text-[15px] leading-relaxed text-muted">
          献立づくりと買い物を、
          <br />
          ふたりでもっと楽に。
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-3.5">
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={pending}
          className="flex h-[54px] w-full items-center justify-center gap-3 rounded-full border border-[#D9CBB9] bg-surface text-base font-bold disabled:opacity-60"
        >
          <GoogleIcon />
          Google でログイン
        </button>
        <p className="text-center text-xs leading-relaxed text-muted">
          登録された家族のアカウントだけが利用できます
        </p>
      </div>

      {message ? (
        <div
          role="alert"
          className="flex w-full items-start gap-2.5 rounded-2xl border border-[#EBC3B6] bg-danger-soft px-3.5 py-3 text-danger"
        >
          <AlertIcon size={20} className="mt-px shrink-0" />
          <p className="text-[13px] leading-relaxed">{message}</p>
        </div>
      ) : null}

      {import.meta.env.DEV ? <DevMagicLink /> : null}
    </main>
  );
}

/**
 * Local development only: sign in with an email magic link (open the local mail viewer at
 * http://127.0.0.1:54324 to click it), so Google OAuth is not needed locally.
 */
function DevMagicLink() {
  const [email, setEmail] = useState("ken@example.com");
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSent(!error);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-2 border-t border-dashed border-line pt-4"
    >
      <label htmlFor="dev-email" className="text-xs text-muted">
        開発用: メールでログイン
      </label>
      <div className="flex gap-2">
        <input
          id="dev-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base"
        />
        <button type="submit" className="h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white">
          送信
        </button>
      </div>
      {sent ? (
        <p className="text-xs text-leftover">
          ローカルのメール画面 (127.0.0.1:54324) を確認してください
        </p>
      ) : null}
    </form>
  );
}
