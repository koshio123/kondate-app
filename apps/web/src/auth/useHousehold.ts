import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

/**
 * The signed-in user's household id, or null when the account is not on the allowlist
 * (household_members). Resolved by the database so it matches what RLS enforces.
 */
export function useHousehold() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ["household", userId],
    enabled: Boolean(userId),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_household_id");
      if (error) throw error;
      return data ?? null;
    },
  });
}
