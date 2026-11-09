"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchDiscoveryRun,
  listChatMessages,
  type ChatIntent,
  type ChatMessageApi,
} from "@/lib/api/sales-engine";
import { SALES_ENGINE_CHAT_KEYS, useChatSessionManager } from "@/hooks/use-sales-engine-chat";
import { SALES_ENGINE_METRICS_KEYS } from "@/hooks/use-sales-engine-metrics";
import { SALES_ENGINE_ICP_KEYS } from "@/hooks/use-sales-engine-icp";

const BACKGROUND_POLL_MS = 4_000;

export type PendingDiscoveryComplete = {
  runId: number;
  intent: ChatIntent | string;
};

function findPendingRun(messages: ChatMessageApi[]): { runId: number; intent: ChatIntent | string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const runId = message.meta?.discovery_run_id;
    if (message.role === "assistant" && message.meta?.pending && typeof runId === "number") {
      return { runId, intent: message.intent ?? "generate_leads" };
    }
  }

  return null;
}

export function usePendingChatDiscovery(
  icpProfileId: string | undefined,
  messages: ChatMessageApi[] | undefined,
  onComplete?: (result: PendingDiscoveryComplete) => void
) {
  const queryClient = useQueryClient();
  const { ensureSession } = useChatSessionManager();
  const pollingRef = useRef<number | null>(null);
  const pendingRef = useRef<{ runId: number; intent: ChatIntent | string } | null>(null);

  useEffect(() => {
    const pending = messages ? findPendingRun(messages) : null;
    pendingRef.current = pending;

    if (!pending || !icpProfileId) {
      if (pollingRef.current != null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    if (pollingRef.current != null) {
      return;
    }

    pollingRef.current = window.setInterval(async () => {
      const current = pendingRef.current;
      if (!current) return;

      try {
        const run = await fetchDiscoveryRun(current.runId);
        if (run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled") {
          return;
        }

        const sessionId = await ensureSession(icpProfileId);
        const latestMessages = await listChatMessages(sessionId);
        const hasFinalAssistant = latestMessages.some(
          (message) => message.role === "assistant" && !message.meta?.pending
        );

        // Soft-failed runs keep pending=true so the user can continue waiting or stop.
        if (
          !hasFinalAssistant &&
          run.status === "failed" &&
          latestMessages.some(
            (message) =>
              message.role === "assistant" &&
              message.meta?.pending &&
              message.meta?.awaiting_user_choice
          )
        ) {
          return;
        }

        if (!hasFinalAssistant && run.status !== "failed" && run.status !== "cancelled") {
          return;
        }

        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_METRICS_KEYS.all });
        queryClient.invalidateQueries({ queryKey: SALES_ENGINE_ICP_KEYS.all });
        onComplete?.({ runId: current.runId, intent: current.intent });

        if (pollingRef.current != null) {
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        pendingRef.current = null;
      } catch {
        // Keep polling on transient errors.
      }
    }, BACKGROUND_POLL_MS);

    return () => {
      if (pollingRef.current != null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [icpProfileId, messages, ensureSession, onComplete, queryClient]);
}
