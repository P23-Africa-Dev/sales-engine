import { adminRequest } from "./admin-client";

export type AdminOrganization = {
  id: number;
  name: string;
  slug: string;
  status: "active" | "pending" | "inactive" | string;
  industry: string | null;
  country: string | null;
  purpose: string | null;
  scope: string | null;
  team_size: string | null;
  crm_stale_days: number;
  owner: { id: number; name: string; email: string } | null;
  prospect_pool: number;
  companies_count: number;
  leads_count: number;
  onboarding_completed: boolean;
  created_at: string | null;
};

export type AdminOrganizationList = {
  data: AdminOrganization[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};

export type AdminOrganizationInput = {
  name: string;
  owner_email: string;
  industry?: string;
  country?: string;
  scope?: string;
  status?: string;
  reason?: string;
};

export async function listAdminOrganizations(params: {
  search?: string;
  industry?: string;
  status?: string;
  pool?: string;
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
  return adminRequest<AdminOrganizationList>(`/admin/organizations${suffix}`);
}

export async function getAdminOrganization(id: number) {
  return adminRequest<{ data: AdminOrganization }>(`/admin/organizations/${id}`);
}

export async function createAdminOrganization(input: AdminOrganizationInput) {
  return adminRequest<{ data: AdminOrganization; invitation_email: string }>(
    "/admin/organizations",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function updateAdminOrganization(
  id: number,
  input: Partial<AdminOrganizationInput> & {
    industry?: string | null;
    country?: string | null;
    scope?: string | null;
    status?: string;
    reason?: string;
    crm_stale_days?: number;
  },
) {
  return adminRequest<{ data: AdminOrganization }>(`/admin/organizations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
