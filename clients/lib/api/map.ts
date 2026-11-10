"use client";

import { apiRequest, ApiRequestError } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export type MapPoiDisplaySettings = {
  /** Effective for the resolved company (per-org override else global). */
  enabled: boolean;
  /** The platform-wide master toggle value. */
  global_enabled: boolean;
};

function authToken(): string | undefined {
  return getAuthTokenFromDocument() ?? undefined;
}

export async function getMapPoiDisplay(companyId?: number | string) {
  const query =
    companyId != null ? `?company_id=${encodeURIComponent(String(companyId))}` : "";
  return apiRequest<MapPoiDisplaySettings>({
    method: "GET",
    path: `/map/poi-display${query}`,
    token: authToken(),
  });
}

export { ApiRequestError };
