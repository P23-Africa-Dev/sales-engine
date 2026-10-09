import {
  apiRequest,
  ApiEnvelope,
  ApiRequestError,
  API_BASE_URL,
} from "./onboarding";
import { getSupportAwareApiTransport } from "@/lib/auth/support-session";
import type { TaskApiItem } from "./tasks";
import type {
  StartTrackingPayload,
  RecordLocationPayload,
  TrackingSession,
  TaskRoute,
} from "@/types/tracking";

export type { TrackingSession, TaskRoute };

function normalizeBooleanQuery(value: unknown, fallback: boolean): "true" | "false" {
  if (typeof value === "boolean") return value ? "true" : "false";

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "null" || normalized === "undefined") {
    return fallback ? "true" : "false";
  }

  if (["1", "true", "yes", "on", "all"].includes(normalized)) return "true";
  if (["0", "false", "no", "off", "online"].includes(normalized)) return "false";

  return fallback ? "true" : "false";
}

// ─── Start tracking ────────────────────────────────────────────────────────

export interface StartTrackingResponse {
  task: TaskApiItem;
  tracking: TrackingSession;
  near_destination?: boolean;
  arrived: boolean;
  proximity_state?: "in_progress" | "near_destination" | "arrived" | "completed";
  distance_to_destination_meters?: number | null;
  distance_remaining_meters?: number | null;
  movement_started?: boolean;
}

export function startTaskTracking(
  taskId: number | string,
  payload: StartTrackingPayload,
  token: string
): Promise<ApiEnvelope<StartTrackingResponse>> {
  return apiRequest<StartTrackingResponse>({
    method: "POST",
    path: `/agent/tasks/${taskId}/start`,
    body: payload,
    token,
  });
}

// ─── Record location ───────────────────────────────────────────────────────

export interface RecordLocationApiResponse {
  task?: TaskApiItem;
  tracking?: TrackingSession;
  received_points: number;
  persisted_points: number;
  near_destination?: boolean;
  arrived: boolean;
  proximity_state?: "in_progress" | "near_destination" | "arrived" | "completed";
  distance_to_destination_meters?: number | null;
  distance_remaining_meters?: number | null;
  movement_started?: boolean;
}

export function recordTaskLocation(
  taskId: number | string,
  payload: RecordLocationPayload,
  token: string
): Promise<ApiEnvelope<RecordLocationApiResponse>> {
  return apiRequest<RecordLocationApiResponse>({
    method: "POST",
    path: `/agent/tasks/${taskId}/location`,
    body: payload,
    token,
  });
}

// ─── Complete task ─────────────────────────────────────────────────────────

export interface CompleteTrackingResponse {
  task: TaskApiItem;
  tracking: TrackingSession;
  proofs: Array<{ id: number; file_url: string | null; mime_type: string }>;
}

export async function completeTaskTracking(
  taskId: number | string,
  formData: FormData,
  token: string
): Promise<ApiEnvelope<CompleteTrackingResponse>> {
  const transport = getSupportAwareApiTransport(
    `/agent/tasks/${taskId}/complete`,
    token,
    API_BASE_URL,
  );
  const response = await fetch(
    transport.url,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...transport.authorizationHeaders,
      },
      body: formData,
    }
  );

  const body = (await response.json()) as ApiEnvelope<CompleteTrackingResponse>;

  if (!response.ok || !body.success) {
    throw new ApiRequestError(
      body.message || "Request failed.",
      response.status,
      body.errors
    );
  }

  return body;
}

// ─── Get route ─────────────────────────────────────────────────────────────

export function getTaskRoute(
  taskId: number | string,
  params: {
    company_id: number | string;
    role?: "agent" | "management";
    include_points?: boolean | string | number | null;
    limit?: number;
  },
  token: string
): Promise<ApiEnvelope<TaskRoute>> {
  const { company_id, role = "agent", include_points = true, limit = 500 } =
    params;
  const prefix = role === "management" ? "admin" : "agent";
  const qs = new URLSearchParams({
    company_id: String(company_id),
    include_points: normalizeBooleanQuery(include_points, true),
    limit: String(limit),
  });

  return apiRequest<TaskRoute>({
    method: "GET",
    path: `/${prefix}/tasks/${taskId}/route?${qs.toString()}`,
    token,
  });
}

// ─── List agent tasks ──────────────────────────────────────────────────────

import type { TasksListData, ListTasksParams } from "./tasks";

export function listAgentTasks(
  params: ListTasksParams,
  token: string
): Promise<ApiEnvelope<TasksListData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));

  return apiRequest<TasksListData>({
    method: "GET",
    path: `/agent/tasks${qs.toString() ? `?${qs.toString()}` : ""}`,
    token,
  });
}

// ─── List agent locations ─────────────────────────────────────────────────

export type AgentLocationListParams = {
  company_id?: number | string;
  user_id?: number | string;
  task_id?: number | string;
  include_offline?: boolean | string | number | null;
  stale_after_seconds?: number;
  limit?: number;
};

export type AgentLocationListData = {
  items: Array<{
    agent: {
      id: number;
      name: string | null;
      email?: string | null;
      avatar?: string | null;
      internal_role?: string | null;
    };
    task: {
      id: number | null;
      title: string | null;
      status: string | null;
      tracking_session_id: number | null;
      address?: string | null;
      location?: string | null;
      destination_latitude?: number | null;
      destination_longitude?: number | null;
    };
    location: {
      latitude: number;
      longitude: number;
      accuracy_meters?: number | null;
      speed_mps?: number | null;
      heading_degrees?: number | null;
      event_type?: string | null;
      arrived?: boolean;
      near_destination?: boolean;
      distance_to_destination_meters?: number | null;
      distance_remaining_meters?: number | null;
      eta_seconds?: number | null;
      route_deviation_meters?: number | null;
      recorded_at?: string | null;
    };
    status: {
      is_online: boolean;
      is_stale: boolean;
      stale_after_seconds: number;
      age_seconds: number | null;
      last_seen_at: string | null;
      proximity_state?: "in_progress" | "near_destination" | "arrived" | "completed";
      operational_status?:
        | "available"
        | "en_route"
        | "near_destination"
        | "destination_reached"
        | "completed"
        | "delayed"
        | "offline";
    };
    updated_at?: string | null;
  }>;
  meta: {
    company_id: number;
    stale_after_seconds: number;
    generated_at: string;
  };
};

export function listAgentLocations(
  params: AgentLocationListParams,
  token: string
): Promise<ApiEnvelope<AgentLocationListData>> {
  const qs = new URLSearchParams();
  if (params.company_id != null) qs.set("company_id", String(params.company_id));
  if (params.user_id != null) qs.set("user_id", String(params.user_id));
  if (params.task_id != null) qs.set("task_id", String(params.task_id));
  if (params.include_offline != null) {
    qs.set("include_offline", normalizeBooleanQuery(params.include_offline, true));
  }
  if (params.stale_after_seconds != null) qs.set("stale_after_seconds", String(params.stale_after_seconds));
  if (params.limit != null) qs.set("limit", String(params.limit));

  return apiRequest<AgentLocationListData>({
    method: "GET",
    path: `/agents/locations${qs.toString() ? `?${qs.toString()}` : ""}`,
    token,
  });
}

