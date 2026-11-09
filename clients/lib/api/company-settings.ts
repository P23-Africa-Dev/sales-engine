"use client";

import { apiRequest, ApiEnvelope } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export type OperationalDefaults = {
  minimum_photos_required: number;
  visit_verification_required: boolean;
};

export type MeetingDefaults = {
  default_reminder_minutes: number;
};

export type UserManagementSettings = {
  supervisor_can_suspend_agents: boolean;
  supervisor_can_delete_agents: boolean;
};

export type CompanySettings = {
  company_id: number;
  company_name: string;
  country: string | null;
  currency_code: string | null;
  team_size: string | null;
  use_case: string | null;
  operational_defaults: OperationalDefaults;
  meeting_defaults: MeetingDefaults;
  user_management: UserManagementSettings;
  can_edit: boolean;
  viewer_role: string | null;
};

export type UpdateCompanySettingsPayload = {
  company_id?: number | string;
  operational_defaults?: Partial<OperationalDefaults>;
  meeting_defaults?: Partial<MeetingDefaults>;
  user_management?: Partial<UserManagementSettings>;
};

function authToken(): string | undefined {
  return getAuthTokenFromDocument() ?? undefined;
}

export function getCompanySettings(companyId?: number | string) {
  const qs = companyId != null ? `?company_id=${encodeURIComponent(String(companyId))}` : "";
  return apiRequest<CompanySettings>({
    method: "GET",
    path: `/company/settings${qs}`,
    token: authToken(),
  });
}

export function updateCompanySettings(payload: UpdateCompanySettingsPayload) {
  return apiRequest<CompanySettings>({
    method: "PATCH",
    path: "/company/settings",
    body: payload,
    token: authToken(),
  });
}

export type { ApiEnvelope };
