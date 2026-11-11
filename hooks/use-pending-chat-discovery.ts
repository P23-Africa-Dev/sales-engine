"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchDiscoveryRun,
  listChatMessages,
  type ChatIntent,
  type ChatMessageApi,
} from "@/lib/api/sales-engine";
import { isLeadContactSearching } from "@/lib/enriched-lead-card";
import { SALES_ENGINE_CHAT_KEYS, useChatSessionManager } from "@/hooks/use-sales-engine-chat";
import { SALES_ENGINE_METRICS_KEYS } from "@/hooks/use-sales-engine-metrics";
import { SALES_ENGINE_ICP_KEYS } from "@/hooks/use-sales-engine-icp";

const BACKGROUND_POLL_MS = 4_000;
/** Stop refreshing for async contact enrichment after this long, even if a lead is still "searching". */
const CONTACT_SEARCH_POLL_MAX_MS = 5 * 60_000;

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

export function hasLeadsSearchingContacts(messages: ChatMessageApi[] | undefined): boolean {
  if (!messages) return false;
  return messages.some(
    (message) => Array.isArray(message.leads) && message.leads.some((lead) => isLeadContactSearching(lead))
  );
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
  const onCompleteRef = useRef(onComplete);
  const contactPollingRef = useRef<number | null>(null);
  const contactPollStartedRef = useRef<number | null>(null);
  const pollingIcpRef = useRef<string | undefined>(undefined);
  const contactPollingIcpRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

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
      if (pollingIcpRef.current === icpProfileId) return;
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    pollingIcpRef.current = icpProfileId;
    pollingRef.current = window.setInterval(async () => {
      const current = pendingRef.current;
      if (!current) return;

      try {
        const run = await fetchDiscoveryRun(current.runId);
        const summary =
          run.result_summary && typeof run.result_summary === "object"
            ? (run.result_summary as { partial_leads?: unknown[] })
            : null;
        if (Array.isArray(summary?.partial_leads) && summary.partial_leads.length > 0) {
          queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
        }
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
        onCompleteRef.current?.({ runId: current.runId, intent: current.intent });

        if (pollingRef.current != null) {
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        pendingRef.current = null;
      } catch {
        // Keep polling on transient errors.
      }
    }, BACKGROUND_POLL_MS);
  }, [icpProfileId, messages, ensureSession, queryClient]);

  // Contacts are enriched after the run completes: refresh history until no lead is "searching".
  useEffect(() => {
    const searching = Boolean(icpProfileId) && hasLeadsSearchingContacts(messages);

    if (!searching) {
      contactPollStartedRef.current = null;
      if (contactPollingRef.current != null) {
        window.clearInterval(contactPollingRef.current);
        contactPollingRef.current = null;
      }
      return;
    }

    if (contactPollStartedRef.current == null) {
      contactPollStartedRef.current = Date.now();
    }

    if (contactPollingRef.current != null) {
      if (contactPollingIcpRef.current === icpProfileId) return;
      window.clearInterval(contactPollingRef.current);
      contactPollingRef.current = null;
    }

    contactPollingIcpRef.current = icpProfileId;
    contactPollingRef.current = window.setInterval(() => {
      const startedAt = contactPollStartedRef.current ?? Date.now();
      if (Date.now() - startedAt > CONTACT_SEARCH_POLL_MAX_MS) {
        if (contactPollingRef.current != null) {
          window.clearInterval(contactPollingRef.current);
          contactPollingRef.current = null;
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: SALES_ENGINE_CHAT_KEYS.history(icpProfileId) });
    }, BACKGROUND_POLL_MS);
  }, [icpProfileId, messages, queryClient]);

  useEffect(
    () => () => {
      if (pollingRef.current != null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (contactPollingRef.current != null) {
        window.clearInterval(contactPollingRef.current);
        contactPollingRef.current = null;
      }
    },
    []
  );
}
