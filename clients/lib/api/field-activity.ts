"use client";

import { apiRequest } from "./onboarding";

export type FieldActivitySettings = {
  enabled: boolean;
  company_id: number;
};

export type FieldActivityAnalytics = {
  from: string;
  to: string;
  totals: {
    active_sessions: number;
    distance_meters: number;
    travel_seconds: number;
    stationary_seconds: number;
    stop_count: number;
    visit_count: number;
    unknown_stop_count: number;
    personal_seconds: number;
    productive_visit_seconds: number;
    travel_efficiency: number | null;
    avg_distance_per_visit_meters: number | null;
  };
  agents: Array<{
    user_id: number;
    name: string | null;
    distance_meters: number;
    travel_seconds: number;
    visit_count: number;
    stop_count: number;
    unknown_stop_count: number;
    days: number;
  }>;
  heatmap_points: Array<{
    latitude: number;
    longitude: number;
    classification: string | null;
    duration_seconds: number;
    arrived_at?: string | null;
  }>;
};

export type FieldStopDto = {
  id: number;
  field_activity_session_id: number;
  arrived_at: string | null;
  departed_at: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  duration_seconds: number;
  classification: string | null;
  classified_by: string | null;
  classified_at: string | null;
  lead_id: number | null;
};

export type JourneyCard = {
  id: number;
  date: string | null;
  status: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  distance_meters: number;
  travel_seconds: number;
  stationary_seconds: number;
  active_seconds: number;
  stop_count: number;
  visit_count: number;
  unknown_stop_count: number;
  travel_efficiency: number | null;
  narrative: string | null;
  attendance_record_id: number | null;
};

export type JourneyTimelineEvent = {
  id: string;
  type: string;
  label: string;
  occurred_at: string | null;
  ended_at?: string | null;
  duration_seconds?: number;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  color: string;
  stop_id?: number;
  classification?: string | null;
  meta?: Record<string, unknown>;
};

export type JourneyDetail = {
  journey: JourneyCard;
  agent: { id: number; name: string | null };
  stats: {
    distance_meters: number;
    travel_seconds: number;
    stationary_seconds: number;
    active_seconds: number;
    stop_count: number;
    visit_count: number;
    unknown_stop_count: number;
    personal_stop_count: number;
    task_count: number;
    meeting_count: number;
    visit_seconds: number;
    personal_seconds: number;
    travel_efficiency: number | null;
    productivity_score: number;
    coverage_score: number | null;
    average_speed_kmh: number | null;
    maximum_speed_kmh: number | null;
    narrative: string | null;
  };
  stops: FieldStopDto[];
  timeline: JourneyTimelineEvent[];
  route: {
    type: string;
    coordinates: [number, number][];
    timestamps: Array<string | null>;
    point_count: number;
    raw_point_count: number;
    downsampled: boolean;
    clock_in: { latitude: number; longitude: number; address?: string | null } | null;
    clock_out: { latitude: number; longitude: number; address?: string | null } | null;
    bounds: {
      min_lng: number;
      min_lat: number;
      max_lng: number;
      max_lat: number;
    } | null;
  } | null;
  navigation: {
    previous_id: number | null;
    next_id: number | null;
    previous_date: string | null;
    next_date: string | null;
  };
  playback: {
    supported: boolean;
    point_count: number;
    duration_seconds: number;
    speeds: string[];
  };
};

export type JourneyHistoryResponse = {
  items: JourneyCard[];
  summary: {
    from: string;
    to: string;
    journey_count: number;
    distance_meters: number;
    stop_count: number;
    visit_count: number;
    unknown_stop_count: number;
    travel_seconds: number;
  };
  pagination: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
  agent: { id: number; name: string | null };
};

export type JourneyListParams = {
  company_id?: number | string;
  from?: string;
  to?: string;
  preset?: "today" | "this_week" | "last_week" | "last_30_days" | "last_90_days" | "custom";
  per_page?: number;
  page?: number;
};

function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    // Laravel's `boolean` rule rejects the string "true"/"false" that
    // String(true) would produce — encode as 1/0 instead.
    qs.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const encoded = qs.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export type FieldActivitySessionDto = {
  id: number;
  company_id: number;
  user_id: number;
  attendance_record_id: number | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  distance_meters: number;
  travel_seconds: number;
  stationary_seconds: number;
  stop_count: number;
  visit_count: number;
  unknown_stop_count: number;
  last_latitude: number | null;
  last_longitude: number | null;
  last_movement_state: string | null;
  last_recorded_at: string | null;
};

export type FieldDailySummaryDto = {
  id: number;
  summary_date: string | null;
  distance_meters: number;
  travel_seconds: number;
  stationary_seconds: number;
  stop_count: number;
  visit_count: number;
  unknown_stop_count: number;
  personal_stop_count: number;
  ignored_stop_count: number;
  narrative: string | null;
  metrics: Record<string, unknown> | null;
  generated_at: string | null;
};

export type FieldActivityTodayResponse = {
  enabled: boolean;
  session: FieldActivitySessionDto | null;
  summary: FieldDailySummaryDto | null;
  stops: FieldStopDto[];
  config: {
    moving_interval_seconds: number;
    stationary_interval_seconds: number;
    stop_dwell_seconds: number;
  };
};

export type FieldPointPayload = {
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  speed_mps?: number | null;
  heading_degrees?: number | null;
  recorded_at: string;
};

export function getFieldActivityToday(token: string, companyId?: number | string) {
  return apiRequest<FieldActivityTodayResponse>({
    method: "GET",
    path: withQuery("/agent/field-activity/today", { company_id: companyId }),
    token,
  });
}

