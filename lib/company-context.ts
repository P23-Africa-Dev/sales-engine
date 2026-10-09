import { getSalesEngineOrgId } from "@/lib/sales-engine/session";

import type { AuthUser } from "@/store/auth";

export type ActiveCompanyContext = {
  internalId: number | null;
  publicId: string | null;
  role: string | null;
  apiCompanyId: number | string | null;
};

export function getActiveCompanyContext(
  user: AuthUser | null | undefined
): ActiveCompanyContext {
  const company = user?.active_company;
  if (!company) {
    const nativeOrgId = getSalesEngineOrgId();
    if (nativeOrgId) return { internalId: Number(nativeOrgId), publicId: nativeOrgId, role: user?.access_role ?? "member", apiCompanyId: Number(nativeOrgId) };
    return {
      internalId: null,
      publicId: null,
      role: null,
      apiCompanyId: null,
    };
  }

  return {
    internalId: company.id ?? null,
    publicId: company.company_id ?? null,
    role: company.role ?? null,
    // Prefer internal numeric id — backend company context resolves membership by companies.id.
    apiCompanyId: company.id ?? company.company_id ?? null,
  };
}
