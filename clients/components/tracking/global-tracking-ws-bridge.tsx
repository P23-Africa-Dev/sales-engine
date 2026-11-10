"use client";

import { useTrackingWebSocket } from "@/hooks/use-tracking-ws";

/**
 * Keeps the management tracking WebSocket alive for the whole dashboard
 * shell so live feeds / start alerts work even when the user is not on /map.
 */
export function GlobalTrackingWsBridge() {
  useTrackingWebSocket({ shared: true });
  return null;
}
