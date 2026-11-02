import { adminRequest } from "./admin-client";

export type AdminLeadNote = {
  note?: string;
  text?: string;
  reason?: string | null;
  admin_id?: number;
  admin_name?: string;
  actor?: string;
  created_at?: string;
  at?: string;
};

export type AdminLead = {
  id: number;
  organization_id: number;
  name: string;
  company?: string | null;
  score?: number | null;
  tier: "high" | "middle" | "low" | string;
  stage?: string | null;
  source?: string | null;
  summary?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  meta?: Record<string, unknown> | null;
  admin_notes?: AdminLeadNote[];
  admin_outreach_prepared?: boolean;
  admin_outreach_sequence?: string | null;
  crm_entry?: { id: number; stage?: string | null; assignee?: string | null } | null;
  created_at?: string | null;
};

export type SmartLeadsAnalytics = {
  total: number;
  avg_score: number;
  tier_distribution: { high: number; middle: number; low: number };
  buying_signal_coverage: {
    hiring: number;
    funding: number;
    expansion: number;
    tenders: number;
  };
  outreach_velocity: {
    day: string;
    dayLabel: string;
    touches: number;
    opens: number;
    replies: number;
    meetings: number;
  }[];
};

export async function fetchOrganizationLeads(
  organizationId: number,
  params: {
    tier?: string;
    signal?: string;
    search?: string;
    page?: number;
    per_page?: number;
  } = {},
) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") {
      qs.set(key, String(value));
    }
  });
  const suffix = qs.toString() ? `?${qs}` : "";
  return adminRequest<{
    data: AdminLead[];
    meta: { current_page: number; last_page: number; per_page: number; total: number };
  }>(`/admin/organizations/${organizationId}/leads${suffix}`);
}

export async function fetchLeadDetail(leadId: number) {
  return adminRequest<{
    data: {
      lead: AdminLead;
      contacts: unknown[];
      signals: unknown[];
      activities: unknown[];
      tier: string;
    };
  }>(`/admin/leads/${leadId}`);
}

export async function createLeadAdminNote(leadId: number, note: string, reason?: string) {
  return adminRequest<{ data: AdminLead }>(`/admin/leads/${leadId}/notes`, {
    method: "POST",
    body: JSON.stringify({ note, reason }),
  });
}

export async function prepareLeadsOutreach(leadIds: number[], sequence: string) {
  return adminRequest<{ data: { prepared_lead_ids: number[]; updated: number } }>(
    "/admin/leads/prepare-outreach",
    { method: "POST", body: JSON.stringify({ lead_ids: leadIds, sequence }) },
  );
}

export async function fetchSmartLeadsAnalytics(organizationId: number) {
  return adminRequest<{ data: SmartLeadsAnalytics }>(
    `/admin/organizations/${organizationId}/smart-leads/analytics`,
  );
}
