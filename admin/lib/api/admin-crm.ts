import { adminRequest } from "./admin-client";

export type CrmOverview = {
  totals: {
    entries: number;
    open: number;
    won: number;
    lost: number;
    archived: number;
    win_rate: number;
  };
  quality_flags: {
    unassigned: number;
    missing_email: number;
    possible_duplicates: number;
    stale: number;
    stale_days: number;
  };
};

export type CrmEntryRow = {
  id: number;
  organization_id: number;
  organization_name?: string | null;
  lead_id?: number | null;
  company?: string | null;
  contact?: string | null;
  email?: string | null;
  owner?: string | null;
  assigned_to_user_id?: number | null;
  stage?: string | null;
  stage_id?: number | null;
  stage_slug?: string | null;
  pipeline?: string | null;
  value?: number | null;
  currency?: string | null;
  source?: string | null;
  due?: string | null;
  next_action?: string | null;
  archived: boolean;
  duplicate_of?: string | number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CrmActivityFollowUp = {
  id: number | string;
  organization_id?: number | null;
  lead_id?: number | null;
  title?: string | null;
  description?: string | null;
  happened_at?: string | null;
};

export type CrmActivityAudit = {
  id: number | string;
  action?: string;
  reason?: string | null;
  organization_id?: number | null;
  admin?: string | null;
  created_at?: string | null;
};

export type CrmActivityPayload = {
  follow_ups: CrmActivityFollowUp[];
  audits: CrmActivityAudit[];
};

export async function fetchCrmOverview(organizationId?: number) {
  const qs = organizationId ? `?organization_id=${organizationId}` : "";
  return adminRequest<{ data: CrmOverview }>(`/admin/crm/overview${qs}`);
}

export async function fetchCrmEntries(params: {
  organization_id?: number;
  search?: string;
  stage_id?: number;
  stage_slug?: string;
  archived?: "exclude" | "include" | "only" | string;
  sort?: string;
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
    data: CrmEntryRow[];
    meta: { current_page: number; last_page: number; per_page: number; total: number };
  }>(`/admin/crm/entries${suffix}`);
}

export async function fetchCrmEntry(entryId: number) {
  return adminRequest<{ data: CrmEntryRow }>(`/admin/crm/entries/${entryId}`);
}

export async function updateCrmEntry(
  entryId: number,
  payload: Record<string, unknown> & { reason: string },
) {
  return adminRequest<{ data: CrmEntryRow }>(`/admin/crm/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function archiveCrmEntries(ids: number[], reason: string) {
  return adminRequest<{ data: { updated: number } }>("/admin/crm/entries/archive", {
    method: "POST",
    body: JSON.stringify({ ids, reason }),
  });
}

export async function restoreCrmEntries(ids: number[], reason: string) {
  return adminRequest<{ data: { updated: number } }>("/admin/crm/entries/restore", {
    method: "POST",
    body: JSON.stringify({ ids, reason }),
  });
}

export async function createCrmEntryNote(entryId: number, note: string, reason?: string) {
  return adminRequest<{ data: unknown }>(`/admin/crm/entries/${entryId}/notes`, {
    method: "POST",
    body: JSON.stringify({ note, reason }),
  });
}

export async function dismissCrmDuplicate(entryId: number, reason: string) {
  return adminRequest<{ data: CrmEntryRow }>(
    `/admin/crm/entries/${entryId}/duplicate-dismiss`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export async function completeCrmFollowUp(entryId: number, reason: string) {
  return adminRequest<{ data: CrmEntryRow }>(
    `/admin/crm/entries/${entryId}/complete-follow-up`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export async function fetchCrmActivity(params: {
  organization_id?: number;
  limit?: number;
} = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) qs.set(key, String(value));
  });
  const suffix = qs.toString() ? `?${qs}` : "";
  return adminRequest<{ data: CrmActivityPayload }>(`/admin/crm/activity${suffix}`);
}

export async function fetchCrmReviewPolicy(organizationId: number) {
  return adminRequest<{ data: { crm_stale_days: number } }>(
    `/admin/organizations/${organizationId}/crm/review-policy`,
  );
}

export async function updateCrmReviewPolicy(
  organizationId: number,
  crm_stale_days: number,
  reason?: string,
) {
  return adminRequest<{ data: { crm_stale_days: number } }>(
    `/admin/organizations/${organizationId}/crm/review-policy`,
    { method: "PUT", body: JSON.stringify({ crm_stale_days, reason }) },
  );
}
