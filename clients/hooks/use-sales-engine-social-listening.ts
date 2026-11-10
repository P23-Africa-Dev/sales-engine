"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bootstrapSocialListeningRun,
  createSignalOutreach,
  dismissSignal,
  fetchSocialListeningRun,
  fetchSocialSignals,
  listSignalTypes,
  SalesEngineApiError,
  setSignalReminder,
  syncSignalToCrm,
  triggerSocialListeningRun,
  type PaginatedSocialSignals,
  type SocialListeningRunStatus,
} from "@/lib/api/sales-engine";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { useActiveIcpProfile } from "@/hooks/use-sales-engine-icp";
import { SALES_ENGINE_OUTREACH_KEYS } from "@/hooks/use-sales-engine-outreach";
import {
  SALES_ENGINE_SOCIAL_METRICS_KEYS,
  useSocialListeningMetrics,
} from "@/hooks/use-sales-engine-social-metrics";

export const SALES_ENGINE_SOCIAL_KEYS = {
  all: ["sales-engine", "social-listening"] as const,
  signals: (icpId: string | undefined, filters: SocialSignalsFilters) =>
    ["sales-engine", "social-listening", "signals", icpId, filters] as const,
  run: (runId: number | undefined) => ["sales-engine", "social-listening", "run", runId] as const,
  signalTypes: (icpId: string | undefined) =>
    ["sales-engine", "social-listening", "signal-types", icpId] as const,
};

export type SocialSignalsFilters = {
  page: number;
  per_page: number;
  search: string;
  source: string;
  signal_type: string;
  buying_stage: string;
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

function isRunInProgress(status: string | undefined): boolean {
  return status === "queued" || status === "running";
}

export function useSocialListeningSignals(
  filters: SocialSignalsFilters,
  options?: { refetchInterval?: number | false; fetchAll?: boolean }
) {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const { data: activeIcp } = useActiveIcpProfile();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: [...SALES_ENGINE_SOCIAL_KEYS.signals(activeIcp?.id, filters), Boolean(options?.fetchAll)],
    queryFn: async (): Promise<PaginatedSocialSignals> => {
      try {
        const first = await fetchSocialSignals({
          page: filters.page,
          per_page: filters.per_page,
          search: filters.search || undefined,
          source: filters.source,
          signal_type: filters.signal_type,
          buying_stage: filters.buying_stage,
        });
        if (!options?.fetchAll) return first;
        const items = [...first.items];
        for (let page = first.meta.current_page + 1; page <= first.meta.last_page; page++) {
          const next = await fetchSocialSignals({
            ...filters,
            page,
            search: filters.search || undefined,
          });
          items.push(...next.items);
        }
        return { ...first, items };
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading && Boolean(activeIcp?.id),
    staleTime: 1000 * 30,
    refetchInterval: options?.refetchInterval,
  });
}

export function useSignalTypes() {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();
  const { data: activeIcp } = useActiveIcpProfile();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_SOCIAL_KEYS.signalTypes(activeIcp?.id),
    queryFn: async () => {
      try {
        return await listSignalTypes(activeIcp?.id);
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(token) && !isAuthLoading && Boolean(activeIcp?.id),
    staleTime: 1000 * 60 * 5,
  });
}

export function useSocialListeningRun(runId: number | undefined, enabled = true) {
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_SOCIAL_KEYS.run(runId),
    queryFn: async (): Promise<SocialListeningRunStatus> => {
      try {
        return await fetchSocialListeningRun(runId!);
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: enabled && Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return isRunInProgress(status) ? 4000 : false;
    },
  });
}

export function useSocialListeningBootstrap() {
  const queryClient = useQueryClient();
  const { data: activeIcp } = useActiveIcpProfile();
  const resetAuth = useResetSalesEngineAuth();
  const bootstrapAttempted = useRef(false);

  const { data: metrics, isLoading: metricsLoading } = useSocialListeningMetrics({
    refetchInterval: (data) =>
      isRunInProgress(data?.latest_run?.status) ? 4000 : false,
  });

  const bootstrap = useMutation({
    mutationFn: (force?: boolean) => bootstrapSocialListeningRun(Boolean(force)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_METRICS_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "outreach"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "metrics"] });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });

  useEffect(() => {
    bootstrapAttempted.current = false;
  }, [activeIcp?.id]);

  useEffect(() => {
    if (!activeIcp?.id || metricsLoading || !metrics || bootstrap.isPending) {
      return;
    }

    const latestStatus = metrics.latest_run?.status;
    if (isRunInProgress(latestStatus)) {
      return;
    }

    const needsBootstrap = !metrics.last_run_at || latestStatus === "failed";

    if (needsBootstrap && !bootstrapAttempted.current) {
      bootstrapAttempted.current = true;
      bootstrap.mutate(false);
    }
  }, [activeIcp?.id, metrics, metricsLoading, bootstrap]);

  const latestRun = metrics?.latest_run ?? null;
  const isScanning = isRunInProgress(latestRun?.status);
  const wasScanning = useRef(false);

  useEffect(() => {
    if (wasScanning.current && !isScanning) {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_KEYS.all });
    }
    wasScanning.current = isScanning;
  }, [isScanning, queryClient]);

  return {
    metrics,
    metricsLoading,
    latestRun,
    isScanning,
    bootstrap,
  };
}

function useSocialMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_METRICS_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "outreach"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "metrics"] });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useCreateSignalOutreach() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: ({ id, send, to_email }: { id: number; send?: boolean; to_email?: string }) =>
      createSignalOutreach(id, { send, to_email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_METRICS_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "outreach"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "metrics"] });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export function useSetSignalReminder() {
  return useSocialMutation(({ id, note }: { id: number; note?: string }) =>
    setSignalReminder(id, {
      remind_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      note,
    })
  );
}

export function useSyncSignalToCrm() {
  return useSocialMutation(
    ({ id, pipeline_id }: { id: number; pipeline_id?: number | string }) =>
      syncSignalToCrm(id, { pipeline_id })
  );
}

export function useDismissSignal() {
  return useSocialMutation((id: number) => dismissSignal(id));
}

export function useTriggerSocialListeningRun() {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();

  return useMutation({
    mutationFn: (force?: boolean) => triggerSocialListeningRun(Boolean(force)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_KEYS.all });
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_SOCIAL_METRICS_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "outreach"] });
      queryClient.invalidateQueries({ queryKey: ["sales-engine", "metrics"] });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

export {
  getSocialListeningEmptyMessage,
  getSocialListeningEmptyState,
} from "@/lib/social-listening-empty-state";
