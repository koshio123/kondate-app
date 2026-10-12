import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "@/auth/AuthProvider";
import { FullScreenMessage } from "@/components/FullScreenMessage";

/**
 * OAuth / magic link return URL. supabase-js exchanges the `code` in the URL for a session
 * on startup (detectSessionInUrl + PKCE); this page only waits for that and moves on.
 */
export function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const [params] = useSearchParams();

  if (params.get("error")) return <Navigate to="/login?error=callback" replace />;
  if (loading) return <FullScreenMessage>ログインしています…</FullScreenMessage>;
  return <Navigate to={session ? "/" : "/login?error=callback"} replace />;
}
