"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteInternalUser,
  listInternalUserAuditLogs,
  reactivateInternalUser,
  suspendInternalUser,
  type InternalUserLifecyclePayload,
  type PaginatedAuditLogsData,
  type SuspendInternalUserPayload,
} from "@/lib/api/internal-users";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";

export function useSuspendInternalUser() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number | string; payload: SuspendInternalUserPayload }) =>
      suspendInternalUser(userId, payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal-users"] });
      queryClient.invalidateQueries({ queryKey: ["internal-user-audit-logs"] });
    },
  });
}

export function useReactivateInternalUser() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number | string; payload: InternalUserLifecyclePayload }) =>
      reactivateInternalUser(userId, payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal-users"] });
      queryClient.invalidateQueries({ queryKey: ["internal-user-audit-logs"] });
    },
  });
}

export function useDeleteInternalUser() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number | string; payload: InternalUserLifecyclePayload }) =>
      deleteInternalUser(userId, payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal-users"] });
      queryClient.invalidateQueries({ queryKey: ["internal-user-audit-logs"] });
    },
  });
}

export function useInternalUserAuditLogs(
  companyId?: number | string,
  page = 1,
  perPage = 20,
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ["internal-user-audit-logs", companyId, page, perPage] as const,
    queryFn: async (): Promise<PaginatedAuditLogsData> => {
      const res = await listInternalUserAuditLogs(
        { company_id: companyId, page, per_page: perPage },
        token,
      );
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!companyId,
    staleTime: 1000 * 60,
  });
}
