"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchOutreachSenderSettings,
  SalesEngineApiError,
  updateOutreachSenderSettings,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";

export const SALES_ENGINE_OUTREACH_SENDER_KEYS = {
  all: ["sales-engine", "outreach", "sender-settings"] as const,
  detail: () => ["sales-engine", "outreach", "sender-settings", "detail"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useOutreachSenderSettings(enabled = true) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.detail(),
    queryFn: async () => {
      try {
        return await fetchOutreachSenderSettings();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: enabled && Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 60,
  });
}

export function useUpdateOutreachSenderSettings() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (payload: {
      sender_mode?: "platform" | "organization";
      default_inbox_id?: number | null;
      reply_to_email?: string | null;
    }) => updateOutreachSenderSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}
