"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  listTaskAssignees,
  createTask,
  getTask,
  assignTask,
  listTaskReassignmentInbox,
  acceptTaskReassignment,
  rejectTaskReassignment,
  updateTaskStatus,
  updateTaskStatusAdmin,
  createSelfTask,
  uploadTaskProof,
  updateTask,
  deleteTask,
  type ListTasksParams,
  type CreateTaskPayload,
  type CreateSelfTaskPayload,
  type AssignTaskPayload,
  type TaskReassignmentsInboxParams,
  type RespondTaskReassignmentPayload,
  type TaskReassignmentItem,
  type UpdateTaskStatusPayload,
  type TaskApiItem,
  type PaginationData,
  type UpdateTaskPayload,
  type TaskAssignee,
} from "@/lib/api/tasks";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { toast } from "sonner";

export const TASK_KEYS = {
  all: ["tasks"] as const,
  list: (params: ListTasksParams) => ["tasks", params] as const,
  assignees: (companyId: number | string) => ["tasks", "assignees", companyId] as const,
  detail: (taskId: number | string, companyId?: number | string) =>
    ["tasks", "detail", taskId, companyId] as const,
  reassignmentInbox: (params: TaskReassignmentsInboxParams) =>
    ["tasks", "reassignments", "inbox", params] as const,
};

export type TasksResult = {
  tasks: TaskApiItem[];
  pagination: PaginationData;
};

export function useTaskAssignees(companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: TASK_KEYS.assignees(companyId ?? ""),
    queryFn: async (): Promise<TaskAssignee[]> =>
      (await listTaskAssignees({ company_id: companyId! }, token)).data.items,
    enabled: hasActiveApiSession(token) && companyId != null && companyId !== "",
    staleTime: 1000 * 60 * 5,
  });
}

export function useTasks(params: ListTasksParams = {}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: TASK_KEYS.list(params),
    queryFn: async (): Promise<TasksResult> => {
      const res = await listTasks(params, token);
      return {
        tasks: res.data.items,
        pagination: res.data.pagination,
      };
    },
    enabled: hasActiveApiSession(token) && (!!params.company_id || !!params.project_id),
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateTask(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateTaskPayload) => createTask(payload, token),
    onSuccess: (res) => {
      // Invalidate the tasks queries to refresh the list
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      if (res.meta?.queued_offline) {
        toast.info("Task queued offline. It will sync automatically.");
        return;
      }
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useTaskDetail(taskId: number | string, companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: TASK_KEYS.detail(taskId, companyId),
    queryFn: async () => (await getTask(taskId, { company_id: companyId }, token)).data.task,
    enabled: hasActiveApiSession(token) && !!taskId,
  });
}

export function useAssignTask(options?: { onSuccess?: (reassignment: TaskReassignmentItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number | string; payload: AssignTaskPayload }) =>
      assignTask(taskId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["tasks", "reassignments"] });
      options?.onSuccess?.(res.data.reassignment);
    },
  });
}

export function useTaskReassignmentInbox(params: TaskReassignmentsInboxParams = {}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: TASK_KEYS.reassignmentInbox(params),
    queryFn: async (): Promise<TaskReassignmentItem[]> => {
      const res = await listTaskReassignmentInbox(params, token);
      return res.data.reassignments;
    },
    enabled: hasActiveApiSession(token) && !!params.company_id,
    staleTime: 1000 * 30,
  });
}

export function useAcceptTaskReassignment(options?: {
  onSuccess?: (reassignment: TaskReassignmentItem) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      reassignmentId,
      payload,
    }: {
      reassignmentId: number | string;
      payload: RespondTaskReassignmentPayload;
    }) => acceptTaskReassignment(reassignmentId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["tasks", "reassignments"] });
      options?.onSuccess?.(res.data.reassignment);
    },
  });
}

export function useRejectTaskReassignment(options?: {
  onSuccess?: (reassignment: TaskReassignmentItem) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      reassignmentId,
      payload,
    }: {
      reassignmentId: number | string;
      payload: RespondTaskReassignmentPayload;
    }) => rejectTaskReassignment(reassignmentId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["tasks", "reassignments"] });
      options?.onSuccess?.(res.data.reassignment);
    },
  });
}

export function useUpdateTaskStatus(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number | string;
      payload: UpdateTaskStatusPayload;
    }) => updateTaskStatus(taskId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      if (res.meta?.queued_offline) {
        toast.info("Task status update queued offline.");
        return;
      }
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useUpdateTaskStatusAdmin(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number | string;
      payload: UpdateTaskStatusPayload;
    }) => updateTaskStatusAdmin(taskId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      if (res.meta?.queued_offline) {
        toast.info("Task status update queued offline.");
        return;
      }
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useCreateSelfTask(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: (payload: CreateSelfTaskPayload) => createSelfTask(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["tracking"] });
      if (res.meta?.queued_offline) {
        toast.info("Task queued offline.");
        return;
      }
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useUpdateTask(options?: { onSuccess?: (task: TaskApiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: ({
      taskId,
      payload,
    }: {
      taskId: number | string;
      payload: UpdateTaskPayload;
    }) => updateTask(taskId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.task);
    },
  });
}

export function useDeleteTask(options?: { onSuccess?: (deletedTaskId: number) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: ({
      taskId,
      companyId,
    }: {
      taskId: number | string;
      companyId?: number | string;
    }) => deleteTask(taskId, { company_id: companyId }, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.deleted_task_id);
    },
  });
}

export function useUploadTaskProof(options?: {
  onSuccess?: (proof: { id: number; file_url: string | null }) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useMutation({
    mutationFn: ({ taskId, formData }: { taskId: number | string; formData: FormData }) =>
      uploadTaskProof(taskId, formData, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
      options?.onSuccess?.(res.data.proof);
    },
  });
}
