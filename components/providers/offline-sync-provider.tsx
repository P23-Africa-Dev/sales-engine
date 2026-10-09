"use client";

import { useEffect } from "react";
import { requestBackgroundSync } from "@/lib/offline/queue";
import { syncAllOfflineMutations } from "@/lib/offline/sync-engine";

const shouldRegisterServiceWorker =
  typeof window !== "undefined" && "serviceWorker" in navigator;

export default function OfflineSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handleOnline = () => {
      syncAllOfflineMutations();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncAllOfflineMutations();
      }
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event?.data?.type === "SYNC_REQUESTED") {
        syncAllOfflineMutations();
      }
    };

    const registerServiceWorker = async () => {
      if (!shouldRegisterServiceWorker) return;
      try {
        await navigator.serviceWorker.register("/sw.js");
        await requestBackgroundSync("dashboard-offline-sync");
      } catch {
        // non-fatal in unsupported environments
      }
    };

    if (navigator.onLine) {
      syncAllOfflineMutations();
    }

    registerServiceWorker();
    const retryTimer = window.setInterval(() => {
      syncAllOfflineMutations();
    }, 30_000);

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
      window.clearInterval(retryTimer);
    };
  }, []);

  return <>{children}</>;
}

