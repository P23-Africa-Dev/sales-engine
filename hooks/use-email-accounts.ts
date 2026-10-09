"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listEmailAccounts,
  getEmailAccount,
  connectEmailAccount,
  updateEmailAccount,
  disconnectEmailAccount,
  testEmailAccountConnection,
  refreshEmailAccountTokens,
  authorizeEmailAccountOAuth,
  type EmailAccountItem,
  type ConnectEmailAccountPayload,
  type UpdateEmailAccountPayload,
  type RefreshTokensPayload,
  type EmailAccountProvider,
} from "@/lib/api/email-accounts";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";

export const EMAIL_ACCOUNTS_KEYS = {
  all: ["email-accounts"] as const,
  list: (companyId?: number | string) => ["email-accounts", "list", companyId] as const,
  detail: (accountId: number | string, companyId?: number | string) =>
    ["email-accounts", "detail", accountId, companyId] as const,
};

export function useEmailAccounts(companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: EMAIL_ACCOUNTS_KEYS.list(companyId),
    queryFn: async (): Promise<EmailAccountItem[]> => {
      const response = await listEmailAccounts({ company_id: companyId }, token);
      // Hide removed accounts even if an older API still returns soft-status rows.
      return (response.data.items ?? []).filter((item) => item.status !== "disconnected");
    },
    enabled: hasActiveApiSession(token) && !!companyId,
    staleTime: 1000 * 30,
  });
}

export function useEmailAccount(
  accountId: number | string,
  companyId?: number | string,
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: EMAIL_ACCOUNTS_KEYS.detail(accountId, companyId),
    queryFn: async (): Promise<EmailAccountItem> => {
      const response = await getEmailAccount(accountId, { company_id: companyId }, token);
      return response.data.account;
    },
    enabled: hasActiveApiSession(token) && !!companyId && !!accountId,
    staleTime: 1000 * 30,
  });
}

export function useConnectEmailAccount() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: ConnectEmailAccountPayload) =>
      connectEmailAccount(payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMAIL_ACCOUNTS_KEYS.all });
    },
  });
}

export function useUpdateEmailAccount() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      accountId,
      payload,
    }: {
      accountId: number | string;
      payload: UpdateEmailAccountPayload;
    }) => updateEmailAccount(accountId, payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMAIL_ACCOUNTS_KEYS.all });
    },
  });
}

export function useDisconnectEmailAccount() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      accountId,
      companyId,
    }: {
      accountId: number | string;
      companyId?: number | string;
    }) => disconnectEmailAccount(accountId, { company_id: companyId }, token),
    onSuccess: (_data, variables) => {
      queryClient.setQueriesData<EmailAccountItem[]>(
        { queryKey: EMAIL_ACCOUNTS_KEYS.all },
        (current) =>
          Array.isArray(current)
            ? current.filter((item) => String(item.id) !== String(variables.accountId))
            : current,
      );
      queryClient.invalidateQueries({ queryKey: EMAIL_ACCOUNTS_KEYS.all });
    },
  });
}

export function useTestEmailAccountConnection() {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      accountId,
      companyId,
    }: {
      accountId: number | string;
      companyId?: number | string;
    }) => testEmailAccountConnection(accountId, { company_id: companyId }, token),
  });
}

export function useRefreshEmailAccountTokens() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      accountId,
      payload,
    }: {
      accountId: number | string;
      payload: RefreshTokensPayload;
    }) => refreshEmailAccountTokens(accountId, payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMAIL_ACCOUNTS_KEYS.all });
    },
  });
}

export function useAuthorizeEmailAccountOAuth() {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      provider,
      companyId,
      forceAccountPicker,
    }: {
      provider: Exclude<EmailAccountProvider, "imap_smtp">;
      companyId?: number | string;
      forceAccountPicker?: boolean;
    }) =>
      authorizeEmailAccountOAuth(
        provider,
        { company_id: companyId, force_account_picker: forceAccountPicker },
        token,
      ),
  });
}