"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type ApiRoleBasePath = "/admin" | "/agent";

export type SavedLocationActor = {
  id: number;
  name: string;
  email: string;
};

export type SavedLocation = {
  id: number;
  company_id?: number;
  created_by_user_id?: number;
  updated_by_user_id?: number | null;
  crm_lead_id?: number | null;
  linked_to_crm?: boolean;
  can_manage?: boolean;
  name: string;
  type: string | null;
  description: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  contact_number: string | null;
  email: string | null;
  is_active: boolean;
  meta: Record<string, unknown> | null;
  created_by?: SavedLocationActor | null;
  updated_by?: SavedLocationActor | null;
  created_at?: string;
  updated_at?: string;
};

export type SavedLocationPagination = {
  next_page_url: string | null;
  prev_page_url: string | null;
  per_page: number;
  current_page?: number;
  total?: number;
  last_page?: number;
};

export type SavedLocationsListData = {
  items: SavedLocation[];
  pagination: SavedLocationPagination;
};

export type SavedLocationDetailData = {
  location: SavedLocation;
};

export type ListSavedLocationsParams = {
  company_id?: number | string;
  q?: string;
  type?: string;
  is_active?: boolean;
  /** When true, only return pins created by the authenticated user. */
  mine?: boolean;
  per_page?: number;
  page?: number;
  min_lat?: number;
  max_lat?: number;
  min_lng?: number;
  max_lng?: number;
  /** Sort nearest-first relative to this point when both are set. */
  near_lat?: number;
  near_lng?: number;
};

export type SavedLocationViewportBounds = {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
};

export type CreateSavedLocationPayload = {
  company_id: number | string;
  name: string;
  type?: string | null;
  description?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  contact_number?: string | null;
  email?: string | null;
  is_active?: boolean;
  meta?: Record<string, unknown> | null;
  save_to_crm?: boolean;
  crm_status?: string;
};

export type UpdateSavedLocationPayload = Partial<CreateSavedLocationPayload>;

function withBase(basePath: ApiRoleBasePath, path: string) {
  return `${basePath}${path}`;
}

export function listSavedLocations(
  params: ListSavedLocationsParams,
  token: string,
  basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<SavedLocationsListData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.q) qs.set("q", params.q);
  if (params.type) qs.set("type", params.type);
  if (params.is_active != null) qs.set("is_active", params.is_active ? "1" : "0");
  if (params.mine) qs.set("mine", "1");
  qs.set("per_page", String(params.per_page ?? 50));
  if (params.page != null) qs.set("page", String(params.page));
  if (params.min_lat != null) qs.set("min_lat", String(params.min_lat));
  if (params.max_lat != null) qs.set("max_lat", String(params.max_lat));
  if (params.min_lng != null) qs.set("min_lng", String(params.min_lng));
  if (params.max_lng != null) qs.set("max_lng", String(params.max_lng));
  if (params.near_lat != null) qs.set("near_lat", String(params.near_lat));
  if (params.near_lng != null) qs.set("near_lng", String(params.near_lng));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<SavedLocationsListData>({
    method: "GET",
    path: withBase(basePath, `/locations${query}`),
    token,
  });
}

export function getSavedLocation(
  locationId: number | string,
  params: { company_id?: number | string },
  token: string,
  basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<SavedLocationDetailData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<SavedLocationDetailData>({
    method: "GET",
    path: withBase(basePath, `/locations/${locationId}${query}`),
    token,
  });
}

export function createSavedLocation(
  payload: CreateSavedLocationPayload,
  token: string,
  basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<SavedLocationDetailData>> {
  return apiRequest<SavedLocationDetailData>({
    method: "POST",
    path: withBase(basePath, "/locations"),
    body: payload,
    token,
  });
}

export function updateSavedLocation(
  locationId: number | string,
  payload: UpdateSavedLocationPayload,
  token: string,
  basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<SavedLocationDetailData>> {
  return apiRequest<SavedLocationDetailData>({
    method: "PATCH",
    path: withBase(basePath, `/locations/${locationId}`),
    body: payload,
    token,
  });
}

export function deleteSavedLocation(
  locationId: number | string,
  payload: { company_id?: number | string },
  token: string,
  basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ deleted_location_id: number }>> {
  return apiRequest<{ deleted_location_id: number }>({
    method: "DELETE",
    path: withBase(basePath, `/locations/${locationId}`),
    body: payload,
    token,
  });
}
