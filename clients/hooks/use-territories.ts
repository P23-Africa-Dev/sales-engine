"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import seed from "@/data/data.json";

import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import {
  getAgentTerritory,
  getCoveragePoints,
  listTerritories,
  resetTerritory,
  upsertTerritory,
  type AgentCoverage,
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
const LOCAL_TERRITORIES_STORAGE_KEY = "salesengine:demo:territories:v1";

function getSeedTerritories(): AgentTerritory[] {
  const raw =
    ((seed as unknown as { map?: { territories?: AgentTerritory[] } }).map?.territories ?? []);
  if (typeof window === "undefined") return raw;
  try {
    const saved = window.localStorage.getItem(LOCAL_TERRITORIES_STORAGE_KEY);
    if (!saved) return raw;
    const parsed = JSON.parse(saved) as Record<number, Partial<AgentTerritory>>;
    return raw.map((item) => {
      const ov = parsed[item.user_id];
      return ov ? { ...item, ...ov } : item;
    });
  } catch {
    return raw;
  }
}

function saveLocalTerritoryOverride(userId: number, patch: Partial<AgentTerritory> | null) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LOCAL_TERRITORIES_STORAGE_KEY);
    const parsed: Record<number, Partial<AgentTerritory>> = raw ? JSON.parse(raw) : {};
    if (patch === null) {
      delete parsed[userId];
    } else {
      parsed[userId] = { ...(parsed[userId] ?? {}), ...patch };
    }
    window.localStorage.setItem(LOCAL_TERRITORIES_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore storage errors
  }
}

function getSeedCoveragePoints(): AgentCoverage[] {
  return (
    (seed as unknown as { map?: { coverage?: AgentCoverage[] } }).map?.coverage ?? []
  );
}

function useTerritoryContext() {
  const user = useAuthStore((s) => s.user);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const context = getActiveCompanyContext(user);
  const role = (context.role ?? "owner").toLowerCase();

  return {
    token,
    companyId: context.apiCompanyId ?? 1,
    role,
    isManagement: MANAGEMENT_ROLES.includes(role) || !context.role,
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
      canView: isManagement || isAgent || true,
      canEdit: role === "owner" || role === "admin" || !role,
    }),
    [role, isManagement, isAgent]
  );
}

/** Admin/supervisor: territory rows for every agent in the company (with demo fallback). */
export function useTerritories(enabled = true) {
  const { token, companyId, isManagement } = useTerritoryContext();

  return useQuery({
    queryKey: TERRITORY_KEYS.list(companyId),
    queryFn: async (): Promise<AgentTerritory[]> => {
      if (!token) {
        return getSeedTerritories();
      }
      try {
        const res = await listTerritories(companyId, token);
        return res.data.items.length > 0 ? res.data.items : getSeedTerritories();
      } catch {
        return getSeedTerritories();
      }
    },
    enabled: enabled && isManagement,
    initialData: () => getSeedTerritories(),
    staleTime: 1000 * 60 * 5,
  });
}

/** Admin/supervisor: coverage points powering auto territories (with demo fallback). */
export function useCoveragePoints(enabled = true) {
  const { token, companyId, isManagement } = useTerritoryContext();

  return useQuery({
    queryKey: TERRITORY_KEYS.coverage(companyId),
    queryFn: async (): Promise<AgentCoverage[]> => {
      if (!token) {
        return getSeedCoveragePoints();
      }
      try {
        const res = await getCoveragePoints(companyId, token);
        return res.data.items.length > 0 ? res.data.items : getSeedCoveragePoints();
      } catch {
        return getSeedCoveragePoints();
      }
    },
    enabled: enabled && isManagement,
    initialData: () => getSeedCoveragePoints(),
    staleTime: 1000 * 60 * 5,
  });
}

/** Agent: own territory + coverage points. */
export function useAgentTerritory(enabled = true) {
  const { token, companyId, isAgent } = useTerritoryContext();

  return useQuery({
    queryKey: TERRITORY_KEYS.agent(companyId),
    queryFn: async () => {
      if (!token) {
        const territories = getSeedTerritories();
        const coverage = getSeedCoveragePoints();
        return {
          territory: territories[0] ?? null,
          coverage: coverage[0] ?? { user_id: 9, task_points: [], trail_points: [] },
          meta: {
            company_id: 1,
            trail_lookback_days: 14,
            generated_at: new Date().toISOString(),
          },
        };
      }
      try {
        const res = await getAgentTerritory(companyId, token);
        return res.data;
      } catch {
        const territories = getSeedTerritories();
        const coverage = getSeedCoveragePoints();
        return {
          territory: territories[0] ?? null,
          coverage: coverage[0] ?? { user_id: 9, task_points: [], trail_points: [] },
          meta: {
            company_id: 1,
            trail_lookback_days: 14,
            generated_at: new Date().toISOString(),
          },
        };
      }
    },
    enabled: enabled && isAgent,
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
    mutationFn: async (input: {
      userId: number;
      payload: Omit<UpsertTerritoryPayload, "company_id"> & { mode?: "auto" | "manual" };
    }) => {
      if (!token) {
        saveLocalTerritoryOverride(input.userId, {
          ...(input.payload.name !== undefined ? { name: input.payload.name } : {}),
          ...(input.payload.color !== undefined ? { color: input.payload.color } : {}),
          ...(input.payload.is_visible !== undefined
            ? { is_visible: input.payload.is_visible }
            : {}),
          ...(input.payload.geojson !== undefined
            ? { geojson: input.payload.geojson, mode: input.payload.geojson ? "manual" : "auto" }
            : {}),
          ...(input.payload.mode !== undefined ? { mode: input.payload.mode } : {}),
          updated_at: new Date().toISOString(),
        });
        const updated = getSeedTerritories().find((t) => t.user_id === input.userId);
        if (!updated) throw new Error("Territory not found");
        return updated;
      }

      const res = await upsertTerritory(
        input.userId,
        { ...input.payload, company_id: companyId ?? 1 },
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
      if (!token) {
        saveLocalTerritoryOverride(userId, {
          mode: "auto",
          updated_at: new Date().toISOString(),
        });
        return userId;
      }
      const res = await resetTerritory(userId, companyId, token);
      return res.data.reset_user_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TERRITORY_KEYS.all });
      toast.success("Territory switched to automatic coverage footprint");
    },
    onError: (error) => {
      toast.error(describeError(error, "Could not reset the territory."));
    },
  });
}
