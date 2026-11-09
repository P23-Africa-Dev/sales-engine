"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelDiscoveryRun,
  clearChatMessages,
  createChatSession,
  fetchCurrentChatSession,
  listChatMessages,
  sendChatMessage,
  SalesEngineApiError,
  type ChatIntent,
  type ChatMessageApi,
  type DiscoveryStageInfo,
  type SendChatMessageResult,
} from "@/lib/api/sales-engine";
import {
  LATE_ENGAGEMENT_LABELS,
  LATE_LABEL_AFTER_MS,
  labelsForIntent,
  nextProcessingLabelIndex,
  PROCESSING_LABEL_INTERVAL_MS,
  type SalesEngineIcpContext,
} from "@/lib/sales-engine-processing-labels";
import { useResetSalesEngineAuth, useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { useActiveIcpProfile } from "@/hooks/use-sales-engine-icp";
import { SALES_ENGINE_ICP_KEYS } from "@/hooks/use-sales-engine-icp";
import { SALES_ENGINE_METRICS_KEYS } from "@/hooks/use-sales-engine-metrics";
import { SALES_ENGINE_OUTREACH_KEYS } from "@/hooks/use-sales-engine-outreach";

export const SALES_ENGINE_CHAT_KEYS = {
  all: ["sales-engine", "chat"] as const,
  history: (icpId: string | undefined) => ["sales-engine", "chat", "history", icpId] as const,
};

export type ProcessingState = {
  label: string;
  secondaryLabel?: string | null;
  stepIndex: number;
  totalSteps: number;
  intent: ChatIntent;
  startedAt: number;
};

function isUnauthorized(error: unknown) {
  return error instanceof SalesEngineApiError && error.status === 401;
}

/**
 * True when the backend rejected the request because no ICP profile is active.
 * Must NOT treat every 422 as missing ICP — discovery poll failures historically
 * used status 422 (timeouts, worker crashes, etc.) and were mis-toasted as ICP errors.
 */
export function isMissingActiveIcp(error: unknown): boolean {
  if (!(error instanceof SalesEngineApiError) || error.status !== 422) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("active icp") ||
    message.includes("activate an icp") ||
    message.includes("icp profile is required") ||
    message.includes("icp profile first") ||
    message.includes("icp profile before")
  );
}

export type ChatWaitMode = "foreground" | "background";

export function isForegroundChatWaiting(isPending: boolean, waitMode: ChatWaitMode): boolean {
  return isPending && waitMode !== "background";
}

export function mapApiMessagesToUi(messages: ChatMessageApi[]) {
  return messages.map((message, index) => ({
    id: message.id ?? index + 2,
    role: message.role,
    body: message.body,
    intent: message.intent,
    leads: message.leads ?? undefined,
    meta: message.meta ?? undefined,
  }));
}

const sessionIdsByIcp = new Map<string, number>();

export function useChatSessionManager() {
  const { data: token, isLoading: isAuthLoading } = useSalesEngineAuth();

  const ensureSession = useCallback(
    async (icpProfileId?: string): Promise<number> => {
      if (!token) {
        throw new SalesEngineApiError("Sales Engine session is not ready.", 401);
      }

      const key = icpProfileId ?? "default";
      const cached = sessionIdsByIcp.get(key);
      if (cached) {
        return cached;
      }

      const existing = icpProfileId ? await fetchCurrentChatSession(icpProfileId) : await fetchCurrentChatSession();
      if (existing?.id) {
        sessionIdsByIcp.set(key, existing.id);

        return existing.id;
      }

      const created = await createChatSession(icpProfileId);
      sessionIdsByIcp.set(key, created.id);

      return created.id;
    },
    [token]
  );

  const setSessionId = useCallback((icpProfileId: string | undefined, sessionId: number) => {
    sessionIdsByIcp.set(icpProfileId ?? "default", sessionId);
  }, []);

  const clearSessionCache = useCallback((icpProfileId?: string) => {
    sessionIdsByIcp.delete(icpProfileId ?? "default");
  }, []);

  return { ensureSession, setSessionId, clearSessionCache, isAuthLoading, hasToken: Boolean(token) };
}

export function useChatHistory(icpProfileId?: string) {
  const { hasToken, isAuthLoading, setSessionId } = useChatSessionManager();
  const resetAuth = useResetSalesEngineAuth();

  return useQuery({
    queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId),
    queryFn: async () => {
      if (!icpProfileId) {
        return { sessionId: null as number | null, messages: [] as ChatMessageApi[] };
      }

      try {
        const existing = await fetchCurrentChatSession(icpProfileId);
        if (!existing?.id) {
          const created = await createChatSession(icpProfileId);
          setSessionId(icpProfileId, created.id);

          return { sessionId: created.id, messages: [] as ChatMessageApi[] };
        }

        setSessionId(icpProfileId, existing.id);
        const messages = await listChatMessages(existing.id);

        return { sessionId: existing.id, messages };
      } catch (error) {
        if (isUnauthorized(error)) resetAuth();
        throw error;
      }
    },
    enabled: Boolean(hasToken) && !isAuthLoading && Boolean(icpProfileId),
    staleTime: 1000 * 30,
  });
}

