"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SalesEngineApiError } from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import {
  activateIcpProfile,
  createIcpProfile,
  deleteIcpProfile,
  duplicateIcpProfile,
  fetchIcpProfiles,
  suggestIcpSearchBrief,
  updateIcpProfile,
  type IcpProfilePayload,
  type IcpSearchBriefSuggestMode,
  type IcpSearchBriefSuggestResult,
} from "@/lib/api/sales-engine";
import type { IcpProfile } from "@/components/sales-engine/icp-builder-modal";

export const SALES_ENGINE_ICP_KEYS = {
  all: ["sales-engine", "icp-profiles"] as const,
  list: () => ["sales-engine", "icp-profiles", "list"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useIcpProfiles() {
  const { data: token, isLoading: isAuthLoading, error: authError } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  const query = useQuery({
    queryKey: SALES_ENGINE_ICP_KEYS.list(),
    queryFn: async (): Promise<IcpProfile[]> => {
      try {
        return await fetchIcpProfiles();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 60,
  });

  return { ...query, isAuthLoading, authError };
}

/** Derives the active profile from the already-fetched list — no extra network call. */
export function useActiveIcpProfile() {
  const { data: profiles, isLoading, isAuthLoading, authError } = useIcpProfiles();
  const data = useMemo(() => profiles?.find((p) => p.isActive) ?? null, [profiles]);
  return { data, isLoading, isAuthLoading, authError };
}

type MutationOptions<TData> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: unknown) => void;
};

function useIcpMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: MutationOptions<TData>
) {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ICP_KEYS.all });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
      options?.onError?.(error);
    },
  });
}

export function useCreateIcpProfile(options?: MutationOptions<IcpProfile>) {
  return useIcpMutation<IcpProfilePayload, IcpProfile>((payload) => createIcpProfile(payload), options);
}

export function useUpdateIcpProfile(options?: MutationOptions<IcpProfile>) {
  return useIcpMutation<{ id: string; payload: Partial<IcpProfilePayload> }, IcpProfile>(
    ({ id, payload }) => updateIcpProfile(id, payload),
    options
  );
}

export function useDeleteIcpProfile(options?: MutationOptions<null>) {
  return useIcpMutation<string, null>((id) => deleteIcpProfile(id), options);
}

export function useActivateIcpProfile(options?: MutationOptions<IcpProfile>) {
  return useIcpMutation<string, IcpProfile>((id) => activateIcpProfile(id), options);
}

export function useDuplicateIcpProfile(options?: MutationOptions<IcpProfile>) {
  return useIcpMutation<string, IcpProfile>((id) => duplicateIcpProfile(id), options);
}

export function useSuggestIcpSearchBrief(
  options?: MutationOptions<IcpSearchBriefSuggestResult>
) {
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (payload: {
      mode?: IcpSearchBriefSuggestMode;
      profileName?: string;
      customPrompt?: string;
      description?: string;
      industries?: string[];
      territories?: string[];
      decisionMakers?: string[];
      companySizes?: string[];
      minMatchScore?: number;
    }) => suggestIcpSearchBrief(payload),
    onSuccess: (data) => options?.onSuccess?.(data),
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
      options?.onError?.(error);
    },
  });
}
