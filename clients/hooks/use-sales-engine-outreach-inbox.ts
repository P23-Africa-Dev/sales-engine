"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmOutreachInbox,
  createOutreachInbox,
  createOutreachSetupRequest,
  deleteOutreachInbox,
  fetchOutreachInboxes,
  resendOutreachInboxConfirmation,
  SalesEngineApiError,
  setDefaultOutreachInbox,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { SALES_ENGINE_OUTREACH_SENDER_KEYS } from "@/hooks/use-sales-engine-outreach-sender";

export const SALES_ENGINE_OUTREACH_INBOX_KEYS = {
  all: ["sales-engine", "outreach", "inboxes"] as const,
  list: () => ["sales-engine", "outreach", "inboxes", "list"] as const,
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

export function useOutreachInboxes(enabled = true) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_OUTREACH_INBOX_KEYS.list(),
    queryFn: async () => {
      try {
        return await fetchOutreachInboxes();
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: enabled && Boolean(token) && !isAuthLoading,
    staleTime: 1000 * 30,
  });
}

function invalidateInboxQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_INBOX_KEYS.all });
  queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
}

export function useCreateOutreachInbox() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: createOutreachInbox,
    onSuccess: () => invalidateInboxQueries(queryClient),
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useConfirmOutreachInbox() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: ({ id, code }: { id: number; code: string }) => confirmOutreachInbox(id, code),
    onSuccess: () => invalidateInboxQueries(queryClient),
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useResendOutreachInboxConfirmation() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (id: number) => resendOutreachInboxConfirmation(id),
    onSuccess: () => invalidateInboxQueries(queryClient),
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useSetDefaultOutreachInbox() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (id: number) => setDefaultOutreachInbox(id),
    onSuccess: () => invalidateInboxQueries(queryClient),
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useDeleteOutreachInbox() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (id: number) => deleteOutreachInbox(id),
    onSuccess: () => invalidateInboxQueries(queryClient),
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useCreateOutreachSetupRequest() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: createOutreachSetupRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_SENDER_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}
