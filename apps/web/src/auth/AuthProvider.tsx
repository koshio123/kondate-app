import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  /** True until the initial session (including an OAuth code exchange) has been resolved. */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, loading: false });
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Cached household data (also persisted for offline use) must not outlive the session.
      if (event === "SIGNED_OUT") queryClient.clear();
      if (active) setState({ session, loading: false });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  return useContext(AuthContext);
}