export function getAgentDailySummary(token: string, companyId?: number | string) {
  return apiRequest<{
    summary: FieldDailySummaryDto | null;
    session: FieldActivitySessionDto | null;
    stops: FieldStopDto[];
  }>({
    method: "GET",
    path: withQuery("/agent/field-activity/daily-summary", { company_id: companyId }),
    token,
  });
}

export function recordFieldActivityPoints(
  sessionId: number,
  points: FieldPointPayload[],
  token: string,
  companyId?: number | string,
) {
  return apiRequest<{ persisted_count: number; session: FieldActivitySessionDto }>({
    method: "POST",
    path: `/agent/field-activity/sessions/${sessionId}/points`,
    body: { company_id: companyId, points },
    token,
  });
}

export function getFieldActivitySettings(token: string, companyId?: number) {
  return apiRequest<FieldActivitySettings>({
    method: "GET",
    path: withQuery("/field-activity/settings", { company_id: companyId }),
    token,
  });
}

export function updateFieldActivitySettings(
  payload: { enabled: boolean; company_id?: number },
  token: string,
) {
  return apiRequest<FieldActivitySettings>({
    method: "PUT",
    path: "/field-activity/settings",
    body: payload,
    token,
  });
}

export function getFieldActivityAnalytics(
  params: { from?: string; to?: string; company_id?: number; user_id?: number },
  token: string,
) {
  return apiRequest<FieldActivityAnalytics>({
    method: "GET",
    path: withQuery("/field-activity/analytics", {
      from: params.from,
      to: params.to,
      company_id: params.company_id,
      user_id: params.user_id,
    }),
    token,
  });
}

export function getAgentJourneys(
  userId: number | string,
  params: JourneyListParams,
  token: string,
) {
  return apiRequest<JourneyHistoryResponse>({
    method: "GET",
    path: withQuery(`/field-activity/agents/${userId}/journeys`, {
      company_id: params.company_id,
      from: params.from,
      to: params.to,
      preset: params.preset,
      per_page: params.per_page,
      page: params.page,
    }),
    token,
  });
}

export function getMyJourneys(params: JourneyListParams, token: string) {
  return apiRequest<JourneyHistoryResponse>({
    method: "GET",
    path: withQuery("/agent/field-activity/journeys", {
      company_id: params.company_id,
      from: params.from,
      to: params.to,
      preset: params.preset,
      per_page: params.per_page,
      page: params.page,
    }),
    token,
  });
}

export function getJourneyDetail(
  sessionId: number | string,
  params: {
    company_id?: number | string;
    include_route?: boolean;
    include_timeline?: boolean;
    asAgent?: boolean;
  },
  token: string,
) {
  const base = params.asAgent
    ? `/agent/field-activity/journeys/${sessionId}`
    : `/field-activity/journeys/${sessionId}`;

  return apiRequest<JourneyDetail>({
    method: "GET",
    path: withQuery(base, {
      company_id: params.company_id,
      include_route: params.include_route,
      include_timeline: params.include_timeline,
    }),
    token,
  });
}

export type FieldActivityLiveStopDto = {
  id: number;
  field_activity_session_id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  duration_seconds?: number;
  classification?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
};

export type FieldActivityLiveAgentDto = {
  user_id: number;
  name: string;
  avatar_url: string | null;
  session: {
    id: number;
    status: string;
    started_at: string | null;
    last_latitude: number | null;
    last_longitude: number | null;
    last_movement_state: string | null;
    last_recorded_at: string | null;
  };
  last_latitude: number | null;
  last_longitude: number | null;
  last_movement_state: string | null;
  last_recorded_at: string | null;
  route: {
    coordinates: [number, number][];
    raw_point_count: number;
    point_count: number;
  };
  stops: FieldActivityLiveStopDto[];
};

export type FieldActivityLiveResponse = {
  date: string;
  agents: FieldActivityLiveAgentDto[];
};

export function getFieldActivityLive(
  params: { company_id?: number | string; date?: string },
  token: string,
) {
  return apiRequest<FieldActivityLiveResponse>({
    method: "GET",
    path: withQuery("/field-activity/live", {
      company_id: params.company_id,
      date: params.date,
    }),
    token,
  });
}

export type AgentPendingFieldStop = {
  id: number;
  field_activity_session_id: number;
  arrived_at: string | null;
  departed_at: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  duration_seconds: number;
  classification: string;
  lead_id?: number | null;
};

export type AgentPendingReviewSession = {
  session_id: number;
  started_at: string | null;
  ended_at: string | null;
  status: string | null;
  pending_stop_count: number;
  stops: AgentPendingFieldStop[];
};

export type AgentPendingReviewPayload = {
  pending_stop_count: number;
  pending_session_count: number;
  oldest_pending_date: string | null;
  sessions: AgentPendingReviewSession[];
};

export function getAgentPendingReview(
  params: { company_id?: number | string },
  token: string,
) {
  return apiRequest<AgentPendingReviewPayload>({
    method: "GET",
    path: withQuery("/agent/field-activity/pending-review", {
      company_id: params.company_id,
    }),
    token,
  });
}

export function classifyAgentFieldStop(
  stopId: number,
  payload: {
    company_id?: number;
    classification: string;
    lead_id?: number;
    source?: string;
  },
  token: string,
) {
  return apiRequest<{ stop: AgentPendingFieldStop }>({
    method: "POST",
    path: `/agent/field-activity/stops/${stopId}/classify`,
    body: payload,
    token,
  });
}
