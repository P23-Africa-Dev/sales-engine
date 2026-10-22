import { setAuthSession } from "@/lib/auth/session";
import { SALES_ENGINE_API_BASE_URL } from "@/lib/api/sales-engine";
import { getSalesEngineOrgId, getSalesEngineToken, setSalesEngineSession, SALES_ENGINE_TOKEN_KEY } from "@/lib/sales-engine/session";

export type SalesEngineAuthUser = {
  id: number;
  name: string;
  email: string;
  email_verified?: boolean;
  avatar_url?: string | null;
  organization_role?: string;
};

export type SalesEngineAuthOrganization = {
  id: number;
  name: string;
  slug?: string;
  country?: string | null;
  team_size?: string | null;
  purpose?: string | null;
  user_type?: string | null;
  onboarding_completed?: boolean;
  role?: string;
};

export type SalesEngineMe = {
  user: SalesEngineAuthUser;
  organizations: SalesEngineAuthOrganization[];
  current_organization: SalesEngineAuthOrganization | null;
  onboarding_completed: boolean;
};

export type SalesEngineMember = {
  id: number;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
  role: string;
  joined_at?: string | null;
};

export type SalesEngineInvitation = {
  id: number;
  email: string;
  role: string;
  expires_at?: string | null;
  accepted_at?: string | null;
  revoked_at?: string | null;
};

export type SalesEngineAuthSession = {
  token: string;
  token_type: string;
  user: SalesEngineAuthUser;
  organization: SalesEngineAuthOrganization | null;
};

export class SalesEngineAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message || `Sales Engine request failed (${response.status})`;
}

function persistSession(session: SalesEngineAuthSession) {
  setAuthSession(session.token, true);
  if (typeof localStorage === "undefined") return;
  if (session.organization?.id != null) {
    setSalesEngineSession(session.token, session.organization.id);
    return;
  }
  localStorage.setItem(SALES_ENGINE_TOKEN_KEY, session.token);
}

export async function loginWithSalesEngine(payload: {
  email: string;
  password: string;
}): Promise<SalesEngineAuthSession> {
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new SalesEngineAuthError(await readError(response), response.status);
  }
  const session = (await response.json()) as SalesEngineAuthSession;
  persistSession(session);
  return session;
}

export async function registerWithSalesEngine(payload: {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  organization_name?: string;
}): Promise<SalesEngineAuthSession> {
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new SalesEngineAuthError(await readError(response), response.status);
  }
  const session = (await response.json()) as SalesEngineAuthSession;
  persistSession(session);
  return session;
}

export async function logoutFromSalesEngine(token: string): Promise<void> {
  const orgId = getSalesEngineOrgId();
  await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/logout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(orgId ? { "X-Organization-Id": orgId } : {}),
    },
  }).catch(() => undefined);
}

function authHeaders(token: string, json = false): HeadersInit {
  const orgId = getSalesEngineOrgId();
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(orgId ? { "X-Organization-Id": orgId } : {}),
  };
}

async function publicRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}${path}`, {
    method: body === undefined && path.includes("?") ? "GET" : body === undefined ? "GET" : "POST",
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as ({ message?: string } & T) | null;
  if (!response.ok) {
    throw new SalesEngineAuthError(payload?.message || `Sales Engine request failed (${response.status})`, response.status);
  }
  return (payload ?? {}) as T;
}

function asList<T>(value: T[] | { data?: T[] } | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value?.data ?? [];
}

export async function fetchSalesEngineMe(token: string): Promise<SalesEngineAuthUser> {
  const account = await fetchSalesEngineAccount(token);
  return account.user;
}

export async function fetchSalesEngineAccount(token: string): Promise<SalesEngineMe> {
  const orgId = getSalesEngineOrgId();
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new SalesEngineAuthError(await readError(response), response.status);
  }
  const payload = (await response.json()) as {
    user: SalesEngineAuthUser;
    organizations?: SalesEngineAuthOrganization[] | { data?: SalesEngineAuthOrganization[] };
    current_organization?: SalesEngineAuthOrganization | null;
    onboarding_completed?: boolean;
  };
  const organizations = asList(payload.organizations);
  const stored = getSalesEngineToken();
  if (!stored && orgId) {
    setSalesEngineSession(token, orgId);
  }
  const current = payload.current_organization ?? null;
  const organization = organizations.find((org) => org.id === (current?.id ?? Number(orgId)));
  return {
    user: { ...payload.user, organization_role: organization?.role },
    organizations,
    current_organization: current,
    onboarding_completed: Boolean(payload.onboarding_completed ?? current?.onboarding_completed),
  };
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return publicRequest("/auth/forgot-password", { email });
}

export function validatePasswordResetToken(token: string, email: string): Promise<{ data: { valid: boolean } }> {
  return publicRequest(`/auth/reset-password/${encodeURIComponent(token)}?email=${encodeURIComponent(email)}`);
}

export function resetSalesEnginePassword(payload: {
  email: string;
  token: string;
  password: string;
  password_confirmation: string;
}): Promise<{ message: string; data: { redirect_path: string } }> {
  return publicRequest("/auth/reset-password", payload);
}

export function verifySalesEngineEmail(payload: { email: string; code: string }): Promise<{ data: { verified: boolean } }> {
  return publicRequest("/auth/verify-email", payload);
}

export function resendSalesEngineOtp(email: string): Promise<{ message: string }> {
  return publicRequest("/auth/resend-otp", { email });
}

export async function changeSalesEnginePassword(token: string, payload: {
  current_password: string;
  password: string;
  password_confirmation: string;
}): Promise<{ message: string }> {
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/password`, {
    method: "PUT",
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new SalesEngineAuthError(await readError(response), response.status);
  return (await response.json()) as { message: string };
}

