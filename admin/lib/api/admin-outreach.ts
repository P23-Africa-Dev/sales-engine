import { adminRequest } from "./admin-client";

export type OutreachMetric = {
  id: string;
  title: string;
  total: number | null;
  primaryLabel: string;
  secondaryLabel: string;
  primaryPercent: number | null;
  secondaryPercent: number | null;
  primaryCount?: number | null;
  secondaryCount?: number | null;
  configured?: boolean;
};

export type OutreachOrgRollup = {
  organization_id: number;
  name: string;
  status: string;
  industry: string | null;
  country: string | null;
  website: string | null;
  owner: string | null;
  owner_email: string | null;
  created_at: string | null;
  emails_sent: number;
  prospects: number;
  companies: number;
  follow_ups_completed: number;
};

export type OutreachActivity = {
  id: number;
  organization_id: number;
  organization_name?: string | null;
  name: string;
  channel: string;
  status: string;
  preview?: string | null;
  owner?: string | null;
  lead_id?: number | null;
  created_at: string | null;
};

export type TimelineItem = {
  id: string;
  type: string;
  title: string;
  channel: string;
  status: string | null;
  body: string | null;
  author?: string | null;
  occurred_at: string | null;
};

export async function fetchOutreachDashboard(organizationId?: number) {
  const qs = organizationId ? `?organization_id=${organizationId}` : "";
  return adminRequest<{
    data: {
      source: string;
      counts: { outreach: number; organizations: number };
      metrics: OutreachMetric[];
      supported_channels: string[];
    };
  }>(`/admin/outreach/dashboard${qs}`);
}

export async function fetchOutreachOrganizations(organizationId?: number) {
  const qs = organizationId ? `?organization_id=${organizationId}` : "";
  return adminRequest<{ data: OutreachOrgRollup[] }>(`/admin/outreach/organizations${qs}`);
}

export async function fetchOutreachActivities(params: {
  organization_id?: number;
  channel?: string;
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
    data: OutreachActivity[];
    meta: { current_page: number; last_page: number; per_page: number; total: number };
  }>(`/admin/outreach/activities${suffix}`);
}

export async function fetchOrganizationTimeline(organizationId: number) {
  return adminRequest<{ data: TimelineItem[] }>(
    `/admin/organizations/${organizationId}/timeline`,
  );
}

export async function createOrganizationAdminNote(organizationId: number, note: string) {
  return adminRequest<{ data: { id: number; note: string; created_at: string | null } }>(
    `/admin/organizations/${organizationId}/admin-notes`,
    { method: "POST", body: JSON.stringify({ note }) },
  );
}
