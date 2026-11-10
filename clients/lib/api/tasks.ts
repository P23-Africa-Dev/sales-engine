import { apiRequest, ApiEnvelope, ApiRequestError } from "./onboarding";
import { getSupportAwareApiTransport } from "@/lib/auth/support-session";

export type ApiTaskStatus =
  | "pending"
  | "in_progress"
  | "paused"
  | "resumed"
  | "completed"
  | "cancelled";
export type ApiTaskPriority = "high" | "medium" | "low";
export type TaskAssigneeRole = "owner" | "admin" | "supervisor" | "agent";

export type TaskAssignee = {
  id: number;
  name: string;
  email: string;
  role: TaskAssigneeRole;
};

export type TaskApiItem = {
  id: number;
  company_id: number | string;
  project_id?: number | string | null;
  assigned_agent_id: number | string | null;
  assigned_agent_ids?: Array<number | string>;
  assigned_users?: Array<{ id: number; name: string }>;
  created_by_user_id?: number | string;
  title: string;
  type?: string;
  description?: string;
  status: ApiTaskStatus;
  location?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  has_trackable_location?: boolean;
  due_date?: string;
  started_at?: string | null;
  paused_at?: string | null;
  resumed_at?: string | null;
  completed_at?: string | null;
  required_actions?: string[];
  priority?: ApiTaskPriority;
  minimum_photos_required?: number;
  visit_verification_required?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  project?: {
    id: number;
    name: string;
    status: string;
    priority: string | null;
  } | null;
  creator?: {
    id: number;
    name: string;
    email: string;
  };
  assignee?: {
    id: number;
    name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
  latest_reassignment?: TaskReassignmentItem | null;
  proofs?: TaskProofItem[];
};

export type TaskProofItem = {
  id: number;
  uploaded_by_user_id: number;
  file_url: string | null;
  file_name?: string | null;
  mime_type: string;
  size_bytes?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  captured_at?: string | null;
  notes?: string | null;
  uploader?: {
    id: number;
    name: string;
    email: string;
  } | null;
  created_at?: string | null;
};

export type TaskReassignmentItem = {
  id: number;
  task_id: number;
  company_id: number;
  requested_by_user_id: number;
  from_user_id: number;
  to_user_id: number;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  reason?: string | null;
  response_note?: string | null;
  requested_at?: string | null;
  responded_at?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  tracking_transferred_at?: string | null;
  expires_at?: string | null;
  task?: {
    id: number;
    title: string;
    project_id?: number | null;
    due_date?: string | null;
    location?: string | null;
    address?: string | null;
  } | null;
  from_user?: {
    id: number;
    name: string;
    email: string;
  } | null;
  to_user?: {
    id: number;
    name: string;
    email: string;
  } | null;
  requested_by?: {
    id: number;
    name: string;
    email: string;
  } | null;
  responded_by?: {
    id: number;
    name: string;
    email: string;
  } | null;
};

export type ListTasksParams = {
  company_id?: number | string;
  project_id?: number | string;
  status?: ApiTaskStatus;
  assigned_to_me?: boolean;
  page?: number;
};

export type PaginationData = {
  next_page_url: string | null;
  prev_page_url: string | null;
  per_page: number;
  current_page?: number;
  total?: number;
  last_page?: number;
};

export type TasksListData = {
  items: TaskApiItem[];
  pagination: PaginationData;
};

export type TaskAssigneesData = {
  items: TaskAssignee[];
};

export type CreateTaskPayload = {
  company_id: number | string;
  project_id?: number | string | null;
  title: string;
  type?: string;
  description?: string;
  assigned_agent_id?: number | string;
  assigned_agent_ids?: Array<number | string>;
  location?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  due_date?: string;
  required_actions?: string[];
  priority?: ApiTaskPriority;
  minimum_photos_required?: number;
  visit_verification_required?: boolean;
};

export type TaskDetailData = {
  task: TaskApiItem;
};

export type AssignTaskPayload = {
  company_id?: number | string;
  to_user_id?: number | string;
  assigned_agent_id?: number | string;
  assigned_agent_ids?: Array<number | string>;
  reason?: string;
};

export type TaskReassignmentsInboxParams = {
  company_id?: number | string;
  status?: "pending" | "accepted" | "rejected" | "cancelled";
};

export type RespondTaskReassignmentPayload = {
  company_id?: number | string;
  response_note?: string;
};

export type AssignTaskData = {
  reassignment: TaskReassignmentItem;
};

export type TaskReassignmentsInboxData = {
  reassignments: TaskReassignmentItem[];
};

export type UpdateTaskStatusPayload = {
  company_id?: number | string;
  status: ApiTaskStatus;
};

export type UpdateTaskPayload = {
  company_id: number | string;
  title?: string;
  type?: string;
  description?: string;
  location?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  due_date?: string;
  required_actions?: string[];
  priority?: ApiTaskPriority;
  minimum_photos_required?: number;
  visit_verification_required?: boolean;
};

export type CreateSelfTaskPayload = Omit<
  CreateTaskPayload,
  "project_id" | "assigned_agent_id" | "assigned_agent_ids"
>;

export function listTasks(
  params: ListTasksParams,
  token: string
): Promise<ApiEnvelope<TasksListData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.project_id != null) qs.set("project_id", String(params.project_id));
  if (params.status) qs.set("status", params.status);
  if (params.assigned_to_me) qs.set("assigned_to_me", "1");
  if (params.page) qs.set("page", String(params.page));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<TasksListData>({
    method: "GET",
    path: `/tasks${query}`,
    token,
  });
}

