"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createKpi,
  deleteKpi,
  getKpi,
  listKpis,
  updateKpi,
  updateKpiStatus,
  type CreateKpiPayload,
  type KpiItem,
  type KpiStatusCards,
  type ListKpisParams,
  type PaginationData,
  type UpdateKpiPayload,
  type UpdateKpiStatusPayload,
} from "@/lib/api/kpi";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { toast } from "sonner";

export const KPI_KEYS = {
  all: ["kpis"] as const,
  list: (params: ListKpisParams, agentScope?: boolean) =>
    ["kpis", params, agentScope ? "agent" : "management"] as const,
  detail: (kpiId: number | string, companyId?: number | string, agentScope?: boolean) =>
    ["kpis", "detail", kpiId, companyId, agentScope ? "agent" : "management"] as const,
};

export type KpisResult = {
  kpis: KpiItem[];
  statusCards: KpiStatusCards;
  pagination: PaginationData;
};

export function useKpis(
  params: ListKpisParams = {},
  options?: { agentScope?: boolean }
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const agentScope = options?.agentScope ?? false;

  return useQuery({
    queryKey: KPI_KEYS.list(params, agentScope),
    queryFn: async (): Promise<KpisResult> => {
      const res = await listKpis(params, token, { agentScope });
      return {
        kpis: res.data.items,
        statusCards: res.data.status_cards,
        pagination: res.data.pagination,
      };
    },
    enabled: hasActiveApiSession(token) && !!params.company_id,
    staleTime: 1000 * 60,
  });
}

export function useKpiDetail(
  kpiId: number | string,
  companyId?: number | string,
  options?: { agentScope?: boolean }
) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const agentScope = options?.agentScope ?? false;

  return useQuery({
    queryKey: KPI_KEYS.detail(kpiId, companyId, agentScope),
    queryFn: async () =>
      (await getKpi(kpiId, { company_id: companyId }, token, { agentScope })).data.kpi,
    enabled: hasActiveApiSession(token) && !!kpiId && !!companyId,
  });
}

export function useCreateKpi(options?: { onSuccess?: (kpi: KpiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateKpiPayload) => createKpi(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: KPI_KEYS.all });
      options?.onSuccess?.(res.data.kpi);
    },
  });
}

export function useUpdateKpi(options?: { onSuccess?: (kpi: KpiItem) => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({ kpiId, payload }: { kpiId: number | string; payload: UpdateKpiPayload }) =>
      updateKpi(kpiId, payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: KPI_KEYS.all });
      options?.onSuccess?.(res.data.kpi);
    },
  });
}

export function useDeleteKpi(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      kpiId,
      companyId,
    }: {
      kpiId: number | string;
      companyId: number | string;
    }) => deleteKpi(kpiId, { company_id: companyId }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KPI_KEYS.all });
      options?.onSuccess?.();
    },
  });
}

export function useUpdateKpiStatus(options?: {
  onSuccess?: (kpi: KpiItem) => void;
  adminScope?: boolean;
  agentScope?: boolean;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      kpiId,
      payload,
    }: {
      kpiId: number | string;
      payload: UpdateKpiStatusPayload;
    }) =>
      updateKpiStatus(kpiId, payload, token, {
        adminScope: options?.adminScope,
        agentScope: options?.agentScope,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: KPI_KEYS.all });
      options?.onSuccess?.(res.data.kpi);
    },
    onError: (error: unknown) => {
      const apiError = error as { message?: string };
      toast.error(apiError.message || "Failed to update KPI status.");
    },
  });
}
