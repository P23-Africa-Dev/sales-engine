"use client";

import { useQuery } from "@tanstack/react-query";
import {
    getDashboardOverview,
    getWorkforceSummary,
    type DashboardOverviewData,
    type DashboardQueryParams,
    type WorkforceSummaryData,
} from "@/lib/api/dashboard";
import type { ApiRoleBasePath } from "@/lib/api/crm";
import { getAuthTokenFromDocument, getCompanyId } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { useAuthStore } from "@/store/auth";

export type UseDashboardParams = DashboardQueryParams & {
    basePath?: ApiRoleBasePath;
};

export const DASHBOARD_KEYS = {
    all: ["dashboard"] as const,
    overview: (params: UseDashboardParams) => ["dashboard", "overview", params] as const,
    workforce: (params: UseDashboardParams) => ["dashboard", "workforce", params] as const,
};

function resolveDashboardCompanyId(
    companyId: DashboardQueryParams["company_id"],
): number | string | undefined {
    if (companyId !== undefined && companyId !== null && companyId !== "") {
        return companyId;
    }

    const storedCompanyId = typeof window !== "undefined" ? getCompanyId() : null;
    if (storedCompanyId) {
        const parsed = Number(storedCompanyId);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : storedCompanyId;
    }

    return undefined;
}

function buildDashboardRequestParams(
    queryParams: DashboardQueryParams,
    resolvedCompanyId: number | string | undefined,
): DashboardQueryParams {
    const requestParams: DashboardQueryParams = { ...queryParams };

    if (resolvedCompanyId !== undefined) {
        requestParams.company_id = resolvedCompanyId;
    } else {
        delete requestParams.company_id;
    }

    return requestParams;
}

export function useDashboardOverview(params: UseDashboardParams = {}) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
    const hasHydrated = useAuthStore((s) => s._hasHydrated);
    const { basePath = "/admin", ...queryParams } = params;
    const resolvedCompanyId = resolveDashboardCompanyId(queryParams.company_id);
    const requestParams = buildDashboardRequestParams(queryParams, resolvedCompanyId);

    return useQuery({
        queryKey: DASHBOARD_KEYS.overview({ ...params, company_id: resolvedCompanyId }),
        queryFn: async (): Promise<DashboardOverviewData> => {
            const res = await getDashboardOverview(requestParams, token, basePath);
            return res.data;
        },
        enabled: hasActiveApiSession(token) && hasHydrated,
        staleTime: 1000 * 60 * 2,
    });
}

export function useWorkforceSummary(params: UseDashboardParams = {}) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
    const hasHydrated = useAuthStore((s) => s._hasHydrated);
    const { basePath = "/admin", ...queryParams } = params;
    const resolvedCompanyId = resolveDashboardCompanyId(queryParams.company_id);
    const requestParams = buildDashboardRequestParams(queryParams, resolvedCompanyId);

    return useQuery({
        queryKey: DASHBOARD_KEYS.workforce({ ...params, company_id: resolvedCompanyId }),
        queryFn: async (): Promise<WorkforceSummaryData> => {
            const res = await getWorkforceSummary(requestParams, token, basePath);
            return res.data;
        },
        enabled: hasActiveApiSession(token) && hasHydrated,
        staleTime: 1000 * 60 * 2,
    });
}
