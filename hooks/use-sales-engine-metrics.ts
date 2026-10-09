"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMetrics, SalesEngineApiError } from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";

export const SALES_ENGINE_METRICS_KEYS = {
  all: ["sales-engine", "metrics"] as const,
  summary: () => ["sales-engine", "metrics", "summary"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useSalesEngineMetrics() {
  const { data: token, isLoading: isAuthLoading, error: authError } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_METRICS_KEYS.summary(),
    queryFn: async () => {
      try {
        return await fetchMetrics();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 60,
  });
}
