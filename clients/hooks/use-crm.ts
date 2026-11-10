"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import {
    addLeadActivity,
    addLeadNote,
    createCrmLabel,
    deleteCrmLabel,
    createCrmPipeline,
    deleteCrmPipeline,
    createLead,
    deleteLead,
    downloadCrmLeadsExport,
    getAgentUploadsOverview,
    getCrmLeadsAnalytics,
    getCrmPreferences,
    getLead,
    getLeadPipeline,
    importCrmLeads,
    listCrmLabels,
    listCrmAssignees,
    listCrmPipelines,
    listLeads,
    previewImportCrmLeads,
    reorderCrmLabels,
    setCompanyDefaultCrmPipeline,
    setPreferredCrmPipeline,
    type CrmLabel,
    type CrmPipeline,
    type CrmPreferences,
    type CrmAssignee,
    type ExportLeadsParams,
    type ImportLeadsPayload,
    updateLead,
    updateCrmLabel,
    updateCrmPipeline,
    type AddLeadActivityPayload,
    type AddLeadNotePayload,
    type AgentUploadOverview,
    type ApiLeadStatus,
    type ApiRoleBasePath,
    type CrmLeadsAnalytics,
    type CrmLeadsAnalyticsParams,
    type CreateLeadPayload,
    type LeadActivity,
    type LeadApiItem,
    type LeadNote,
    type ListLeadsParams,
    type PaginationData,
    type PipelineSnapshot,
    type UpdateLeadPayload,
} from "@/lib/api/crm";
import { SAVED_LOCATION_KEYS } from "@/hooks/use-saved-locations";
import { mergeLeadPages } from "@/lib/crm/lead-visibility";

export const CRM_KEYS = {
    all: ["crm"] as const,
    list: (params: ListLeadsParams, basePath: ApiRoleBasePath) =>
        ["crm", "leads", basePath, params] as const,
    detail: (
        leadId: number | string,
        companyId: number | string | undefined,
        basePath: ApiRoleBasePath
    ) => ["crm", "lead", basePath, leadId, companyId] as const,
    pipeline: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "pipeline", basePath, companyId] as const,
    pipelines: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "pipelines", basePath, companyId] as const,
    labels: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "labels", basePath, companyId] as const,
    agentUploadsOverview: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "agent-uploads-overview", basePath, companyId] as const,
    leadsAnalytics: (params: CrmLeadsAnalyticsParams, basePath: ApiRoleBasePath) =>
        ["crm", "leads-analytics", basePath, params] as const,
    preferences: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "preferences", basePath, companyId] as const,
    assignees: (companyId: number | string | undefined, basePath: ApiRoleBasePath) =>
        ["crm", "assignees", basePath, companyId] as const,
};

export type LeadsResult = {
    leads: LeadApiItem[];
    pagination: PaginationData;
};

export function useCrmAssignees(
    companyId?: number | string,
    basePath: ApiRoleBasePath = "/admin",
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.assignees(companyId, basePath),
        queryFn: async (): Promise<CrmAssignee[]> =>
            (await listCrmAssignees(companyId!, token, basePath)).data.items,
        enabled: hasActiveApiSession(token) && companyId != null && basePath === "/admin",
        staleTime: 1000 * 60 * 5,
    });
}

export function useLeads(
    params: ListLeadsParams = {},
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.list(params, basePath),
        queryFn: async (): Promise<LeadsResult> => {
            const res = await listLeads(params, token, basePath);
            return {
                leads: res.data.items,
                pagination: res.data.pagination,
            };
        },
        enabled: hasActiveApiSession(token) && !!params.company_id,
        staleTime: 1000 * 60 * 2,
        placeholderData: (previousData) => previousData,
    });
}

export type LeadStageDefinition = {
    id: ApiLeadStatus | "__uncategorized__";
    title: string;
    color: string;
};

export type LeadStagePage = LeadStageDefinition & {
    leads: LeadApiItem[];
    loaded: number;
    total: number;
    hasMore: boolean;
    isLoading: boolean;
    isFetchingMore: boolean;
};

const EMPTY_STAGE_PAGE_COUNTS: Record<string, number> = {};

