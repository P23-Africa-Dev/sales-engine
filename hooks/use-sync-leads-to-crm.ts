"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pushLeadToCrm, syncLeadsBatch, SalesEngineApiError } from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { SALES_ENGINE_METRICS_KEYS } from "@/hooks/use-sales-engine-metrics";

export function useSyncLeadToCrm() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (vars: { leadId: number; pipeline_id?: number | string }) =>
      pushLeadToCrm(vars.leadId, { pipeline_id: vars.pipeline_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "outreach"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "pending-review"] });
    },
    onError: (error) => {
      if (error instanceof SalesEngineApiError && error.status === 401) resetAuth();
    },
  });
}

export function useSyncLeadsBatchToCrm() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (vars: number[] | { leadIds: number[]; pipeline_id?: number | string }) => {
      const leadIds = Array.isArray(vars) ? vars : vars.leadIds;
      const pipeline_id = Array.isArray(vars) ? undefined : vars.pipeline_id;
      return syncLeadsBatch(leadIds, pipeline_id != null ? { pipeline_id } : undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "outreach"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "pending-review"] });
    },
    onError: (error) => {
      if (error instanceof SalesEngineApiError && error.status === 401) resetAuth();
    },
  });
}
