"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type EmailAccountProvider = "google" | "microsoft" | "zoho" | "imap_smtp";

export type EmailAccountStatus = "active" | "error" | "disconnected" | "expired";

export type EmailAccountItem = {
  id: number;
  provider: EmailAccountProvider;
  email: string;
  display_name: string | null;
  is_default: boolean;
  status: EmailAccountStatus;
  scopes: string[] | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_encryption: string | null;
  smtp_username: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_encryption: string | null;
  imap_username: string | null;
  last_synced_at: string | null;
  last_error_message: string | null;
  last_error_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ConnectEmailAccountPayload = {
  provider: EmailAccountProvider;
  email: string;
  display_name?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  scopes?: string[] | null;
  is_default?: boolean;
  company_id?: number | string;
  // IMAP/SMTP fields
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_encryption?: string | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
  imap_host?: string | null;
  imap_port?: number | null;
  imap_encryption?: string | null;
  imap_username?: string | null;
  imap_password?: string | null;
};

export type UpdateEmailAccountPayload = {
  display_name?: string | null;
  is_default?: boolean;
  company_id?: number | string;
  email?: string;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_encryption?: string | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
  imap_host?: string | null;
  imap_port?: number | null;
  imap_encryption?: string | null;
  imap_username?: string | null;
  imap_password?: string | null;
};

export type EmailAccountConnectionCheck = {
  ok: boolean;
  code: string;
  message: string;
  fix?: string | null;
};

export type EmailAccountConnectionTest = {
  ran: boolean;
  ok?: boolean;
  message?: string;
  smtp?: EmailAccountConnectionCheck | null;
  imap?: EmailAccountConnectionCheck | null;
};

export type RefreshTokensPayload = {
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  company_id?: number | string;
};

function emailAccountsPath(suffix: string): string {
  return `/email-accounts${suffix}`;
}

export function listEmailAccounts(
  params: { company_id?: number | string },
  token: string,
): Promise<ApiEnvelope<{ items: EmailAccountItem[] }>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest({
    method: "GET",
    path: emailAccountsPath(`${query}`),
    token,
  });
}

export function getEmailAccount(
  accountId: number | string,
  params: { company_id?: number | string },
  token: string,
): Promise<ApiEnvelope<{ account: EmailAccountItem }>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest({
    method: "GET",
    path: emailAccountsPath(`/${accountId}${query}`),
    token,
  });
}

export function connectEmailAccount(
  payload: ConnectEmailAccountPayload,
  token: string,
): Promise<
  ApiEnvelope<{ account: EmailAccountItem; connection_test?: EmailAccountConnectionTest | null }>
> {
  return apiRequest({
    method: "POST",
    path: emailAccountsPath(""),
    body: payload,
    token,
  });
}

export function updateEmailAccount(
  accountId: number | string,
  payload: UpdateEmailAccountPayload,
  token: string,
): Promise<
  ApiEnvelope<{ account: EmailAccountItem; connection_test?: EmailAccountConnectionTest | null }>
> {
  return apiRequest({
    method: "PATCH",
    path: emailAccountsPath(`/${accountId}`),
    body: payload,
    token,
  });
}

export function disconnectEmailAccount(
  accountId: number | string,
  params: { company_id?: number | string },
  token: string,
): Promise<ApiEnvelope<null>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest({
    method: "DELETE",
    path: emailAccountsPath(`/${accountId}${query}`),
    token,
  });
}

export function testEmailAccountConnection(
  accountId: number | string,
  params: { company_id?: number | string },
  token: string,
): Promise<ApiEnvelope<null>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest({
    method: "POST",
    path: emailAccountsPath(`/${accountId}/test${query}`),
    token,
  });
}

export function refreshEmailAccountTokens(
  accountId: number | string,
  payload: RefreshTokensPayload,
  token: string,
): Promise<ApiEnvelope<{ account: EmailAccountItem }>> {
  return apiRequest({
    method: "POST",
    path: emailAccountsPath(`/${accountId}/refresh`),
    body: payload,
    token,
  });
}

export function authorizeEmailAccountOAuth(
  provider: Exclude<EmailAccountProvider, "imap_smtp">,
  params: { company_id?: number | string; force_account_picker?: boolean },
  token: string,
): Promise<ApiEnvelope<{ authorization_url: string; expires_in_seconds: number }>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.force_account_picker) qs.set("force_account_picker", "1");
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest({
    method: "GET",
    path: emailAccountsPath(`/oauth/${provider}/authorize${query}`),
    token,
  });
}