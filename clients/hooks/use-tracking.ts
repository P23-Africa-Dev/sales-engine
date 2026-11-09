"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startTaskTracking,
  recordTaskLocation,
  completeTaskTracking,
  getTaskRoute,
  listAgentTasks,
} from "@/lib/api/tracking";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { TASK_KEYS } from "@/hooks/use-tasks";
import type { StartTrackingPayload, RecordLocationPayload } from "@/types/tracking";
import type { ListTasksParams } from "@/lib/api/tasks";

export const TRACKING_KEYS = {
  route: (taskId: number | string) => ["tracking", "route", taskId] as const,
  agentTasks: (params: ListTasksParams) => ["tracking", "agent-tasks", params] as const,
};

export function useAgentTasks(params: ListTasksParams) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: TRACKING_KEYS.agentTasks(params),
    queryFn: async () => {
      const res = await listAgentTasks(params, token);
      return { tasks: res.data.items, pagination: res.data.pagination };
    },
    enabled: hasActiveApiSession(token) && !!params.company_id,
    staleTime: 1000 * 30,
  });
}

export function useTaskRoute(
  taskId: number | string | null,
  params: { company_id: number | string; role?: "agent" | "management" }
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: TRACKING_KEYS.route(taskId ?? 0),
    queryFn: async () => {
      const res = await getTaskRoute(taskId!, params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!taskId && !!params.company_id,
    staleTime: 1000 * 60,
  });
}

export function useStartTracking(options?: {
  onSuccess?: (data: { arrived: boolean }) => void;
  onError?: (err: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number | string;
      payload: StartTrackingPayload;
    }) => startTaskTracking(taskId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.({ arrived: res.data.arrived });
    },
    onError: options?.onError,
  });
}

export function useRecordLocation(options?: {
  onSuccess?: (data: { arrived: boolean }) => void;
  onError?: (err: unknown) => void;
}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number | string;
      payload: RecordLocationPayload;
    }) => recordTaskLocation(taskId, payload, token),
    onSuccess: (res) => {
      options?.onSuccess?.({ arrived: res.data.arrived });
    },
    onError: options?.onError,
  });
}

export function useCompleteTracking(options?: {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      taskId,
      formData,
    }: {
      taskId: number | string;
      formData: FormData;
    }) => completeTaskTracking(taskId, formData, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
}
