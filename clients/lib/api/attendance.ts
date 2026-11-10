"use client";

import { apiRequest } from "./onboarding";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type AttendanceStatus = "present" | "late" | "auto_clocked_out" | "clocked_out" | "absent";

export type PaginationData = {
  total?: number;
  per_page: number;
  current_page?: number;
  last_page?: number;
  next_page_url: string | null;
  prev_page_url: string | null;
};

// ─── Agent Types ──────────────────────────────────────────────────────────────

export type AgentAttendanceRecord = {
  id: number | string;
  company_id: number | string;
  user_id: number;
  attendance_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  status: AttendanceStatus;
  work_duration_minutes: number | null;
  work_duration_hours: number | null;
  is_late: boolean;
  is_auto_clocked_out: boolean;
  metadata: {
    clock_in_latitude?: number;
    clock_in_longitude?: number;
    clock_out_latitude?: number;
    clock_out_longitude?: number;
    [key: string]: unknown;
  } | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AttendanceTodayResponse = {
  working_day: boolean;
  window_active: boolean;
  can_clock_in: boolean;
  can_clock_out: boolean;
  record: AgentAttendanceRecord | null;
  status: string;
  message: string;
};

export type ClockPayload = {
  company_id: number | string;
  recorded_at: string;
  latitude: number;
  longitude: number;
};

export type AttendanceHistoryParams = {
  company_id?: number | string;
  from_date?: string;
  to_date?: string;
  status?: string;
  per_page?: number;
  page?: number;
};

export type AttendanceHistoryResponse = {
  items: AgentAttendanceRecord[];
  pagination: PaginationData;
};

export type AttendanceStatsResponse = {
  present_days?: number;
  late_days?: number;
  absent_days?: number;
  undertime_days?: number;
  total_days?: number;
  [key: string]: number | undefined;
};

export type PayrollSummaryResponse = {
  [key: string]: unknown;
};

// ─── Management: Per-Agent History Types ──────────────────────────────────────

export type AgentAttendanceHistorySummary = {
  present_days: number;
  late_days: number;
  absent_days: number;
  total_days: number;
  attendance_rate_percent: number;
};

export type ManagedAgentHistoryParams = {
  company_id?: number | string;
  from_date?: string;
  to_date?: string;
  status?: string;
  per_page?: number;
  page?: number;
};

export type AgentAttendanceHistoryResponse = {
  user_id: number;
  agent_name: string;
  avatar_url: string | null;
  summary: AgentAttendanceHistorySummary;
  items: AgentAttendanceRecord[];
  pagination: PaginationData;
};

// ─── Management Types ─────────────────────────────────────────────────────────

export type ManagementAttendanceRecord = {
  user_id: number;
  attendance_record_id?: number | null;
  agent_name: string;
  avatar: string | null;
  avatar_url?: string | null;
  gender?: string | null;
  zone: string | null;
  role: string;
  attendance_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  status: AttendanceStatus;
  work_duration_minutes: number | null;
  is_late: boolean;
  is_auto_clocked_out: boolean;
};

export type AttendanceMetricsResponse = {
  date: string;
  total_workforce: number;
  present: number;
  absent: number;
  late: number;
  auto_clocked: number;
  attendance_percentage: number;
};

export type AttendanceRecordsParams = {
  company_id?: number | string;
  date?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
  role?: "admin" | "agent" | "supervisor";
  clock_state?: "clocked_in" | "clocked_out";
  search?: string;
  per_page?: number;
  page?: number;
};

export type AttendanceRecordsResponse = {
  date: string;
  items: ManagementAttendanceRecord[];
  pagination: PaginationData;
};

export type AttendanceSettings = {
  id?: number;
  company_id?: number | string;
  opening_time?: string;
  closing_time?: string;
  working_days?: string[];
  clockin_window_minutes?: number;
  auto_clockout_enabled?: boolean;
  timezone?: string;
};

export type AttendanceSettingsResponse = {
  settings: AttendanceSettings | null;
};

export type UpdateAttendanceSettingsPayload = {
  company_id: number | string;
  opening_time?: string;
  closing_time?: string;
  working_days?: string[];
  clockin_window_minutes?: number;
  auto_clockout_enabled?: boolean;
  timezone?: string;
};

export type PayrollSummariesParams = {
  company_id?: number | string;
  year?: number;
  month?: number;
  per_page?: number;
};

export type GeneratePayrollPayload = {
  company_id: number | string;
  year: number;
  month: number;
};

export type AttendanceMapSnapshotItem = {
  user_id: number;
  attendance_record_id: number;
  agent_name: string;
  avatar_url: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  status: string;
  is_late: boolean;
  latitude: number;
  longitude: number;
  address: string | null;
  zone: string | null;
};

export type AttendanceMapSnapshotsResponse = {
  date: string;
  items: AttendanceMapSnapshotItem[];
};

export type AttendanceMapSnapshotsParams = {
  company_id?: number | string;
  date?: string;
  include_clocked_out?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

// ─── Agent API Functions ───────────────────────────────────────────────────────

export function getAttendanceToday(token: string) {
  return apiRequest<AttendanceTodayResponse>({
    method: "GET",
    path: "/agent/attendance/today",
    token,
  });
}

export function clockIn(payload: ClockPayload, token: string) {
  return apiRequest<AgentAttendanceRecord>({
    method: "POST",
    path: "/agent/attendance/clock-in",
    body: payload,
    token,
  });
}

export function clockOut(payload: ClockPayload, token: string) {
  return apiRequest<AgentAttendanceRecord>({
    method: "POST",
    path: "/agent/attendance/clock-out",
    body: payload,
    token,
  });
}

export function getAttendanceHistory(params: AttendanceHistoryParams, token: string) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<AttendanceHistoryResponse>({
    method: "GET",
    path: `/agent/attendance/history${query}`,
    token,
  });
}

export function getAttendanceStats(
  params: { company_id?: number | string; year?: number; month?: number },
  token: string
) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<AttendanceStatsResponse>({
    method: "GET",
    path: `/agent/attendance/stats${query}`,
    token,
  });
}