export function useLeadStagePages(
    stages: LeadStageDefinition[],
    params: Omit<ListLeadsParams, "status" | "page" | "uncategorized">,
    basePath: ApiRoleBasePath = "/admin",
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
    const [pageState, setPageState] = useState<{
        key: string;
        counts: Record<string, number>;
    }>({ key: "", counts: {} });
    const resetKey = JSON.stringify([stages.map((stage) => stage.id), params, basePath]);
    const pageCounts = pageState.key === resetKey ? pageState.counts : EMPTY_STAGE_PAGE_COUNTS;

    const specs = useMemo(
        () =>
            stages.flatMap((stage) => {
                const pageCount = pageCounts[stage.id] ?? 1;
                return Array.from({ length: pageCount }, (_, index) => {
                    const page = index + 1;
                    const queryParams: ListLeadsParams = {
                        ...params,
                        page,
                        per_page: params.per_page ?? 20,
                        status: stage.id === "__uncategorized__" ? undefined : stage.id,
                        uncategorized: stage.id === "__uncategorized__",
                    };
                    return { stageId: stage.id, page, queryParams };
                });
            }),
        [pageCounts, params, stages],
    );

    const queries = useQueries({
        queries: specs.map((spec) => ({
            queryKey: CRM_KEYS.list(spec.queryParams, basePath),
            queryFn: async (): Promise<LeadsResult> => {
                const response = await listLeads(spec.queryParams, token, basePath);
                return {
                    leads: response.data.items,
                    pagination: response.data.pagination,
                };
            },
            enabled: hasActiveApiSession(token) && !!params.company_id,
            staleTime: 1000 * 60 * 2,
            placeholderData: (previousData: LeadsResult | undefined) => previousData,
        })),
    });

    const stagePages = stages.map((stage): LeadStagePage => {
        const stageResults = specs
            .map((spec, index) => ({ spec, query: queries[index] }))
            .filter(({ spec }) => spec.stageId === stage.id)
            .sort((left, right) => left.spec.page - right.spec.page);
        const leads = mergeLeadPages(
            stageResults.map(({ query }) => query.data?.leads ?? []),
        );
        const total = stageResults[0]?.query.data?.pagination.total ?? 0;
        const pageCount = pageCounts[stage.id] ?? 1;

        return {
            ...stage,
            leads,
            loaded: leads.length,
            total,
            hasMore: leads.length < total,
            isLoading: stageResults.some(({ query }) => query.isLoading),
            isFetchingMore:
                pageCount > 1 &&
                Boolean(stageResults.find(({ spec }) => spec.page === pageCount)?.query.isFetching),
        };
    });

    return {
        stages: stagePages,
        isLoading: stagePages.some((stage) => stage.isLoading),
        isError: queries.some((query) => query.isError),
        error: queries.find((query) => query.isError)?.error,
        refetch: () => Promise.all(queries.map(query => query.refetch())),
        loadMore: (stageId: LeadStageDefinition["id"]) => {
            setPageState((current) => {
                const counts = current.key === resetKey ? current.counts : {};
                return {
                    key: resetKey,
                    counts: {
                        ...counts,
                        [stageId]: (counts[stageId] ?? 1) + 1,
                    },
                };
            });
        },
    };
}

export function useLeadPipeline(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.pipeline(companyId, basePath),
        queryFn: async (): Promise<PipelineSnapshot> => {
            const res = await getLeadPipeline({ company_id: companyId }, token, basePath);
            return res.data;
        },
        enabled: hasActiveApiSession(token) && !!companyId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useLead(
    leadId: number | string,
    companyId?: number | string,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.detail(leadId, companyId, basePath),
        queryFn: async (): Promise<LeadApiItem> => {
            const res = await getLead(leadId, { company_id: companyId }, token, basePath);
            return res.data.lead;
        },
        enabled: hasActiveApiSession(token) && !!leadId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useCrmPipelines(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.pipelines(companyId, basePath),
        queryFn: async (): Promise<CrmPipeline[]> => {
            const res = await listCrmPipelines({ company_id: companyId }, token, basePath);
            return res.data.items;
        },
        enabled: hasActiveApiSession(token) && !!companyId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useCrmPreferences(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.preferences(companyId, basePath),
        queryFn: async (): Promise<CrmPreferences> => {
            const res = await getCrmPreferences({ company_id: companyId }, token, basePath);
            return res.data;
        },
        enabled: hasActiveApiSession(token) && !!companyId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useSetPreferredCrmPipeline(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string; pipeline_id: number | string }) =>
            setPreferredCrmPipeline(payload, token, basePath),
        onSuccess: (res, variables) => {
            if (res.data) {
                queryClient.setQueryData(
                    CRM_KEYS.preferences(variables.company_id, basePath),
                    res.data
                );
            }
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useSetCompanyDefaultCrmPipeline(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            pipelineId,
            payload,
        }: {
            pipelineId: number | string;
            payload: { company_id?: number | string };
        }) => setCompanyDefaultCrmPipeline(pipelineId, payload, token, basePath),
        onSuccess: (_res, variables) => {
            if (variables.payload.company_id) {
                queryClient.setQueryData(
                    CRM_KEYS.preferences(variables.payload.company_id, basePath),
                    (old: CrmPreferences | undefined) => ({
                        preferred_pipeline_id: old?.preferred_pipeline_id ?? null,
                        company_default_pipeline_id: Number(variables.pipelineId),
                    })
                );
                queryClient.setQueryData(
                    CRM_KEYS.pipelines(variables.payload.company_id, basePath),
                    (old: CrmPipeline[] | undefined) => {
                        if (!old) return old;
                        return old.map((p) => ({
                            ...p,
                            is_default: p.id === Number(variables.pipelineId),
                        }));
                    }
                );
            }
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useCrmLabels(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.labels(companyId, basePath),
        queryFn: async (): Promise<CrmLabel[]> => {
            const res = await listCrmLabels({ company_id: companyId }, token, basePath);
            return res.data.items;
        },
        enabled: hasActiveApiSession(token) && !!companyId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useAgentUploadsOverview(
    companyId: number | string | undefined,
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.agentUploadsOverview(companyId, basePath),
        queryFn: async (): Promise<AgentUploadOverview> => {
            const res = await getAgentUploadsOverview({ company_id: companyId }, token, basePath);
            return res.data;
        },
        enabled: hasActiveApiSession(token) && !!companyId,
        staleTime: 1000 * 60,
    });
}

export function useCrmLeadsAnalytics(
    params: CrmLeadsAnalyticsParams = {},
    basePath: ApiRoleBasePath = "/admin"
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CRM_KEYS.leadsAnalytics(params, basePath),
        queryFn: async (): Promise<CrmLeadsAnalytics> => {
            const res = await getCrmLeadsAnalytics(params, token, basePath);
            return res.data;
        },
        enabled: hasActiveApiSession(token) && !!params.company_id,
        staleTime: 1000 * 60,
    });
}

export function useCreateLead(
    options?: { onSuccess?: (lead: LeadApiItem) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: CreateLeadPayload) => createLead(payload, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            options?.onSuccess?.(res.data.lead);
        },
    });
}

