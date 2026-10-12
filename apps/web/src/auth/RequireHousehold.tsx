import { useEffect } from "react";
import { Navigate, Outlet } from "react-router";
import { supabase } from "@/lib/supabase";
import { FullScreenMessage } from "@/components/FullScreenMessage";
import { useAuth } from "./AuthProvider";
import { useHousehold } from "./useHousehold";

/** Lets only signed-in, allowlisted family members through. */
export function RequireHousehold() {
  const { session, loading } = useAuth();
  const household = useHousehold();
  const notAllowed = household.isSuccess && household.data === null;

  useEffect(() => {
    if (notAllowed) void supabase.auth.signOut();
  }, [notAllowed]);

  if (loading || (session && household.isPending)) {
    return <FullScreenMessage>読み込み中…</FullScreenMessage>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (notAllowed) return <Navigate to="/login?error=not_allowed" replace />;
  if (household.isError) {
    return (
      <FullScreenMessage>
        接続できませんでした。電波の良い場所で再度開いてください。
      </FullScreenMessage>
    );
  }
  return <Outlet />;
}
