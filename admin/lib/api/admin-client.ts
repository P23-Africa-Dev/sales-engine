export const ADMIN_API_BASE_URL =
  process.env.NEXT_PUBLIC_SALES_ENGINE_API_URL ?? "http://127.0.0.1:8001/api/v1";

export const ADMIN_TOKEN_KEY = "se_admin_token";

export type PlatformAdmin = {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  created_at?: string | null;
};

export class AdminApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.body = body;
  }
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const authToken = token === undefined ? getAdminToken() : token;
  const headers = new Headers(init.headers ?? undefined);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);

  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Request failed (${response.status})`;
    throw new AdminApiError(message, response.status, body);
  }

  return body as T;
}

export async function adminLogin(email: string, password: string) {
  const data = await adminRequest<{
    token: string;
    token_type: string;
    admin: PlatformAdmin;
  }>(
    "/admin/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    null,
  );
  setAdminToken(data.token);
  return data;
}

export async function adminLogout(): Promise<void> {
  const token = getAdminToken();
  if (!token) return;
  try {
    await adminRequest("/admin/auth/logout", { method: "POST" }, token);
  } finally {
    setAdminToken(null);
  }
}

export async function adminMe() {
  return adminRequest<{ admin: PlatformAdmin }>("/admin/auth/me");
}
