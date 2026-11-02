import { adminRequest } from "./admin-client";

export type SocialOverview = {
  totals: {
    signals: number;
    needs_review: number;
    approved: number;
    suppressed: number;
    synced: number;
    paused_organizations: number;
  };
  by_source: { source: string | null; count: number }[];
  status_map: Record<string, string>;
};

export type SocialSignalRow = {
  id: number;
  organization_id: number;
  organization_name?: string | null;
  company: string | null;
  author: string | null;
  source: string | null;
  title: string | null;
  quote: string | null;
  score: number;
  stage: string | null;
  status: "Needs review" | "Approved" | "Suppressed" | string;
  backend_status?: string;
  date: string | null;
  crm: boolean;
};

export type SocialSettings = {
  id?: number;
  organization_id?: number;
  sources?: string[];
  enabled_sources?: string[];
  cadence_days?: number;
  min_score?: number;
  freshness_days?: number;
  freshness_window_days?: number;
  destination?: string;
  crm_destination?: string;
  intent_filters?: string[] | string | null;
  keywords?: string | string[];
  icp_summary?: string | null;
  admin_paused_at?: string | null;
  [key: string]: unknown;
};

export type SocialRun = {
  id: number;
  organization_id: number;
  organization_name?: string | null;
  status: string;
  signals_created?: number | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
};

export async function fetchSocialOverview(organizationId?: number) {
  const qs = organizationId ? `?organization_id=${organizationId}` : "";
  return adminRequest<{ data: SocialOverview }>(`/admin/social-listening/overview${qs}`);
}

export async function fetchSocialSignals(params: {
  organization_id?: number;
  source?: string;
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") {
      qs.set(key, String(value));
    }
  });
  const suffix = qs.toString() ? `?${qs}` : "";
  return adminRequest<{
    data: SocialSignalRow[];
    meta: { current_page: number; last_page: number; per_page: number; total: number };
  }>(`/admin/social-listening/signals${suffix}`);
}

export async function reviewSocialSignals(
  ids: number[],
  status: "reviewed" | "dismissed" | "new" | "Approved" | "Suppressed" | "Needs review",
  reason: string,
) {
  return adminRequest<{ data: { updated: number } }>("/admin/social-listening/signals/review", {
    method: "POST",
    body: JSON.stringify({ ids, status, reason }),
  });
}

export async function fetchSocialSettings(organizationId: number) {
  return adminRequest<{ data: SocialSettings }>(
    `/admin/organizations/${organizationId}/social-listening/settings`,
  );
}

export async function updateSocialSettings(
  organizationId: number,
  payload: Record<string, unknown>,
) {
  return adminRequest<{ data: SocialSettings }>(
    `/admin/organizations/${organizationId}/social-listening/settings`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export async function pauseSocialListening(organizationId: number, reason?: string) {
  return adminRequest<{ data: SocialSettings }>(
    `/admin/organizations/${organizationId}/social-listening/pause`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export async function resumeSocialListening(organizationId: number, reason?: string) {
  return adminRequest<{ data: SocialSettings }>(
    `/admin/organizations/${organizationId}/social-listening/resume`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export async function fetchSocialRuns(params: {
  organization_id?: number;
  page?: number;
  per_page?: number;
} = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}` !== "") {
      qs.set(key, String(value));
    }
  });
  const suffix = qs.toString() ? `?${qs}` : "";
  return adminRequest<{
    data: SocialRun[];
    meta?: { current_page: number; last_page: number; per_page: number; total: number };
  }>(`/admin/social-listening/runs${suffix}`);
}

export async function queueSocialRun(organizationId: number) {
  return adminRequest<{ data: SocialRun | { id: number; status: string } }>(
    `/admin/organizations/${organizationId}/social-listening/runs`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function retrySocialRun(runId: number) {
  return adminRequest<{ data: SocialRun }>(`/admin/social-listening/runs/${runId}/retry`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
