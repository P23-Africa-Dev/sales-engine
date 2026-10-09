"use client";

import { ApiEnvelope, ApiRequestError } from "./onboarding";
import { nativeCrmRequest as apiRequest } from "./native-crm";
import { SALES_ENGINE_API_BASE_URL } from "./sales-engine";
import { getSalesEngineToken, getSalesEngineOrgId } from "@/lib/sales-engine/session";


export type ApiRoleBasePath = "/admin" | "/agent";

export type ApiLeadStatus = string;

export type ApiLeadPriority = "high" | "medium" | "low" | "urgent";

export type LeadContact = {
    id?: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    sort_order?: number;
};

export type CrmAssignee = {
    id: number;
    name: string;
    email: string;
    role: "owner" | "admin" | "supervisor" | "agent";
};

export type LeadActor = {
    id: number;
    name: string;
    email: string;
    avatar_url?: string | null;
};

export type LeadNote = {
    id: number;
    lead_id: number;
    company_id: number;
    note: string;
    creator?: LeadActor | null;
    created_at?: string;
    updated_at?: string;
};

export type LeadActivity = {
    id: number;
    lead_id: number;
    company_id: number;
    type: string;
    title?: string | null;
    description?: string | null;
    happened_at?: string | null;
    meta?: Record<string, unknown> | null;
    creator?: LeadActor | null;
    created_at?: string;
    updated_at?: string;
};

export type LeadApiItem = {
    lead_type?: "business" | "individual";
    id: number;
    company_id: number;
    pipeline_id?: number | null;
    company_location_id?: number | null;
    linked_to_map?: boolean;
    created_by_user_id: number;
    assigned_to_user_id?: number | null;
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    contacts?: LeadContact[];
    company_name?: string | null;
    company_email?: string | null;
    website?: string | null;
    position?: string | null;
    profile_urls?: string[] | null;
    source?: string | null;
    status?: ApiLeadStatus | null;
    priority?: ApiLeadPriority | null;
    budget_amount?: number | null;
    budget_currency?: string | null;
    budget?: string | null;
    next_action?: string | null;
    last_interaction?: string | null;
    last_interaction_at?: string | null;
    meta?: Record<string, unknown> | null;
    converted_at?: string | null;
    creator?: LeadActor | null;
    assignee?: LeadActor | null;
    pipeline?: {
        id: number;
        name: string;
        currency_code: string;
    } | null;
    notes?: LeadNote[];
    activities?: LeadActivity[];
    created_at?: string;
    updated_at?: string;
};

export type PaginationData = {
    next_page_url: string | null;
    prev_page_url: string | null;
    per_page: number;
    current_page?: number;
    total?: number;
    last_page?: number;
};

export type ListLeadsParams = {
    company_id?: number | string;
    status?: ApiLeadStatus;
    priority?: ApiLeadPriority;
    pipeline_id?: number | string;
    source?: string;
    search?: string;
    assigned_to_user_id?: number | string;
    per_page?: number;
    page?: number;
    uncategorized?: boolean;
};

export type LeadsListData = {
    items: LeadApiItem[];
    pagination: PaginationData;
};

export type LeadDetailData = {
    lead: LeadApiItem;
};

export type PipelineStage = {
    status: ApiLeadStatus;
    name?: string;
    color?: string;
    count: number;
};

export type PipelineSnapshot = {
    total: number;
    stages: PipelineStage[];
};

export type CreateLeadPayload = {
    company_id: number | string;
    pipeline_id?: number | string;
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    contacts?: LeadContact[];
    company_name?: string | null;
    company_email?: string | null;
    website?: string | null;
    position?: string | null;
    profile_urls?: string[] | null;
    source?: string | null;
    status?: ApiLeadStatus;
    priority?: ApiLeadPriority;
    budget_amount?: number | null;
    budget_currency?: string | null;
    next_action?: string | null;
    last_interaction?: string | null;
    last_interaction_at?: string | null;
    assigned_to_user_id?: number | null;
    meta?: Record<string, unknown> | null;
};