export async function updateSalesEngineProfile(token: string, payload: { name?: string; avatar?: File }): Promise<SalesEngineAuthUser> {
  const form = new FormData();
  if (payload.name) form.set("name", payload.name);
  if (payload.avatar) form.set("avatar", payload.avatar);
  const orgId = getSalesEngineOrgId();
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/me`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(orgId ? { "X-Organization-Id": orgId } : {}),
    },
    body: form,
  });
  if (!response.ok) throw new SalesEngineAuthError(await readError(response), response.status);
  const data = (await response.json()) as { user: SalesEngineAuthUser };
  return data.user;
}

export function fetchSalesEngineCountries(): Promise<Array<{ label: string; value: string; code?: string }>> {
  return publicRequest<{ data: { countries: Array<{ label: string; value: string; code?: string }> } }>("/countries").then(
    (payload) => payload.data?.countries ?? []
  );
}

export async function updateCurrentOrganization(token: string, payload: {
  name?: string;
  country?: string;
  team_size?: string;
  purpose?: string;
  user_type?: string;
}): Promise<SalesEngineAuthOrganization> {
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/organizations/current`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new SalesEngineAuthError(await readError(response), response.status);
  const data = (await response.json()) as { data: SalesEngineAuthOrganization };
  return data.data;
}

async function orgRequest<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}${path}`, {
    method,
    headers: authHeaders(token, body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new SalesEngineAuthError(await readError(response), response.status);
  return (await response.json()) as T;
}

export async function listOrganizationMembers(token: string): Promise<SalesEngineMember[]> {
  const payload = await orgRequest<{ data: SalesEngineMember[] }>(token, "GET", "/organizations/current/members");
  return payload.data ?? [];
}

export function updateOrganizationMember(token: string, userId: number, role: string): Promise<void> {
  return orgRequest(token, "PATCH", `/organizations/current/members/${userId}`, { role });
}

export function removeOrganizationMember(token: string, userId: number): Promise<void> {
  return orgRequest(token, "DELETE", `/organizations/current/members/${userId}`);
}

export async function listOrganizationInvitations(token: string): Promise<SalesEngineInvitation[]> {
  const payload = await orgRequest<{ data: SalesEngineInvitation[] }>(token, "GET", "/organizations/current/invitations");
  return payload.data ?? [];
}

export function inviteOrganizationMember(token: string, payload: { email: string; role: "admin" | "member" }): Promise<void> {
  return orgRequest(token, "POST", "/organizations/current/invitations", payload);
}

export function revokeOrganizationInvitation(token: string, id: number): Promise<void> {
  return orgRequest(token, "DELETE", `/organizations/current/invitations/${id}`);
}

export function resendOrganizationInvitation(token: string, id: number): Promise<void> {
  return orgRequest(token, "POST", `/organizations/current/invitations/${id}/resend`);
}

export function previewSalesEngineInvitation(token: string): Promise<{
  data: { email: string; role: string; organization: { id: number; name: string } };
}> {
  return publicRequest("/invitations/preview", { token });
}

export async function acceptSalesEngineInvitation(payload: {
  token: string;
  name: string;
  password: string;
  password_confirmation: string;
}): Promise<SalesEngineAuthSession> {
  const session = await publicRequest<SalesEngineAuthSession>("/invitations/accept", payload);
  persistSession(session);
  return session;
}
