"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authenticateOutreachDomain,
  deleteOutreachDomain,
  fetchOutreachDomain,
  recheckOutreachDomainIntegrity,
  SalesEngineApiError,
  verifyOutreachDomain,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { SALES_ENGINE_OUTREACH_SENDER_KEYS } from "@/hooks/use-sales-engine-outreach-sender";

export const SALES_ENGINE_OUTREACH_DOMAIN_KEYS = {
  all: ["sales-engine", "outreach", "domain"] as const,
  detail: () => ["sales-engine", "outreach", "domain", "detail"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useOutreachDomain(enabled = true) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_OUTREACH_DOMAIN_KEYS.detail(),
    queryFn: async () => {
      try {
        return await fetchOutreachDomain();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: enabled && Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 30,
    refetchInterval: (query) =>
      query.state.data?.verification_status === "pending" ? 1000 * 15 : false,
  });
}

export function useAuthenticateOutreachDomain() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (payload: { domain: string; from_email: string }) =>
      authenticateOutreachDomain(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_DOMAIN_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useVerifyOutreachDomain() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: () => verifyOutreachDomain(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_DOMAIN_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useRecheckOutreachDomainIntegrity() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: () => recheckOutreachDomainIntegrity(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_DOMAIN_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useResetOutreachDomain() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: () => deleteOutreachDomain(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_DOMAIN_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}
