"use client";

import { API_BASE_URL } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
  getOfflineSnapshot,
  getRunnableMutations,
  markMutationRetry,
  markMutationSynced,
  markMutationSyncing,
  recordConflict,
  requestBackgroundSync,
} from "./queue";

type RuntimeSyncStatus = {
  isSyncing: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

const MAX_RETRIES = 5;
let runtimeStatus: RuntimeSyncStatus = {
  isSyncing: false,
  lastRunAt: null,
  lastError: null,
};
const listeners = new Set<(status: RuntimeSyncStatus) => void>();

function publish(next: Partial<RuntimeSyncStatus>) {
  runtimeStatus = { ...runtimeStatus, ...next };
  listeners.forEach((listener) => listener(runtimeStatus));
}

function isPoorConnection(): boolean {
  if (typeof navigator === "undefined" || !("connection" in navigator)) {
    return false;
  }

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string };
  }).connection;
  return connection?.effectiveType === "slow-2g";
}

function buildAbsoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

export function getRuntimeSyncStatus(): RuntimeSyncStatus {
  return runtimeStatus;
}

export function subscribeRuntimeSyncStatus(
  listener: (status: RuntimeSyncStatus) => void,
) {
  listeners.add(listener);
  listener(runtimeStatus);
  return () => listeners.delete(listener);
}

export async function syncAllOfflineMutations(): Promise<void> {
  if (runtimeStatus.isSyncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (isPoorConnection()) return;

  publish({ isSyncing: true, lastError: null });

  try {
    const token = getAuthTokenFromDocument();
    if (!token) {
      publish({ isSyncing: false, lastRunAt: new Date().toISOString() });
      return;
    }

    const runnable = await getRunnableMutations();
    for (const mutation of runnable) {
      if (mutation.id == null) continue;

      await markMutationSyncing(mutation.id);

      try {
        const response = await fetch(buildAbsoluteUrl(mutation.path), {
          method: mutation.method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: mutation.bodyJson,
        });

        if (response.status === 409) {
          await recordConflict({
            mutationId: mutation.id,
            method: mutation.method,
            path: mutation.path,
            localPayloadJson: mutation.bodyJson,
            serverPayloadJson: null,
            message: "Conflict detected while replaying offline mutation.",
          });
          await markMutationRetry(
            mutation.id,
            mutation.attempts,
            "failed",
            "Conflict detected.",
          );
          continue;
        }

        if (!response.ok) {
          const shouldFailPermanently = mutation.attempts + 1 >= MAX_RETRIES;
          await markMutationRetry(
            mutation.id,
            mutation.attempts,
            shouldFailPermanently ? "failed" : "pending",
            `HTTP ${response.status}`,
          );
          continue;
        }

        await markMutationSynced(mutation.id);
      } catch (error) {
        const shouldFailPermanently = mutation.attempts + 1 >= MAX_RETRIES;
        await markMutationRetry(
          mutation.id,
          mutation.attempts,
          shouldFailPermanently ? "failed" : "pending",
          error instanceof Error ? error.message : "Unknown sync error",
        );
      }
    }

    const snapshot = await getOfflineSnapshot();
    if (snapshot.pendingActions > 0 || snapshot.failedActions > 0 || snapshot.pendingUploads > 0) {
      await requestBackgroundSync("dashboard-offline-sync");
    }

    publish({
      isSyncing: false,
      lastRunAt: new Date().toISOString(),
    });
  } catch (error) {
    publish({
      isSyncing: false,
      lastRunAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "Sync failed",
    });
  }
}