type SendMessageVariables = {
  body: string;
  intent: ChatIntent;
};

type SendMessageOptions = {
  onSuccess?: (result: SendChatMessageResult) => void;
  onError?: (error: unknown) => void;
};

function progressSecondaryLabel(progress?: { candidates_found?: number } | null): string | null {
  if (!progress?.candidates_found || progress.candidates_found <= 0) return null;
  const count = progress.candidates_found;
  return `Found ${count} potential match${count === 1 ? "" : "es"} so far…`;
}

export function useSendChatMessage(icpProfileId?: string, options?: SendMessageOptions) {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();
  const { ensureSession } = useChatSessionManager();
  const { data: activeProfile } = useActiveIcpProfile();

  const [processingState, setProcessingState] = useState<ProcessingState | null>(null);
  const [waitMode, setWaitMode] = useState<ChatWaitMode>("foreground");

  const labelSequenceRef = useRef<string[]>([]);
  const labelIndexRef = useRef(0);
  const labelIntervalRef = useRef<number | null>(null);
  const lateIntervalRef = useRef<number | null>(null);
  const lastLabelChangeRef = useRef(0);
  const lateIndexRef = useRef(0);
  const currentIntentRef = useRef<ChatIntent>("freeform");
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingRunIdRef = useRef<number | null>(null);
  const extraWaitMsRef = useRef(0);

  const icpContext: SalesEngineIcpContext | undefined = activeProfile
    ? {
        industries: activeProfile.config?.industries,
        territories: activeProfile.config?.territories,
        name: activeProfile.name,
      }
    : undefined;

  const clearProcessingTimers = useCallback(() => {
    if (labelIntervalRef.current != null) {
      window.clearInterval(labelIntervalRef.current);
      labelIntervalRef.current = null;
    }
    if (lateIntervalRef.current != null) {
      window.clearInterval(lateIntervalRef.current);
      lateIntervalRef.current = null;
    }
  }, []);

  const applyProcessingUpdate = useCallback(
    (partial: Partial<ProcessingState> & { label: string }) => {
      setProcessingState((current) => {
        const base = current ?? {
          label: partial.label,
          stepIndex: partial.stepIndex ?? 0,
          totalSteps: partial.totalSteps ?? 4,
          intent: partial.intent ?? currentIntentRef.current,
          startedAt: Date.now(),
          secondaryLabel: partial.secondaryLabel ?? null,
        };

        return {
          ...base,
          ...partial,
          intent: partial.intent ?? base.intent,
          startedAt: base.startedAt,
        };
      });
      lastLabelChangeRef.current = Date.now();
    },
    []
  );

  const startLabelRotation = useCallback(
    (intent: ChatIntent, message: string) => {
      clearProcessingTimers();
      currentIntentRef.current = intent;

      const sequence = labelsForIntent(intent, message, icpContext);
      labelSequenceRef.current = sequence;
      labelIndexRef.current = 0;
      lateIndexRef.current = 0;
      lastLabelChangeRef.current = Date.now();

      const firstLabel = sequence[0] ?? "Processing your request…";
      setProcessingState({
        label: firstLabel,
        stepIndex: 0,
        totalSteps: 4,
        intent,
        startedAt: Date.now(),
        secondaryLabel: null,
      });

      labelIntervalRef.current = window.setInterval(() => {
        labelIndexRef.current = nextProcessingLabelIndex(
          labelSequenceRef.current,
          labelIndexRef.current
        );
        const nextLabel = labelSequenceRef.current[labelIndexRef.current];
        if (nextLabel) {
          applyProcessingUpdate({ label: nextLabel });
        }
      }, PROCESSING_LABEL_INTERVAL_MS);

      lateIntervalRef.current = window.setInterval(() => {
        if (Date.now() - lastLabelChangeRef.current < LATE_LABEL_AFTER_MS) return;
        lateIndexRef.current = (lateIndexRef.current + 1) % LATE_ENGAGEMENT_LABELS.length;
        applyProcessingUpdate({ label: LATE_ENGAGEMENT_LABELS[lateIndexRef.current] });
      }, PROCESSING_LABEL_INTERVAL_MS);
    },
    [applyProcessingUpdate, clearProcessingTimers, icpContext]
  );

  const handleBackendStage = useCallback(
    (info: DiscoveryStageInfo) => {
      const secondary =
        info.progress && info.progress.candidates_found
          ? progressSecondaryLabel(info.progress)
          : null;

      applyProcessingUpdate({
        label: info.label,
        stepIndex: info.stepIndex,
        totalSteps: info.totalSteps,
        secondaryLabel: secondary,
      });
    },
    [applyProcessingUpdate]
  );

  const detachToBackground = useCallback(() => {
    setWaitMode("background");
    abortControllerRef.current?.abort();
    clearProcessingTimers();
    setProcessingState(null);
    queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
    return pendingRunIdRef.current;
  }, [clearProcessingTimers, icpProfileId, queryClient]);

  const continueWaiting = useCallback(() => {
    // Extend the foreground poll ceiling by 5 minutes each click; timeout stays last.
    extraWaitMsRef.current += 300_000;
    applyProcessingUpdate({
      label: "Still searching... hang tight. You can stop anytime.",
    });
  }, [applyProcessingUpdate]);

  const stopSearching = useCallback(async () => {
    const runId = pendingRunIdRef.current;
    abortControllerRef.current?.abort();
    clearProcessingTimers();
    setProcessingState(null);
    setWaitMode("foreground");
    pendingRunIdRef.current = null;
    extraWaitMsRef.current = 0;

    if (typeof runId === "number") {
      try {
        await cancelDiscoveryRun(runId);
      } catch {
        // Best-effort cancel — UI still unlocks.
      }
    }

    queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
  }, [clearProcessingTimers, icpProfileId, queryClient]);

  const mutation = useMutation({
    mutationFn: async ({ body, intent }: SendMessageVariables) => {
      setWaitMode("foreground");
      pendingRunIdRef.current = null;
      extraWaitMsRef.current = 0;
      abortControllerRef.current = new AbortController();
      startLabelRotation(intent, body);

      const needsIcp =
        intent === "generate_leads" ||
        intent === "generate_more_leads" ||
        intent === "quick_research" ||
        intent === "create_outreach";
      if (needsIcp && !icpProfileId) {
        throw new SalesEngineApiError(
          "An active ICP profile is required for this intent.",
          422
        );
      }

      const sessionId = await ensureSession(icpProfileId);

      const result = await sendChatMessage(
        sessionId,
        { body, intent },
        {
          onStage: handleBackendStage,
          onDiscoveryRun: (runId) => {
            pendingRunIdRef.current = runId;
          },
          onPartial: () => {
            queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
          },
          icpContext,
          signal: abortControllerRef.current.signal,
          extraWaitMsRef,
        }
      );

      if (result.discovery_run_id) {
        pendingRunIdRef.current = result.discovery_run_id;
      }

      return result;
    },
    onSuccess: (result, variables) => {
      if (result.pending) {
        clearProcessingTimers();
        setProcessingState(null);
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
        options?.onSuccess?.(result);
        return;
      }

      clearProcessingTimers();
      setProcessingState(null);
      setWaitMode("foreground");
      pendingRunIdRef.current = null;
      if (
        variables.intent === "generate_leads" ||
        variables.intent === "generate_more_leads" ||
        variables.intent === "quick_research"
      ) {
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ICP_KEYS.all });
      }
      if (variables.intent === "create_outreach") {
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_OUTREACH_KEYS.all });
      }
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
      options?.onSuccess?.(result);
    },
    onError: (error) => {
      clearProcessingTimers();
      setProcessingState(null);
      setWaitMode("foreground");
      pendingRunIdRef.current = null;
      // Soft-complete may still attach leads after the client saw a transient failure.
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
      if (isUnauthorized(error)) resetAuth();
      options?.onError?.(error);
    },
  });

  useEffect(() => () => clearProcessingTimers(), [clearProcessingTimers]);

  return { ...mutation, processingState, waitMode, detachToBackground, stopSearching, continueWaiting };
}

export function useClearChatHistory(icpProfileId?: string) {
  const queryClient = useQueryClient();
  const resetAuth = useResetSalesEngineAuth();
  const { ensureSession, clearSessionCache } = useChatSessionManager();

  return useMutation({
    mutationFn: async () => {
      const sessionId = await ensureSession(icpProfileId);
      await clearChatMessages(sessionId);
      clearSessionCache(icpProfileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
    },
    onError: (error) => {
      if (isUnauthorized(error)) resetAuth();
    },
  });
}

/** @deprecated Use useChatSessionManager instead. */
export function useChatSession() {
  const manager = useChatSessionManager();

  return {
    ensureSession: () => manager.ensureSession(),
    isAuthLoading: manager.isAuthLoading,
    hasToken: manager.hasToken,
  };
}
