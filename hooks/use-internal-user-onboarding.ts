"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getInternalUsersOnboardingStatus,
  listInternalUsers,
  resendInternalUserInvite,
  type ListInternalUsersParams,
} from "@/lib/api/internal-users";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";

export const INTERNAL_ONBOARDING_KEYS = {
  all: ["internal-onboarding"] as const,
  users: (params: ListInternalUsersParams) =>
    ["internal-onboarding", "users", params] as const,
  status: (companyId?: number | string) =>
    ["internal-onboarding", "status", companyId ?? "default"] as const,
};

export function useInternalUsersList(params: ListInternalUsersParams = {}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: INTERNAL_ONBOARDING_KEYS.users(params),
    queryFn: async () => (await listInternalUsers(params, token)).data,
    enabled: hasActiveApiSession(token),
  });
}

export function useInternalOnboardingStatus(companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: INTERNAL_ONBOARDING_KEYS.status(companyId),
    queryFn: async () =>
      (await getInternalUsersOnboardingStatus({ company_id: companyId }, token)).data,
    enabled: hasActiveApiSession(token),
  });
}

export function useResendInternalInvite() {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      companyId,
    }: {
      userId: number | string;
      companyId?: number | string;
    }) => resendInternalUserInvite(userId, { company_id: companyId }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INTERNAL_ONBOARDING_KEYS.all });
    },
  });
}