export function useUpdateLead(
    options?: { onSuccess?: (lead: LeadApiItem) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            leadId,
            payload,
        }: {
            leadId: number | string;
            payload: UpdateLeadPayload;
        }) => updateLead(leadId, payload, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            if (res.data.lead.linked_to_map || res.data.lead.company_location_id) {
                queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
            }
            options?.onSuccess?.(res.data.lead);
        },
    });
}

export function useDeleteLead(
    options?: { onSuccess?: (deletedLeadId: number) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            leadId,
            companyId,
        }: {
            leadId: number | string;
            companyId: number | string | undefined;
        }) => deleteLead(leadId, companyId, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            // Deleting a lead unlinks any saved map location tied to it.
            queryClient.invalidateQueries({ queryKey: SAVED_LOCATION_KEYS.all });
            options?.onSuccess?.(res.data.deleted_lead_id);
        },
    });
}

export function useAddLeadNote(
    options?: { onSuccess?: (note: LeadNote) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            leadId,
            payload,
        }: {
            leadId: number | string;
            payload: AddLeadNotePayload;
        }) => addLeadNote(leadId, payload, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            options?.onSuccess?.(res.data.note);
        },
    });
}

export function useAddLeadActivity(
    options?: { onSuccess?: (activity: LeadActivity) => void },
    basePath: ApiRoleBasePath = "/admin"
) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            leadId,
            payload,
        }: {
            leadId: number | string;
            payload: AddLeadActivityPayload;
        }) => addLeadActivity(leadId, payload, token, basePath),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
            options?.onSuccess?.(res.data.activity);
        },
    });
}

export function useCreateCrmPipeline(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string; name: string }) =>
            createCrmPipeline(payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useUpdateCrmPipeline(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            pipelineId,
            payload,
        }: {
            pipelineId: number | string;
            payload: { company_id?: number | string; name?: string; sort_order?: number };
        }) => updateCrmPipeline(pipelineId, payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useDeleteCrmPipeline(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            pipelineId,
            payload,
        }: {
            pipelineId: number | string;
            payload: { company_id?: number | string; force?: boolean };
        }) => deleteCrmPipeline(pipelineId, payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useCreateCrmLabel(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string; name: string; color: string }) =>
            createCrmLabel(payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useUpdateCrmLabel(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            labelId,
            payload,
        }: {
            labelId: number | string;
            payload: { company_id?: number | string; name?: string; color?: string };
        }) => updateCrmLabel(labelId, payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useReorderCrmLabels(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string; ordered_label_ids: Array<number | string> }) =>
            reorderCrmLabels(payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useDeleteCrmLabel(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({
            labelId,
            payload,
        }: {
            labelId: number | string;
            payload: { company_id?: number | string; force?: boolean };
        }) => deleteCrmLabel(labelId, payload, token, basePath),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function useImportCrmLeads(basePath: ApiRoleBasePath = "/admin") {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: ImportLeadsPayload) => importCrmLeads(payload, token, basePath),
        // Invalidate even on partial success so the kanban/list reflects imported rows.
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: CRM_KEYS.all });
        },
    });
}

export function usePreviewImportCrmLeads(basePath: ApiRoleBasePath = "/admin") {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: ImportLeadsPayload) => previewImportCrmLeads(payload, token, basePath),
    });
}

export function useCrmLeadsExport(
    basePath: ApiRoleBasePath = "/admin",
    options?: { onSuccess?: () => void; onError?: (error: Error) => void }
) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: async (params: ExportLeadsParams) => {
            const { blob, filename } = await downloadCrmLeadsExport(params, token, basePath);
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => {
                window.URL.revokeObjectURL(url);
            }, 500);
        },
        onSuccess: () => {
            options?.onSuccess?.();
        },
        onError: (error: Error) => {
            options?.onError?.(error);
        },
    });
}
