export const SALES_ENGINE_TOKEN_KEY = "sales_engine_token";
export const SALES_ENGINE_ORG_ID_KEY = "sales_engine_org_id";

export function getSalesEngineToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(SALES_ENGINE_TOKEN_KEY);
}

export function setSalesEngineSession(token: string, organizationId: number | string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SALES_ENGINE_TOKEN_KEY, token);
  localStorage.setItem(SALES_ENGINE_ORG_ID_KEY, String(organizationId));
}

export function getSalesEngineOrgId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(SALES_ENGINE_ORG_ID_KEY);
}

export function clearSalesEngineSession() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SALES_ENGINE_TOKEN_KEY);
  localStorage.removeItem(SALES_ENGINE_ORG_ID_KEY);
}