export type UpdateLeadPayload = {
    company_id?: number | string;
    pipeline_id?: number | string;
    name?: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    contacts?: LeadContact[];
    company_name?: string | null;
    company_email?: string | null;
    website?: string | null;
    position?: string | null;
    profile_urls?: string[] | null;
    source?: string | null;
    status?: ApiLeadStatus;
    priority?: ApiLeadPriority;
    budget_amount?: number | null;
    budget_currency?: string | null;
    next_action?: string | null;
    last_interaction?: string | null;
    last_interaction_at?: string | null;
    assigned_to_user_id?: number | null;
    converted_at?: string | null;
    meta?: Record<string, unknown> | null;
};

export type AddLeadNotePayload = {
    company_id?: number | string;
    note: string;
};

export type AddLeadActivityPayload = {
    company_id?: number | string;
    type: string;
    title?: string;
    description?: string;
    happened_at?: string;
    meta?: Record<string, unknown> | null;
};

export type CrmPipeline = {
    id: number;
    company_id: number;
    name: string;
    currency_code: string;
    sort_order: number;
    is_default: boolean;
};

export type CrmLabel = {
    id: number;
    company_id: number;
    name: string;
    slug: string;
    color: string;
    sort_order: number;
    is_default: boolean;
};

export type ImportLeadRow = {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    company_name?: string;
    website?: string;
    position?: string;
    profile_urls?: string | string[];
    source?: string;
    status?: string;
    priority?: ApiLeadPriority;
    budget_amount?: number | string;
    budget_currency?: string;
};

/** Resolve display amount from lead budget fields (falls back to legacy meta.value). */
export function resolveLeadBudgetAmount(lead: Pick<LeadApiItem, "budget_amount" | "meta">): number {
    if (typeof lead.budget_amount === "number" && !Number.isNaN(lead.budget_amount)) {
        return lead.budget_amount;
    }
    if (typeof lead.meta?.value === "number" && !Number.isNaN(lead.meta.value)) {
        return lead.meta.value;
    }
    return 0;
}

export function formatLeadBudgetDisplay(
    lead: Pick<LeadApiItem, "budget_amount" | "budget_currency" | "meta" | "pipeline">,
): string {
    const amount = resolveLeadBudgetAmount(lead);
    if (amount <= 0) {
        return "$ 0";
    }
    const currency = lead.budget_currency ?? lead.pipeline?.currency_code ?? "USD";
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export type FailedImportRow = {
    row_index: number;
    data: ImportLeadRow;
    errors: string[];
};

export type SkippedImportRow = {
    row_index: number;
    data: ImportLeadRow;
    reason: string;
};

export type DuplicatePolicy = "create" | "skip" | "update";

export type ImportLeadsResult = {
    imported_count: number;
    updated_count: number;
    skipped_count: number;
    failed_rows: FailedImportRow[];
    skipped_rows: SkippedImportRow[];
};

export type ImportPreviewDuplicateRow = {
    row_index: number;
    data: ImportLeadRow;
    existing_lead_id: number;
    existing_lead_name: string;
};

export type ImportPreviewResult = {
    total_rows: number;
    valid_count: number;
    duplicate_count: number;
    error_rows: FailedImportRow[];
    duplicate_rows: ImportPreviewDuplicateRow[];
};

export type ImportLeadsPayload = {
    company_id: number | string;
    pipeline_id: number | string;
    rows: ImportLeadRow[];
    duplicate_policy?: DuplicatePolicy;
};

export type ExportLeadsParams = {
    company_id: number | string;
    format?: "csv" | "xlsx";
    search?: string;
    status?: ApiLeadStatus;
    priority?: ApiLeadPriority;
    pipeline_id?: number | string;
    source?: string;
    assigned_to_user_id?: number | string;
    lead_ids?: Array<number | string>;
};

export type AgentUploadOverview = {
    total_uploaded_leads: number;
    top_agent: {
        id: number;
        name: string;
        email: string;
        avatar_url: string | null;
        total_uploads: number;
    } | null;
    recent_leads: Array<{
        id: number;
        name: string;
        status: string;
        source?: string | null;
        created_at?: string | null;
        creator?: LeadActor | null;
    }>;
    source_filter: string;
};

export type CrmDailyTrendPoint = {
    day: string;
    value: number;
    date: string;
};

export type CrmLeadsAnalytics = {
    total_leads: number;
    week_growth_percent: number;
    week_growth_direction: "up" | "down" | "flat";
    daily_trend: CrmDailyTrendPoint[];
    month_new_leads: number;
    month_label: string;
    highlight_day: string | null;
};

export type CrmLeadsAnalyticsParams = Pick<
    ListLeadsParams,
    "company_id" | "pipeline_id" | "status" | "source" | "search"
>;

function buildQuery(params: Record<string, string | number | undefined>) {
    const qs = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
            qs.set(key, String(value));
        }
    });

    const query = qs.toString();
    return query ? `?${query}` : "";
}

