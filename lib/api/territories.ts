"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type TerritoryMode = "auto" | "manual";

export type TerritoryAgent = {
  id: number;
  name: string | null;
  email: string | null;
  avatar: string | null;
  assigned_zone: string | null;
};

export type AgentTerritory = {
  id: number;
  user_id: number;
  agent: TerritoryAgent | null;
  name: string | null;
  color: string;
  mode: TerritoryMode;
  geojson: GeoJSON.Polygon | null;
  is_visible: boolean;
  updated_at: string | null;
};

export type CoveragePoint = {
  latitude: number;
  longitude: number;
  weight: number;
};

export type AgentCoverage = {
  user_id: number;
  task_points: CoveragePoint[];
  trail_points: CoveragePoint[];
};

export type TerritoriesListData = {
  items: AgentTerritory[];
  meta: {
    company_id: number;
    palette: string[];
    generated_at: string;
  };
};

export type CoveragePointsData = {
  items: AgentCoverage[];
  meta: {
    company_id: number;
    trail_lookback_days: number;
    max_trail_points_per_agent: number;
    generated_at: string;
  };
};

export type AgentTerritoryData = {
  territory: AgentTerritory | null;
  coverage: AgentCoverage;
  meta: {
    company_id: number;
    trail_lookback_days: number;
    generated_at: string;
  };
};

export type UpsertTerritoryPayload = {
  company_id: number | string;
  name?: string | null;
  color?: string;
  is_visible?: boolean;
  geojson?: GeoJSON.Polygon | null;
};

function companyQuery(companyId: number | string | undefined): string {
  if (companyId == null) return "";
  const qs = new URLSearchParams({ company_id: String(companyId) });
  return `?${qs.toString()}`;
}

export function listTerritories(
  companyId: number | string | undefined,
  token: string
): Promise<ApiEnvelope<TerritoriesListData>> {
  return apiRequest<TerritoriesListData>({
    method: "GET",
    path: `/admin/territories${companyQuery(companyId)}`,
    token,
  });
}

export function getCoveragePoints(
  companyId: number | string | undefined,
  token: string,
  userIds?: number[]
): Promise<ApiEnvelope<CoveragePointsData>> {
  const qs = new URLSearchParams();
  if (companyId != null) qs.set("company_id", String(companyId));
  (userIds ?? []).forEach((id, index) => qs.set(`user_ids[${index}]`, String(id)));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<CoveragePointsData>({
    method: "GET",
    path: `/admin/territories/coverage-points${query}`,
    token,
  });
}

export function upsertTerritory(
  userId: number,
  payload: UpsertTerritoryPayload,
  token: string
): Promise<ApiEnvelope<{ territory: AgentTerritory }>> {
  return apiRequest<{ territory: AgentTerritory }>({
    method: "PUT",
    path: `/admin/territories/${userId}`,
    body: payload,
    token,
  });
}

export function resetTerritory(
  userId: number,
  companyId: number | string | undefined,
  token: string
): Promise<ApiEnvelope<{ reset_user_id: number }>> {
  return apiRequest<{ reset_user_id: number }>({
    method: "DELETE",
    path: `/admin/territories/${userId}`,
    body: companyId != null ? { company_id: companyId } : undefined,
    token,
  });
}

export function getAgentTerritory(
  companyId: number | string | undefined,
  token: string
): Promise<ApiEnvelope<AgentTerritoryData>> {
  return apiRequest<AgentTerritoryData>({
    method: "GET",
    path: `/agent/territory${companyQuery(companyId)}`,
    token,
  });
}
