"use client";

import { apiRequest, ApiEnvelope, ApiRequestError, API_BASE_URL } from "./onboarding";
import { getSupportAwareApiTransport } from "@/lib/auth/support-session";

export type ProfileIdentity = {
  id: number;
  full_name: string;
  email: string;
  phone_number: string | null;
  gender: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
  avatar_source: string | null;
};

export type ProfileCompany = {
  id: number;
  company_id: string;
  name: string;
  status: string;
  team_size: string | null;
  country: string | null;
  purpose: string | null;
};

export type ProfileOrganization = {
  company: ProfileCompany;
  assigned_company: {
    id: number;
    company_id: string;
    name: string;
  };
  membership: {
    relation: string;
    role: string;
    joined_at: string;
    department: string | null;
  };
  role: string;
  internal_role: string | null;
  user_type: string | null;
};

export type ProfileAccount = {
  email_verified: boolean;
  onboarding: {
    completed: boolean;
    self_serve_completed: boolean;
    enterprise_completed: boolean;
    internal_completed: boolean;
    self_serve_completed_at: string | null;
    enterprise_completed_at: string | null;
    internal_completed_at: string | null;
  };
  onboarding_status: string | null;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfilePermissions = {
  can_edit_name: boolean;
  can_edit_phone_number: boolean;
  can_edit_gender: boolean;
  can_edit_country: boolean;
  can_edit_email: boolean;
  can_edit_role: boolean;
  can_edit_company: boolean;
  can_edit_membership: boolean;
};

export type ProfileData = {
  identity: ProfileIdentity;
  organization: ProfileOrganization;
  account: ProfileAccount;
  permissions: ProfilePermissions;
};

export type UpdateProfilePayload = {
  company_id?: string;
  name?: string;
  phone_number?: string;
  gender?: string;
  country?: string;
};

export type AvatarCatalogItem = {
  key: string;
  url: string;
  svg?: string | null;
};

export type AvatarCatalogData =
  | AvatarCatalogItem[]
  | { data: AvatarCatalogItem[]; meta?: { cursor: number; has_more: boolean } };

export function getProfile(
  token: string,
  companyId?: string | null
): Promise<ApiEnvelope<ProfileData>> {
  const qs = companyId
    ? `?company_id=${encodeURIComponent(companyId)}`
    : "";
  return apiRequest<ProfileData>({
    method: "GET",
    path: `/user/profile${qs}`,
    token,
  });
}

export function updateProfile(
  payload: UpdateProfilePayload,
  token: string
): Promise<ApiEnvelope<ProfileData>> {
  return apiRequest<ProfileData>({
    method: "PATCH",
    path: "/user/profile",
    body: payload,
    token,
  });
}

export function selectCatalogAvatar(
  payload: { avatar_key: string; gender?: string; company_id?: string | null },
  token: string
): Promise<ApiEnvelope<ProfileData>> {
  return apiRequest<ProfileData>({
    method: "POST",
    path: "/user/profile/avatar",
    body: payload,
    token,
  });
}

export async function uploadAvatarFile(
  payload: { avatar_file: File; gender?: string; company_id?: string | null },
  token: string
): Promise<ApiEnvelope<ProfileData>> {
  const formData = new FormData();
  formData.append("avatar_file", payload.avatar_file);
  if (payload.gender) formData.append("gender", payload.gender);
  if (payload.company_id) formData.append("company_id", payload.company_id);

  const transport = getSupportAwareApiTransport("/user/profile/avatar", token, API_BASE_URL);
  const response = await fetch(transport.url, {
    method: "POST",
    headers: {
      ...transport.authorizationHeaders,
      Accept: "application/json",
    },
    body: formData,
  });

  const data = (await response.json()) as ApiEnvelope<ProfileData>;

  if (!response.ok || !data.success) {
    throw new ApiRequestError(
      data.message || "Upload failed.",
      response.status,
      data.errors
    );
  }

  return data;
}

export function getAvatarCatalog(
  params: { gender?: string; limit?: number; cursor?: number },
  token: string
): Promise<ApiEnvelope<AvatarCatalogData>> {
  const qs = new URLSearchParams();
  if (params.gender) qs.set("gender", params.gender);
  qs.set("limit", String(params.limit ?? 12));
  qs.set("cursor", String(params.cursor ?? 0));

  return apiRequest<AvatarCatalogData>({
    method: "GET",
    path: `/avatars?${qs.toString()}`,
    token,
  });
}

export function extractAvatarItems(raw: AvatarCatalogData): AvatarCatalogItem[] {
  if (Array.isArray(raw)) return raw;
  return (raw as { data: AvatarCatalogItem[] }).data ?? [];
}
