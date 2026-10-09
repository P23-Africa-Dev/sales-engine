"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteOutreachActivity,
  fetchOutreachActivity,
  fetchRecentOutreach,
  regenerateOutreachActivity,
  sendOutreachActivity,
  SalesEngineApiError,
  seRequest,
  type OutreachActivity,
} from "@/lib/api/sales-engine";
import { getSalesEngineOrgId } from "@/lib/sales-engine/session";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";

export const SALES_ENGINE_OUTREACH_KEYS = {
  all: ["sales-engine", "outreach"] as const,
  recent: () => ["sales-engine", "outreach", "recent"] as const,
  activity: (id: number) => ["sales-engine", "outreach", "activity", id] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useSalesEngineOutreach() {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_OUTREACH_KEYS.recent(),
    queryFn: async () => {
      try {
        return await fetchRecentOutreach();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 30,
  });
}

export function useOutreachActivity(id: number | null) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: id != null ? SALES_ENGINE_OUTREACH_KEYS.activity(id) : ["sales-engine", "outreach", "activity", "none"],
    queryFn: async () => {
      if (id == null) return null;
      try {
        return await fetchOutreachActivity(id);
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading && id != null,
    staleTime: 1000 * 15,
  });
}

export function useSendOutreachActivity() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: ({
      activityId,
      ...payload
    }: {
      activityId: number;
      to_email: string;
      subject?: string;
      body: string;
      inbox_id?: number;
    }) => sendOutreachActivity(activityId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useRegenerateOutreach() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: ({
      activityId,
      instructions,
      channel,
    }: {
      activityId: number;
      instructions?: string;
      channel?: "email" | "whatsapp";
    }) => regenerateOutreachActivity(activityId, { instructions, channel }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
      if (data.activity_id) {
        queryClient.setQueryData(SALES_ENGINE_OUTREACH_KEYS.activity(data.activity_id), data);
      }
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useDeleteOutreachActivity() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (activityId: number) => deleteOutreachActivity(activityId),
    onSuccess: (_data, activityId) => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
      queryClient.removeQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.activity(activityId) });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export type OutreachListMetrics = { total: number; deliveredCount: number; openedCount: number; clickedCount: number; failedCount: number; emailCount: number; whatsappCount: number };
export function useOutreachActivities(params: { page: number; per_page: number; search: string; channel: string; status: string; sort: string }) {
  const auth = useSalesEngineAuth();
  const query = useQuery({
    queryKey: ["sales-engine", "outreach", "list", getSalesEngineOrgId(), params],
    queryFn: () => seRequest<{ items: OutreachActivity[]; total: number; last_page: number; current_page: number; metrics: OutreachListMetrics }>({ method: "GET", path: `/outreach/activities?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}` }),
    enabled: Boolean(auth.data), staleTime: 0, refetchOnMount: "always",
  });
  return {
    ...query,
    isLoading: auth.isLoading || query.isLoading,
    isError: auth.isError || query.isError,
    error: auth.error || query.error,
  };
}
