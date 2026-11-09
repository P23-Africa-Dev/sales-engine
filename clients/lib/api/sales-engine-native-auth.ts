import { setAuthSession } from "@/lib/auth/session";
import { SALES_ENGINE_API_BASE_URL } from "@/lib/api/sales-engine";
import { getSalesEngineOrgId, getSalesEngineToken, setSalesEngineSession, SALES_ENGINE_TOKEN_KEY } from "@/lib/sales-engine/session";

export type SalesEngineAuthUser = {
  id: number;
  name: string;
  email: string;
  organization_role?: string;
};

export type SalesEngineAuthOrganization = {
  id: number;
  name: string;
  slug?: string;
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

export async function fetchSalesEngineMe(token: string): Promise<SalesEngineAuthUser> {
  const orgId = getSalesEngineOrgId();
  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(orgId ? { "X-Organization-Id": orgId } : {}),
    },
  });
  if (!response.ok) {
    throw new SalesEngineAuthError(await readError(response), response.status);
  }
  const payload = (await response.json()) as { user: SalesEngineAuthUser; organizations?: Array<{ id: number; role?: string }>; current_organization?: { id: number } };
  const stored = getSalesEngineToken();
  if (!stored && orgId) {
    setSalesEngineSession(token, orgId);
  }
  const organization = payload.organizations?.find(org => org.id === (payload.current_organization?.id ?? Number(orgId)));
  return { ...payload.user, organization_role: organization?.role };
}
