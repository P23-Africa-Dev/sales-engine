"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCreditTopupCheckout,
  getMapCredits,
  getMapCreditTransactions,
} from "@/lib/api/map-credits";

export const MAP_CREDIT_KEYS = {
  all: ["map-credits"] as const,
  snapshot: (companyId?: number | string) => ["map-credits", companyId ?? null] as const,
  transactions: (companyId?: number | string, page?: number) =>
    ["map-credit-transactions", companyId ?? null, page ?? 1] as const,
};

export function useMapCredits(
  companyId?: number | string,
  options?: { enabled?: boolean; refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: MAP_CREDIT_KEYS.snapshot(companyId),
    queryFn: async () => (await getMapCredits(companyId)).data,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval ?? 60_000,
    staleTime: 15_000,
  });
}

export function useMapCreditTransactions(companyId?: number | string, page = 1) {
  return useQuery({
    queryKey: MAP_CREDIT_KEYS.transactions(companyId, page),
    queryFn: async () => (await getMapCreditTransactions(companyId, page)).data,
  });
}

export function useCreditTopupCheckout(companyId?: number | string) {
  return useMutation({
    mutationFn: (amountUsd: number) => createCreditTopupCheckout(amountUsd, companyId),
  });
}

/** Invalidate cached credit data (call after a successful top-up return). */
export function useRefreshMapCredits() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: MAP_CREDIT_KEYS.all });
}