function withBase(_basePath: ApiRoleBasePath, path: string) {
    return path;
}

export function listCrmAssignees(
    companyId: number | string,
    token: string,
    basePath: ApiRoleBasePath = "/admin",
): Promise<ApiEnvelope<{ items: CrmAssignee[] }>> {
    const query = buildQuery({ company_id: companyId });

    return apiRequest<{ items: CrmAssignee[] }>({
        method: "GET",
        path: withBase(basePath, `/crm/assignees${query}`),
        token,
    });
}

export function listLeads(
    params: ListLeadsParams,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<LeadsListData>> {
    const query = buildQuery({
        company_id: params.company_id,
        status: params.status,
        priority: params.priority,
        pipeline_id: params.pipeline_id,
        source: params.source,
        search: params.search,
        assigned_to_user_id: params.assigned_to_user_id,
        per_page: params.per_page,
        page: params.page,
        uncategorized: params.uncategorized ? 1 : undefined,
    });

    return apiRequest<LeadsListData>({
        method: "GET",
        path: withBase(basePath, `/crm/leads${query}`),
        token,
    });
}

export function getLead(
    leadId: number | string,
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<LeadDetailData>> {
    const query = buildQuery({ company_id: params.company_id });

    return apiRequest<LeadDetailData>({
        method: "GET",
        path: withBase(basePath, `/crm/leads/${leadId}${query}`),
        token,
    });
}

export function createLead(
    payload: CreateLeadPayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<LeadDetailData>> {
    return apiRequest<LeadDetailData>({
        method: "POST",
        path: withBase(basePath, "/crm/leads"),
        body: payload,
        token,
    });
}

export function updateLead(
    leadId: number | string,
    payload: UpdateLeadPayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<LeadDetailData>> {
    return apiRequest<LeadDetailData>({
        method: "PATCH",
        path: withBase(basePath, `/crm/leads/${leadId}/native`),
        body: payload,
        token,
    });
}

export function deleteLead(
    leadId: number | string,
    companyId: number | string | undefined,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ deleted_lead_id: number }>> {
    return apiRequest<{ deleted_lead_id: number }>({
        method: "DELETE",
        path: withBase(basePath, `/crm/leads/${leadId}`),
        body: companyId != null ? { company_id: companyId } : undefined,
        token,
    });
}

export function getLeadPipeline(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<PipelineSnapshot>> {
    const query = buildQuery({ company_id: params.company_id });

    return apiRequest<PipelineSnapshot>({
        method: "GET",
        path: withBase(basePath, `/crm/leads/pipeline${query}`),
        token,
    });
}

export function addLeadNote(
    leadId: number | string,
    payload: AddLeadNotePayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ note: LeadNote }>> {
    return apiRequest<{ note: LeadNote }>({
        method: "POST",
        path: withBase(basePath, `/crm/leads/${leadId}/notes`),
        body: payload,
        token,
    });
}

export function addLeadActivity(
    leadId: number | string,
    payload: AddLeadActivityPayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ activity: LeadActivity }>> {
    return apiRequest<{ activity: LeadActivity }>({
        method: "POST",
        path: withBase(basePath, `/crm/leads/${leadId}/activities`),
        body: payload,
        token,
    });
}

export function listCrmPipelines(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ items: CrmPipeline[] }>> {
    const query = buildQuery({ company_id: params.company_id });
    return apiRequest<{ items: CrmPipeline[] }>({
        method: "GET",
        path: withBase(basePath, `/crm/pipelines${query}`),
        token,
    });
}

export function createCrmPipeline(
    payload: { company_id: number | string; name: string },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ pipeline: CrmPipeline }>> {
    return apiRequest<{ pipeline: CrmPipeline }>({
        method: "POST",
        path: withBase(basePath, "/crm/pipelines"),
        body: payload,
        token,
    });
}

export function updateCrmPipeline(
    pipelineId: number | string,
    payload: { company_id?: number | string; name?: string; sort_order?: number },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ pipeline: CrmPipeline }>> {
    return apiRequest<{ pipeline: CrmPipeline }>({
        method: "PATCH",
        path: withBase(basePath, `/crm/pipelines/${pipelineId}`),
        body: payload,
        token,
    });
}

export function deleteCrmPipeline(
    pipelineId: number | string,
    payload: { company_id?: number | string; force?: boolean },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<
    ApiEnvelope<{
        deleted_pipeline_id: number;
        reassigned_leads_count: number;
        reassigned_to_pipeline_id?: number | null;
        reassigned_to_pipeline_name?: string | null;
    }>
> {
    return apiRequest<{
        deleted_pipeline_id: number;
        reassigned_leads_count: number;
        reassigned_to_pipeline_id?: number | null;
        reassigned_to_pipeline_name?: string | null;
    }>({
        method: "POST",
        path: withBase(basePath, `/crm/pipelines/${pipelineId}/delete`),
        body: payload,
        token,
    });
}

export type CrmPreferences = {
    preferred_pipeline_id: number | null;
    company_default_pipeline_id: number | null;
};

export function getCrmPreferences(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<CrmPreferences>> {
    const query = buildQuery({ company_id: params.company_id });
    return apiRequest<CrmPreferences>({
        method: "GET",
        path: withBase(basePath, `/crm/preferences${query}`),
        token,
    });
}

export function setPreferredCrmPipeline(
    payload: { company_id: number | string; pipeline_id: number | string },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<CrmPreferences>> {
    return apiRequest<CrmPreferences>({
        method: "PUT",
        path: withBase(basePath, "/crm/preferences/preferred-pipeline"),
        body: payload,
        token,
    });
}

export function setCompanyDefaultCrmPipeline(
    pipelineId: number | string,
    payload: { company_id?: number | string },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ pipeline: CrmPipeline }>> {
    return apiRequest<{ pipeline: CrmPipeline }>({
        method: "POST",
        path: withBase(basePath, `/crm/pipelines/${pipelineId}/set-default`),
        body: payload,
        token,
    });
}

export function listCrmLabels(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ items: CrmLabel[] }>> {
    const query = buildQuery({ company_id: params.company_id });
    return apiRequest<{ items: CrmLabel[] }>({
        method: "GET",
        path: withBase(basePath, `/crm/labels${query}`),
        token,
    });
}

export function createCrmLabel(
    payload: { company_id: number | string; name: string; color: string },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ label: CrmLabel }>> {
    return apiRequest<{ label: CrmLabel }>({
        method: "POST",
        path: withBase(basePath, "/crm/labels"),
        body: payload,
        token,
    });
}

export function updateCrmLabel(
    labelId: number | string,
    payload: { company_id?: number | string; name?: string; color?: string },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ label: CrmLabel }>> {
    return apiRequest<{ label: CrmLabel }>({
        method: "PATCH",
        path: withBase(basePath, `/crm/labels/${labelId}`),
        body: payload,
        token,
    });
}

export function deleteCrmLabel(
    labelId: number | string,
    payload: { company_id?: number | string; force?: boolean },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ deleted_label_id: number; deleted_leads_count: number; reassigned_to_label_slug?: string | null; reassigned_to_label_name?: string | null }>> {
    return apiRequest<{ deleted_label_id: number; deleted_leads_count: number; reassigned_to_label_slug?: string | null; reassigned_to_label_name?: string | null }>({
        method: "POST",
        path: withBase(basePath, `/crm/labels/${labelId}/delete`),
        body: payload,
        token,
    });
}

export function reorderCrmLabels(
    payload: { company_id: number | string; ordered_label_ids: Array<number | string> },
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<{ items: CrmLabel[] }>> {
    return apiRequest<{ items: CrmLabel[] }>({
        method: "POST",
        path: withBase(basePath, "/crm/labels/reorder"),
        body: payload,
        token,
    });
}

export function importCrmLeads(
    payload: ImportLeadsPayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<ImportLeadsResult>> {
    return apiRequest<ImportLeadsResult>({
        method: "POST",
        path: withBase(basePath, "/crm/leads/import"),
        body: payload,
        token,
    });
}

export function previewImportCrmLeads(
    payload: ImportLeadsPayload,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<ImportPreviewResult>> {
    return apiRequest<ImportPreviewResult>({
        method: "POST",
        path: withBase(basePath, "/crm/leads/import/preview"),
        body: payload,
        token,
    });
}

export async function downloadCrmLeadsExport(
    params: ExportLeadsParams,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<{ blob: Blob; filename: string }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        if (key === "lead_ids" && Array.isArray(value)) {
            value.forEach((id) => query.append("lead_ids[]", String(id)));
            return;
        }
        query.set(key, String(value));
    });

    const orgId = getSalesEngineOrgId();
    const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/crm/leads/export?${query.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${getSalesEngineToken() || token}`, ...(orgId ? { "X-Organization-Id": orgId } : {}), Accept: "text/csv" },
    });

    if (!response.ok) {
        let message = `Leads export failed with status ${response.status}`;
        try {
            const payload = (await response.json()) as ApiEnvelope<unknown> & { errors?: Record<string, string[]> };
            message = payload.message || message;
            if (payload.errors) {
                throw new ApiRequestError(message, response.status, payload.errors);
            }
        } catch (err) {
            if (err instanceof ApiRequestError) throw err;
            // Fall through to generic error when response is not JSON.
        }

        throw new Error(message);
    }

    const disposition = response.headers.get("content-disposition") ?? "";
    const utf8FilenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
    const filename = utf8FilenameMatch?.[1]
        ? decodeURIComponent(utf8FilenameMatch[1])
        : (filenameMatch?.[1] ?? `crm-leads-export.${params.format === "xlsx" ? "xlsx" : "csv"}`);

    return { blob: await response.blob(), filename };
}

export function getAgentUploadsOverview(
    params: Pick<ListLeadsParams, "company_id">,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<AgentUploadOverview>> {
    const query = buildQuery({ company_id: params.company_id });

    return apiRequest<AgentUploadOverview>({
        method: "GET",
        path: withBase(basePath, `/crm/leads/agent-uploads-overview${query}`),
        token,
    });
}

export function getCrmLeadsAnalytics(
    params: CrmLeadsAnalyticsParams,
    token: string,
    basePath: ApiRoleBasePath = "/admin"
): Promise<ApiEnvelope<CrmLeadsAnalytics>> {
    const query = buildQuery({
        company_id: params.company_id,
        pipeline_id: params.pipeline_id,
        status: params.status,
        source: params.source,
        search: params.search,
    });

    return apiRequest<CrmLeadsAnalytics>({
        method: "GET",
        path: withBase(basePath, `/crm/leads/analytics${query}`),
        token,
    });
}
