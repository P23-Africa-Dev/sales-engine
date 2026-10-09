"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import {
  getAgentTerritory,
  getCoveragePoints,
  listTerritories,
  resetTerritory,
  upsertTerritory,
  type AgentTerritory,
  type UpsertTerritoryPayload,
} from "@/lib/api/territories";
import { ApiRequestError } from "@/lib/api/onboarding";

export const TERRITORY_KEYS = {
  all: ["territories"] as const,
  list: (companyId: number | string | undefined) => ["territories", "list", companyId] as const,
  coverage: (companyId: number | string | undefined) =>
    ["territories", "coverage", companyId] as const,
  agent: (companyId: number | string | undefined) => ["territories", "agent", companyId] as const,
};

const MANAGEMENT_ROLES = ["owner", "admin", "supervisor"];

function useTerritoryContext() {
  const user = useAuthStore((s) => s.user);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const context = getActiveCompanyContext(user);
  const role = (context.role ?? "").toLowerCase();

  return {
    token,
    companyId: context.apiCompanyId ?? undefined,
    role,
    isManagement: MANAGEMENT_ROLES.includes(role),
    isAgent: role === "agent",
  };
}

export type TerritoryPermissions = {
  canView: boolean;
  canEdit: boolean;
};

export function useTerritoryPermissions(): TerritoryPermissions {
  const { role, isManagement, isAgent } = useTerritoryContext();
  return useMemo(
    () => ({
      canView: isManagement || isAgent,
      canEdit: role === "owner" || role === "admin",
    }),
    [role, isManagement, isAgent]
  );
}

/** Admin/supervisor: territory rows for every agent in the company. */
export function useTerritories(enabled = true) {
  const { token, companyId, isManagement } = useTerritoryContext();

  return useQuery({
    queryKey: TERRITORY_KEYS.list(companyId),
    queryFn: async (): Promise<AgentTerritory[]> => {
      const res = await listTerritories(companyId, token);
      return res.data.items;
    },
    enabled: enabled && !!token && !!companyId && isManagement,
    staleTime: 1000 * 60 * 5,
  });
}

/** Admin/supervisor: coverage points powering auto territories. */
export function useCoveragePoints(enabled = true) {
  const { token, companyId, isManagement } = useTerritoryContext();

  return useQuery({
    queryKey: TERRITORY_KEYS.coverage(companyId),
    queryFn: async () => {
      const res = await getCoveragePoints(companyId, token);
      return res.data.items;
    },
    enabled: enabled && !!token && !!companyId && isManagement,
    staleTime: 1000 * 60 * 5,
  });
}

/** Agent: own territory + coverage points. */
export function useAgentTerritory(enabled = true) {
  const { token, companyId, isAgent } = useTerritoryContext();

  return useQuery({
    queryKey: TERRITORY_KEYS.agent(companyId),
    queryFn: async () => {
      const res = await getAgentTerritory(companyId, token);
      return res.data;
    },
    enabled: enabled && !!token && !!companyId && isAgent,
    staleTime: 1000 * 60 * 5,
  });
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    const firstError = error.errors ? Object.values(error.errors)[0]?.[0] : null;
    return firstError ?? error.message ?? fallback;
  }
  return fallback;
}

export function useUpsertTerritory() {
  const { token, companyId } = useTerritoryContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { userId: number; payload: Omit<UpsertTerritoryPayload, "company_id"> }) => {
      if (companyId == null) throw new Error("Missing company context");
      const res = await upsertTerritory(
        input.userId,
        { ...input.payload, company_id: companyId },
        token
      );
      return res.data.territory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TERRITORY_KEYS.all });
      toast.success("Territory saved");
    },
    onError: (error) => {
      toast.error(describeError(error, "Could not save the territory."));
    },
  });
}

export function useResetTerritory() {
  const { token, companyId } = useTerritoryContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: number) => {
      const res = await resetTerritory(userId, companyId, token);
      return res.data.reset_user_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TERRITORY_KEYS.all });
      toast.success("Territory reset to automatic coverage");
    },
    onError: (error) => {
      toast.error(describeError(error, "Could not reset the territory."));
    },
  });
}
