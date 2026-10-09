"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import {
  getAttendanceToday,
  clockIn,
  clockOut,
  getAttendanceHistory,
  getAttendanceStats,
  getAttendanceMetrics,
  getAttendanceRecords,
  getAgentAttendanceHistory,
  getAttendanceSettings,
  updateAttendanceSettings,
  generatePayrollSummaries,
  getAgentPayrollSummary,
  getPayrollSummaries,
  type AttendanceHistoryParams,
  type AttendanceRecordsParams,
  type ClockPayload,
  type UpdateAttendanceSettingsPayload,
  type GeneratePayrollPayload,
  type AttendanceTodayResponse,
  type AttendanceHistoryResponse,
  type AttendanceStatsResponse,
  type AttendanceMetricsResponse,
  type AttendanceRecordsResponse,
  type AttendanceSettings,
  type PayrollSummariesParams,
  type ManagedAgentHistoryParams,
  type AgentAttendanceHistoryResponse,
} from "@/lib/api/attendance";
import { toast } from "sonner";

export const ATTENDANCE_KEYS = {
  all: ["attendance"] as const,
  today: ["attendance", "today"] as const,
  history: (params: AttendanceHistoryParams) =>
    ["attendance", "history", params] as const,
  stats: (companyId: number | string | undefined, year?: number, month?: number) =>
    ["attendance", "stats", companyId, year, month] as const,
  metrics: (companyId: number | string | undefined, date?: string) =>
    ["attendance", "metrics", companyId, date] as const,
  records: (params: AttendanceRecordsParams) =>
    ["attendance", "records", params] as const,
  agentHistory: (userId: number | string | undefined, params: ManagedAgentHistoryParams) =>
    ["attendance", "agent-history", userId, params] as const,
  settings: (companyId: number | string | undefined) =>
    ["attendance", "settings", companyId] as const,
};

// ─── Agent Hooks ──────────────────────────────────────────────────────────────

export function useAttendanceToday() {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ATTENDANCE_KEYS.today,
    queryFn: async (): Promise<AttendanceTodayResponse> => {
      const res = await getAttendanceToday(token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 1000 * 30,
  });
}

export function useClockIn() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: ClockPayload) => clockIn(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["attendance-map"] });
      // Start journey tracking promptly instead of waiting for the next poll.
      queryClient.invalidateQueries({ queryKey: ["field-activity"] });
      if (res.meta?.queued_offline) {
        toast.info("Clock in queued offline.");
      }
    },
  });
}

export function useClockOut() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: ClockPayload) => clockOut(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["attendance-map"] });
      // Stop journey tracking and refresh summaries/journey history.
      queryClient.invalidateQueries({ queryKey: ["field-activity"] });
      queryClient.invalidateQueries({ queryKey: ["field-journeys"] });
      queryClient.invalidateQueries({ queryKey: ["agent-field-activity"] });
      if (res.meta?.queued_offline) {
        toast.info("Clock out queued offline.");
      }
    },
  });
}

export function useAttendanceHistory(params: AttendanceHistoryParams) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ATTENDANCE_KEYS.history(params),
    queryFn: async (): Promise<AttendanceHistoryResponse> => {
      const res = await getAttendanceHistory(params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 1000 * 60 * 2,
  });
}

export function useAttendanceStats(
  companyId: number | string | undefined,
  year?: number,
  month?: number
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ATTENDANCE_KEYS.stats(companyId, year, month),
    queryFn: async (): Promise<AttendanceStatsResponse> => {
      const res = await getAttendanceStats({ company_id: companyId, year, month }, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Management Hooks ─────────────────────────────────────────────────────────

export function useAttendanceMetrics(
  companyId: number | string | undefined,
  date?: string
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ATTENDANCE_KEYS.metrics(companyId, date),
    queryFn: async (): Promise<AttendanceMetricsResponse> => {
      const res = await getAttendanceMetrics({ company_id: companyId, date }, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
  });
}

export function useAttendanceRecords(params: AttendanceRecordsParams) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ATTENDANCE_KEYS.records(params),
    queryFn: async (): Promise<AttendanceRecordsResponse> => {
      const res = await getAttendanceRecords(params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 1000 * 60 * 2,
  });
}

export function useAgentAttendanceHistory(
  userId: number | string | undefined,
  params: ManagedAgentHistoryParams
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ATTENDANCE_KEYS.agentHistory(userId, params),
    queryFn: async (): Promise<AgentAttendanceHistoryResponse> => {
      const res = await getAgentAttendanceHistory(userId!, params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!userId && !!params.company_id,
    staleTime: 1000 * 60 * 2,
  });
}

export function useAttendanceSettings(companyId: number | string | undefined) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ATTENDANCE_KEYS.settings(companyId),
    queryFn: async (): Promise<AttendanceSettings | null> => {
      const res = await getAttendanceSettings({ company_id: companyId }, token);
      return res.data.settings ?? null;
    },
    enabled: hasActiveApiSession(token) && !!companyId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateAttendanceSettings() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: UpdateAttendanceSettingsPayload) =>
      updateAttendanceSettings(payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEYS.all });
    },
  });
}

export function useGeneratePayrollSummaries() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: GeneratePayrollPayload) =>
      generatePayrollSummaries(payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEYS.all });
    },
  });
}

export function useAgentPayrollSummary(
  companyId: number | string | undefined,
  year?: number,
  month?: number
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: ["attendance", "agent-payroll-summary", companyId, year, month] as const,
    queryFn: async () => {
      const res = await getAgentPayrollSummary({ company_id: companyId, year, month }, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!companyId,
    staleTime: 1000 * 60 * 5,
  });
}

export function usePayrollSummaries(params: PayrollSummariesParams) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: ["attendance", "payroll-summaries", params] as const,
    queryFn: async () => {
      const res = await getPayrollSummaries(params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 1000 * 60 * 5,
  });
}