export function listTaskAssignees(
  params: { company_id: number | string },
  token: string
): Promise<ApiEnvelope<TaskAssigneesData>> {
  const query = new URLSearchParams({ company_id: String(params.company_id) });

  return apiRequest<TaskAssigneesData>({
    method: "GET",
    path: `/tasks/assignees?${query.toString()}`,
    token,
  });
}

export function createTask(
  payload: CreateTaskPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "POST",
    path: "/tasks",
    body: payload,
    token,
  });
}

export function getTask(
  taskId: number | string,
  params: { company_id?: number | string },
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<TaskDetailData>({
    method: "GET",
    path: `/tasks/${taskId}${query}`,
    token,
  });
}

export function assignTask(
  taskId: number | string,
  payload: AssignTaskPayload,
  token: string
): Promise<ApiEnvelope<AssignTaskData>> {
  return apiRequest<AssignTaskData>({
    method: "PATCH",
    path: `/tasks/${taskId}/assign`,
    body: payload,
    token,
  });
}

export function listTaskReassignmentInbox(
  params: TaskReassignmentsInboxParams,
  token: string
): Promise<ApiEnvelope<TaskReassignmentsInboxData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.status) qs.set("status", params.status);
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<TaskReassignmentsInboxData>({
    method: "GET",
    path: `/tasks/reassignments/inbox${query}`,
    token,
  });
}

export function acceptTaskReassignment(
  reassignmentId: number | string,
  payload: RespondTaskReassignmentPayload,
  token: string
): Promise<ApiEnvelope<AssignTaskData>> {
  return apiRequest<AssignTaskData>({
    method: "POST",
    path: `/tasks/reassignments/${reassignmentId}/accept`,
    body: payload,
    token,
  });
}

export function rejectTaskReassignment(
  reassignmentId: number | string,
  payload: RespondTaskReassignmentPayload,
  token: string
): Promise<ApiEnvelope<AssignTaskData>> {
  return apiRequest<AssignTaskData>({
    method: "POST",
    path: `/tasks/reassignments/${reassignmentId}/reject`,
    body: payload,
    token,
  });
}

export function updateTaskStatus(
  taskId: number | string,
  payload: UpdateTaskStatusPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "PATCH",
    path: `/tasks/${taskId}/status`,
    body: payload,
    token,
  });
}

export function updateTaskStatusAdmin(
  taskId: number | string,
  payload: UpdateTaskStatusPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "PATCH",
    path: `/admin/tasks/${taskId}/status`,
    body: payload,
    token,
  });
}

export function createSelfTask(
  payload: CreateSelfTaskPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "POST",
    path: "/agent/tasks/self",
    body: payload,
    token,
  });
}

export function updateTask(
  taskId: number | string,
  payload: UpdateTaskPayload,
  token: string
): Promise<ApiEnvelope<TaskDetailData>> {
  return apiRequest<TaskDetailData>({
    method: "PATCH",
    path: `/tasks/${taskId}`,
    body: payload,
    token,
  });
}

export function deleteTask(
  taskId: number | string,
  params: { company_id?: number | string },
  token: string
): Promise<ApiEnvelope<{ deleted_task_id: number }>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<{ deleted_task_id: number }>({
    method: "DELETE",
    path: `/tasks/${taskId}${query}`,
    token,
  });
}

export async function uploadTaskProof(
  taskId: number | string,
  formData: FormData,
  token: string
): Promise<ApiEnvelope<{ proof: { id: number; file_url: string | null } }>> {
  const transport = getSupportAwareApiTransport(`/tasks/${taskId}/proofs`, token);
  const response = await fetch(transport.url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...transport.authorizationHeaders,
    },
    body: formData,
  });

  const body = (await response.json()) as ApiEnvelope<{
    proof: { id: number; file_url: string | null };
  }>;
  if (!response.ok || !body.success) {
    throw new ApiRequestError(body.message || "Request failed.", response.status, body.errors);
  }
  return body;
}

export async function replaceTaskProof(
  taskId: number | string,
  proofId: number | string,
  formData: FormData,
  token: string
): Promise<ApiEnvelope<{ proof: TaskProofItem }>> {
  const transport = getSupportAwareApiTransport(`/tasks/${taskId}/proofs/${proofId}`, token);
  const response = await fetch(transport.url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...transport.authorizationHeaders,
    },
    body: formData,
  });

  const body = (await response.json()) as ApiEnvelope<{ proof: TaskProofItem }>;
  if (!response.ok || !body.success) {
    throw new ApiRequestError(body.message || "Request failed.", response.status, body.errors);
  }
  return body;
}

export async function downloadTaskProof(
  taskId: number | string,
  proofId: number | string,
  params: { company_id?: number | string },
  token: string
): Promise<Blob> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const transport = getSupportAwareApiTransport(
    `/tasks/${taskId}/proofs/${proofId}${query}`,
    token,
  );
  const response = await fetch(transport.url, {
    method: "GET",
    headers: {
      Accept: "*/*",
      ...transport.authorizationHeaders,
    },
  });

  if (!response.ok) {
    let message = "Failed to download proof.";
    let errors: Record<string, string[]> | null = null;
    try {
      const payload = (await response.json()) as ApiEnvelope<unknown>;
      if (payload?.message) message = payload.message;
      if (payload?.errors) errors = payload.errors;
    } catch {
      // Non-JSON error body (binary stream failure, gateway HTML, etc.)
    }
    throw new ApiRequestError(message, response.status, errors);
  }

  return response.blob();
}

/** Trigger a browser download from an authenticated proof blob. */
export function triggerProofBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "proof.jpg";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function formatProofBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
