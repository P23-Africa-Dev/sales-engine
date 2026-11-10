"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPendingReviewLeads,
  SalesEngineApiError,
  type ChatLead,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { SALES_ENGINE_METRICS_KEYS } from "@/hooks/use-sales-engine-metrics";
import { SALES_ENGINE_CHAT_KEYS } from "@/hooks/use-sales-engine-chat";

export const SALES_ENGINE_PENDING_LEADS_KEYS = {
  all: ["sales-engine", "pending-leads"] as const,
  list: (icpId?: string) => ["sales-engine", "pending-leads", "list", icpId ?? "all"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function usePendingReviewLeads(icpProfileId?: string) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();
  const queryClient = useQueryClient();

  const queryKey = SALES_ENGINE_PENDING_LEADS_KEYS.list(icpProfileId);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ChatLead[]> => {
      try {
        return await fetchPendingReviewLeads(icpProfileId);
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const removeLeadLocally = (leadId: number) => {
    // Optimistically remove from current list
    queryClient.setQueryData<ChatLead[]>(queryKey, (old) =>
      old ? old.filter((lead) => lead.id !== leadId) : []
    );
    // Also remove from "all" list if this was scoped
    if (icpProfileId && icpProfileId !== "all") {
      queryClient.setQueryData<ChatLead[]>(
        SALES_ENGINE_PENDING_LEADS_KEYS.list("all"),
        (old) => (old ? old.filter((lead) => lead.id !== leadId) : [])
      );
    }
  };

  const removeLeadsLocally = (leadIds: number[]) => {
    const idSet = new Set(leadIds);
    queryClient.setQueryData<ChatLead[]>(queryKey, (old) =>
      old ? old.filter((lead) => !idSet.has(lead.id)) : []
    );
    if (icpProfileId && icpProfileId !== "all") {
      queryClient.setQueryData<ChatLead[]>(
        SALES_ENGINE_PENDING_LEADS_KEYS.list("all"),
        (old) => (old ? old.filter((lead) => !idSet.has(lead.id)) : [])
      );
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: SALES_ENGINE_PENDING_LEADS_KEYS.all });
    queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
    queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.all });
  };

  return {
    ...query,
    removeLeadLocally,
    removeLeadsLocally,
    invalidateAll,
  };
}
