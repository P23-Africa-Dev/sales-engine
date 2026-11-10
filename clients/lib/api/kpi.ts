import { apiRequest, ApiEnvelope } from "./onboarding";

export type KpiStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type KpiPriority = "low" | "medium" | "high" | "critical";
export type KpiCategory =
  | "sales"
  | "customer_visits"
  | "lead_generation"
  | "collection"
  | "survey"
  | "merchandising"
  | "others";

export type KpiStatusCard = {
  id: string;
  label: string;
  count: number;
  pct: number;
};

export type KpiStatusCards = {
  total: number;
  completion_rate: number;
  cards: KpiStatusCard[];
};

export type KpiAssignee = {
  id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
};

export type KpiItem = {
  id: number;
  company_id: number;
  created_by_user_id: number;
  assigned_to_user_id?: number | null;
  name: string;
  category: KpiCategory;
  objective: string;
  target_value: string;
  expected_outcome: string;
  priority: KpiPriority;
  status: KpiStatus;
  start_date: string;
  end_date: string;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  creator?: { id: number; name: string; email: string } | null;
  assignee?: KpiAssignee | null;
  created_at?: string;
  updated_at?: string;
};

export type ListKpisParams = {
  company_id?: number | string;
  status?: KpiStatus;
  priority?: KpiPriority;
  category?: KpiCategory;
  assigned_to_user_id?: number | string;
  search?: string;
  per_page?: number;
  page?: number;
};

export type PaginationData = {
  next_page_url: string | null;
  prev_page_url: string | null;
  per_page: number;
  current_page?: number;
  last_page?: number;
  total?: number;
};

export type KpisListData = {
  items: KpiItem[];
  status_cards: KpiStatusCards;
  pagination: PaginationData;
};

export type CreateKpiPayload = {
  company_id: number | string;
  name: string;
  category: KpiCategory;
  objective: string;
  target_value: string;
  start_date: string;
  end_date: string;
    assigned_to_user_id?: number | string | null;
  priority: KpiPriority;
  expected_outcome: string;
};

export type UpdateKpiPayload = Partial<
  Omit<CreateKpiPayload, "company_id">
> & {
  company_id: number | string;
};

export type UpdateKpiStatusPayload = {
  company_id?: number | string;
  status: KpiStatus;
};

export type KpiDetailData = { kpi: KpiItem };

function buildKpiListQuery(params: ListKpisParams): string {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.status) qs.set("status", params.status);
  if (params.priority) qs.set("priority", params.priority);
  if (params.category) qs.set("category", params.category);
  if (params.assigned_to_user_id != null) {
    qs.set("assigned_to_user_id", String(params.assigned_to_user_id));
  }
  if (params.search) qs.set("search", params.search);
  if (params.per_page != null) qs.set("per_page", String(params.per_page));
  if (params.page != null) qs.set("page", String(params.page));
  return qs.toString() ? `?${qs.toString()}` : "";
}

export function listKpis(
  params: ListKpisParams,
  token: string,
  options?: { agentScope?: boolean }
): Promise<ApiEnvelope<KpisListData>> {
  const query = buildKpiListQuery(params);
  const path = options?.agentScope ? `/agent/kpis${query}` : `/kpis${query}`;

  return apiRequest<KpisListData>({
    method: "GET",
    path,
    token,
  });
}

export function getKpi(
  kpiId: number | string,
  params: { company_id?: number | string },
  token: string,
  options?: { agentScope?: boolean }
): Promise<ApiEnvelope<KpiDetailData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const path = options?.agentScope
    ? `/agent/kpis/${kpiId}${query}`
    : `/kpis/${kpiId}${query}`;

  return apiRequest<KpiDetailData>({
    method: "GET",
    path,
    token,
  });
}

export function createKpi(
  payload: CreateKpiPayload,
  token: string
): Promise<ApiEnvelope<KpiDetailData>> {
  return apiRequest<KpiDetailData>({
    method: "POST",
    path: "/kpis",
    body: payload,
    token,
  });
}

export function updateKpi(
  kpiId: number | string,
  payload: UpdateKpiPayload,
  token: string
): Promise<ApiEnvelope<KpiDetailData>> {
  return apiRequest<KpiDetailData>({
    method: "PATCH",
    path: `/kpis/${kpiId}`,
    body: payload,
    token,
  });
}

export function deleteKpi(
  kpiId: number | string,
  payload: { company_id: number | string },
  token: string
): Promise<ApiEnvelope<KpiDetailData>> {
  return apiRequest<KpiDetailData>({
    method: "DELETE",
    path: `/kpis/${kpiId}`,
    body: payload,
    token,
  });
}

export function updateKpiStatus(
  kpiId: number | string,
  payload: UpdateKpiStatusPayload,
  token: string,
  options?: { adminScope?: boolean; agentScope?: boolean }
): Promise<ApiEnvelope<KpiDetailData>> {
  const path = options?.adminScope
    ? `/admin/kpis/${kpiId}/status`
    : options?.agentScope
      ? `/agent/kpis/${kpiId}/status`
      : `/kpis/${kpiId}/status`;

  return apiRequest<KpiDetailData>({
    method: "PATCH",
    path,
    body: payload,
    token,
  });
}
