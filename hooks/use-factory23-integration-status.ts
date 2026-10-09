"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchFactory23IntegrationStatusWithAutoEnsure } from "@/lib/api/sales-engine";
import { useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";

export const FACTORY23_INTEGRATION_STATUS_KEY = ["sales-engine", "factory23-integration-status"] as const;

export function useFactory23IntegrationStatus() {
  const auth = useSalesEngineAuth();

  return useQuery({
    queryKey: FACTORY23_INTEGRATION_STATUS_KEY,
    queryFn: fetchFactory23IntegrationStatusWithAutoEnsure,
    staleTime: 60_000,
    retry: 1,
    enabled: auth.isSuccess,
  });
}
