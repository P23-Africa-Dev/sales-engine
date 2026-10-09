"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTrackingStore } from "@/store/tracking";
import { NOTIFICATION_KEYS } from "@/hooks/use-notifications";
import { shouldEmitTrackingStartAlert } from "@/lib/tracking/start-alert-dedupe";

/**
 * Alerts managers when an agent starts task tracking — toast on any dashboard
 * page, and a browser/OS notification when the tab is hidden.
 */
export function TrackingStartWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const alert = useTrackingStore((s) => s.lastTaskStartedAlert);
  const seenRef = useRef<Map<number, number>>(new Map());
  const lastSignalRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!alert || alert.signal === lastSignalRef.current) return;
    lastSignalRef.current = alert.signal;

    if (!shouldEmitTrackingStartAlert(seenRef.current, alert.taskId, Date.now())) {
      return;
    }

    const mapUrl = `/map?taskId=${alert.taskId}`;
    const onMapPage = pathname === "/map" || pathname?.startsWith("/map/");
    const title = `${alert.agentName} started a task`;
    const body = alert.taskTitle;

    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });

    if (!onMapPage) {
      toast.message(title, {
        description: body,
        action: {
          label: "View on Map",
          onClick: () => router.push(mapUrl),
        },
        duration: 10_000,
      });
    }

    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden" &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        const n = new Notification(title, {
          body,
          tag: `tracking-started-${alert.taskId}`,
          data: { url: mapUrl },
        });
        n.onclick = () => {
          window.focus();
          router.push(mapUrl);
          n.close();
        };
      } catch {
        // Browser may block Notification construction.
      }
    }
  }, [alert, pathname, queryClient, router]);

  return null;
}
