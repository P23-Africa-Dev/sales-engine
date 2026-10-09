"use client";

import { ApiRequestError, type ApiEnvelope } from "./onboarding";
import { SALES_ENGINE_API_BASE_URL } from "./sales-engine";
import { getSalesEngineOrgId, getSalesEngineToken } from "@/lib/sales-engine/session";

export async function nativeCrmRequest<T>({ method, path, body, token }: {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string; body?: unknown; token?: string;
}): Promise<ApiEnvelope<T>> {
  const orgId = getSalesEngineOrgId();
  const nativePath = path.replace(/^\/(admin|agent)\/crm/, "/crm");
  let response: Response;
  try {
    response = await fetch(`${SALES_ENGINE_API_BASE_URL}${nativePath}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${getSalesEngineToken() || token || ""}`, ...(orgId ? { "X-Organization-Id": orgId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError("Network error. Please check your connection.", 0);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 404 && /route .*could not be found/i.test(payload?.message || "")
      ? "The configured Sales Engine backend does not have the native CRM APIs. Deploy the backend changes and run its database migrations, or configure NEXT_PUBLIC_SALES_ENGINE_API_URL to use an updated backend."
      : payload?.message || "CRM request failed.";
    throw new ApiRequestError(message, response.status, payload?.errors);
  }
  return { success: true, message: payload?.message || "", errors: null, data: payload.data };
}
