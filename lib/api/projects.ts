"use client";

import { apiRequest, ApiEnvelope, ApiRequestError } from "./onboarding";
import { enqueueOfflineHttpMutation } from "@/lib/offline/queue";
import { getSupportAwareApiTransport } from "@/lib/auth/support-session";

export type TaskSummary = {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  completed_percentage: number;
  pending_percentage: number;
};

export type ApiProjectStatus = "active" | "planning" | "completed";
export type ApiProjectPriority = "high" | "medium" | "low";
export type ApiProjectType = "sales" | "inspection" | "deployment";

export type ProjectManager = {
  id: number;
  name: string;
  email: string;
};

export type ProjectCreator = {
  id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
};

export type ProjectAttachment = {
  id: number;
  original_name: string;
  mime_type?: string;
};

export type ProjectApiItem = {
  id: number;
  company_id?: number | string;
  created_by_user_id?: number;
  project_manager_user_id?: number;
  name: string;
  description?: string;
  type?: ApiProjectType | null;
  status: ApiProjectStatus;
  priority: ApiProjectPriority | null;
  start_date?: string;
  end_date?: string | null;
  duration_days?: number | null;
  territory_zone?: string | null;
  notes?: string | null;
  creator?: ProjectCreator | null;
  manager?: ProjectManager | null;
  assigned_team?: Array<{ id: number; name: string; email?: string }>;
  attachments?: ProjectAttachment[];
  task_summary: TaskSummary;
  created_at?: string;
  updated_at?: string;
};

export type ProjectApiDetail = ProjectApiItem;

export type ListProjectsParams = {
  company_id?: number | string;
  status?: ApiProjectStatus;
  search?: string;
  page?: number;
};

export type CreateProjectPayload = {
  company_id: number | string;
  name: string;
  description?: string;
  type?: ApiProjectType | null;
  status?: ApiProjectStatus;
  priority?: ApiProjectPriority | null;
  start_date: string;
  end_date?: string | null;
  project_manager_user_id?: number | null;
  project_manager?: number | null;
  assigned_team?: number[];
  territory_zone?: string | null;
  notes?: string | null;
  attachments?: File[];
};

export type UpdateProjectPayload = Partial<
  Omit<CreateProjectPayload, "company_id" | "attachments">
> & {
  attachments?: File[];
};

function toFormData(
  payload: CreateProjectPayload | UpdateProjectPayload
): FormData {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (key === "attachments" && Array.isArray(value)) {
      value.forEach((file) => formData.append("attachments[]", file as File));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(`${key}[]`, String(item)));
      return;
    }

    formData.append(key, String(value));
  });

  return formData;
}

export type PaginationData = {
  next_page_url: string | null;
  prev_page_url: string | null;
  per_page: number;
  current_page?: number;
  total?: number;
  last_page?: number;
};

export type ProjectPerformanceAnalytics = {
  project_progress: number;
  task_completion: number;
  timeline_consumption: number;
  status: "POOR" | "FAIR" | "GOOD" | "EXCELLENT";
};

export type NonCommencedAgentsAnalytics = {
  assigned_agents: number;
  not_started: number;
  percentage: number;
  previous_week_not_started: number;
  current_week_not_started: number;
  trend_direction: "improved" | "worsened" | "flat";
};

export type ProjectsAnalyticsData = {
  project_performance: ProjectPerformanceAnalytics;
  non_commenced_agents: NonCommencedAgentsAnalytics;
};

export type ProjectsListData = {
  items: ProjectApiItem[];
  pagination: PaginationData;
  analytics?: ProjectsAnalyticsData;
};

export type ProjectDetailData = {
  project: ProjectApiDetail;
};

export function listProjects(
  params: ListProjectsParams,
  token: string,
  basePath = ""
): Promise<ApiEnvelope<ProjectsListData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<ProjectsListData>({
    method: "GET",
    path: `${basePath}/projects${query}`,
    token,
  });
}

export function getProject(
  id: number | string,
  token: string,
  basePath = ""
): Promise<ApiEnvelope<ProjectDetailData>> {
  return apiRequest<ProjectDetailData>({
    method: "GET",
    path: `${basePath}/projects/${id}`,
    token,
  });
}

export function createProject(
  payload: CreateProjectPayload,
  token: string
): Promise<ApiEnvelope<ProjectDetailData>> {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  if (isOffline) {
    if (payload.attachments && payload.attachments.length > 0) {
      throw new ApiRequestError(
        "Project attachments require connectivity. Save without attachments and upload later.",
        0,
        null
      );
    }
    return enqueueOfflineHttpMutation({
      method: "POST",
      path: "/projects",
      body: payload,
    }).then((queueId) => ({
      success: true,
      message: "Project queued offline and will sync automatically.",
      data: {} as ProjectDetailData,
      errors: null,
      meta: { queued_offline: true, queue_id: queueId },
    }));
  }

  const transport = getSupportAwareApiTransport("/projects", token);
  return fetch(transport.url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...transport.authorizationHeaders,
    },
    body: toFormData(payload),
  }).then(async (response) => {
    const payloadData = (await response.json()) as ApiEnvelope<ProjectDetailData>;
    if (!response.ok || !payloadData.success) {
      throw new ApiRequestError(
        payloadData.message || "Request failed.",
        response.status,
        payloadData.errors
      );
    }
    return payloadData;
  });
}

export function updateProject(
  id: number | string,
  payload: UpdateProjectPayload,
  token: string
): Promise<ApiEnvelope<ProjectDetailData>> {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  if (isOffline) {
    if (payload.attachments && payload.attachments.length > 0) {
      throw new ApiRequestError(
        "Project attachments require connectivity. Save without attachments and upload later.",
        0,
        null
      );
    }
    return enqueueOfflineHttpMutation({
      method: "PATCH",
      path: `/projects/${id}`,
      body: payload,
    }).then((queueId) => ({
      success: true,
      message: "Project update queued offline and will sync automatically.",
      data: {} as ProjectDetailData,
      errors: null,
      meta: { queued_offline: true, queue_id: queueId },
    }));
  }

  const transport = getSupportAwareApiTransport(`/projects/${id}`, token);
  return fetch(
    transport.url,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        ...transport.authorizationHeaders,
      },
      body: toFormData(payload),
    }
  ).then(async (response) => {
    const payloadData = (await response.json()) as ApiEnvelope<ProjectDetailData>;
    if (!response.ok || !payloadData.success) {
      throw new ApiRequestError(
        payloadData.message || "Request failed.",
        response.status,
        payloadData.errors
      );
    }
    return payloadData;
  });
}

// ─── Internal Users (for project lead selection) ─────────────────────────────

export type InternalUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export type InternalUsersParams = {
  role?: "admin" | "supervisor" | "agent";
  company_id?: number | string;
};

export function fetchInternalUsers(
  params: InternalUsersParams,
  token: string
): Promise<ApiEnvelope<InternalUser[]>> {
  const qs = new URLSearchParams();
  if (params.role) qs.set("role", params.role);
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<InternalUser[]>({
    method: "GET",
    path: `/internal-users${query}`,
    token,
  });
}
