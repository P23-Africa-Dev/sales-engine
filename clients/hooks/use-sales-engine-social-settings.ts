"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSocialListeningSettings,
  SalesEngineApiError,
  updateSocialListeningSettings,
  type SocialListeningSettings,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { useActiveIcpProfile } from "@/hooks/use-sales-engine-icp";

export const SALES_ENGINE_SOCIAL_SETTINGS_KEYS = {
  all: ["sales-engine", "social-listening", "settings"] as const,
  detail: (icpId: string | undefined) =>
    ["sales-engine", "social-listening", "settings", icpId] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useSocialListeningSettings(enabled = true) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const { data: activeIcp } = useActiveIcpProfile();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_SOCIAL_SETTINGS_KEYS.detail(activeIcp?.id),
    queryFn: async () => {
      try {
        return await fetchSocialListeningSettings();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: enabled && Boolean(token) && !isAuthLoading && Boolean(activeIcp?.id),
    staleTime: 1000 * 60,
  });
}

export function useUpdateSocialListeningSettings() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (payload: Partial<SocialListeningSettings>) => updateSocialListeningSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_SETTINGS_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}
