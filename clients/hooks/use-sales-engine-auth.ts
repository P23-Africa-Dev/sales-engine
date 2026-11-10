"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureSalesEngineSession } from "@/lib/api/sales-engine";
import { clearSalesEngineSession, getSalesEngineOrgId, getSalesEngineToken } from "@/lib/sales-engine/session";
import { clearAuthSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";

export const SALES_ENGINE_AUTH_KEY = ["sales-engine", "session"] as const;

/**
 * Uses the native Sales Engine Sanctum token from login/register when present.
 * Missing or expired sessions require signing in to Sales Engine again.
 * React Query dedupes this across every component that calls it at once.
 */
export function useSalesEngineAuth() {
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: [...SALES_ENGINE_AUTH_KEY, userId, getSalesEngineOrgId()],
    queryFn: async (): Promise<string> => {
      if (!getSalesEngineToken()) {
        await ensureSalesEngineSession();
      }
      const token = getSalesEngineToken();
      if (!token) {
        throw new Error("Could not connect to Sales Engine.");
      }
      return token;
    },
    enabled: hasHydrated,
    staleTime: Infinity,
    retry: false,
  });
}

/** Clear native authentication after an unauthorized response. */
export function useResetSalesEngineAuth() {
  const queryClient = useQueryClient();
  return () => {
    clearSalesEngineSession();
    clearAuthSession();
    useAuthStore.getState().clearUser();
    queryClient.invalidateQueries({ queryKey: SALES_ENGINE_AUTH_KEY });
  };
}
