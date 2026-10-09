"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  fetchInternalUsers,
  type ListProjectsParams,
  type CreateProjectPayload,
  type UpdateProjectPayload,
  type PaginationData,
  type InternalUser,
  type InternalUsersParams,
  type ProjectsAnalyticsData,
} from "@/lib/api/projects";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { mapApiProject } from "@/types/operations";
import type { Project } from "@/types/operations";
import { toast } from "sonner";

export const PROJECT_KEYS = {
  all: ["projects"] as const,
  list: (params: ListProjectsParams, basePath = "") =>
    ["projects", basePath, params] as const,
  detail: (id: number | string, basePath = "") => ["project", basePath, id] as const,
};

export const INTERNAL_USER_KEYS = {
  all: ["internal-users"] as const,
  list: (params: InternalUsersParams) => ["internal-users", params] as const,
};

// ─── List ─────────────────────────────────────────────────────────────────────

export type ProjectsResult = {
  projects: Project[];
  pagination: PaginationData;
  analytics: ProjectsAnalyticsData | null;
};

export function useProjects(params: ListProjectsParams = {}, basePath = "") {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: PROJECT_KEYS.list(params, basePath),
    queryFn: async (): Promise<ProjectsResult> => {
      const res = await listProjects(params, token, basePath);
      return {
        projects: res.data.items.map(mapApiProject),
        pagination: res.data.pagination,
        analytics: res.data.analytics ?? null,
      };
    },
    enabled: hasActiveApiSession(token),
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Single ───────────────────────────────────────────────────────────────────

export function useProject(id: number | string | null | undefined, basePath = "") {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: PROJECT_KEYS.detail(id ?? "", basePath),
    queryFn: async (): Promise<Project> => {
      const res = await getProject(id!, token, basePath);
      return mapApiProject(res.data.project);
    },
    enabled: hasActiveApiSession(token) && !!id,
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateProject(options?: { onSuccess?: (project: Project) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => createProject(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      if (res.meta?.queued_offline) {
        toast.info("Project creation queued offline.");
        return;
      }
      options?.onSuccess?.(mapApiProject(res.data.project));
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateProject(
  id: number | string,
  options?: { onSuccess?: (project: Project) => void }
) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: UpdateProjectPayload) => updateProject(id, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
      queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.detail(id) });
      if (res.meta?.queued_offline) {
        toast.info("Project update queued offline.");
        return;
      }
      options?.onSuccess?.(mapApiProject(res.data.project));
    },
  });
}

// ─── Internal Users (supervisors for project lead) ────────────────────────────

export function useInternalUsers(params: InternalUsersParams = { role: "supervisor" }) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: INTERNAL_USER_KEYS.list(params),
    queryFn: async (): Promise<InternalUser[]> => {
      const res = await fetchInternalUsers(params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 1000 * 60 * 5,
  });
}