export function getAgentPayrollSummary(
  params: { company_id?: number | string; year?: number; month?: number },
  token: string
) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<PayrollSummaryResponse>({
    method: "GET",
    path: `/agent/attendance/payroll-summary${query}`,
    token,
  });
}

export function getAgentAttendanceMapSnapshot(
  params: AttendanceMapSnapshotsParams,
  token: string
) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<AttendanceMapSnapshotsResponse>({
    method: "GET",
    path: `/agent/attendance/map-snapshot${query}`,
    token,
  });
}

// ─── Management API Functions ─────────────────────────────────────────────────

export function getAttendanceMetrics(
  params: { company_id?: number | string; date?: string },
  token: string
) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<AttendanceMetricsResponse>({
    method: "GET",
    path: `/attendance/metrics${query}`,
    token,
  });
}

export function getAttendanceRecords(params: AttendanceRecordsParams, token: string) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<AttendanceRecordsResponse>({
    method: "GET",
    path: `/attendance/records${query}`,
    token,
  });
}

export function getAttendanceMapSnapshots(
  params: AttendanceMapSnapshotsParams,
  token: string
) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<AttendanceMapSnapshotsResponse>({
    method: "GET",
    path: `/attendance/map-snapshots${query}`,
    token,
  });
}

export function getAgentAttendanceHistory(
  userId: number | string,
  params: ManagedAgentHistoryParams,
  token: string
) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<AgentAttendanceHistoryResponse>({
    method: "GET",
    path: `/attendance/agents/${userId}/history${query}`,
    token,
  });
}

export function getAttendanceSettings(
  params: { company_id?: number | string },
  token: string
) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<AttendanceSettingsResponse>({
    method: "GET",
    path: `/attendance/settings${query}`,
    token,
  });
}

export function updateAttendanceSettings(
  payload: UpdateAttendanceSettingsPayload,
  token: string
) {
  return apiRequest<AttendanceSettingsResponse>({
    method: "PUT",
    path: "/attendance/settings",
    body: payload,
    token,
  });
}

export function getPayrollSummaries(params: PayrollSummariesParams, token: string) {
  const query = buildQuery(params as Record<string, unknown>);
  return apiRequest<{ summaries: PayrollSummaryResponse[]; pagination: PaginationData }>({
    method: "GET",
    path: `/attendance/payroll-summaries${query}`,
    token,
  });
}

export function generatePayrollSummaries(payload: GeneratePayrollPayload, token: string) {
  return apiRequest<PayrollSummaryResponse>({
    method: "POST",
    path: "/attendance/payroll-summaries/generate",
    body: payload,
    token,
  });
}
