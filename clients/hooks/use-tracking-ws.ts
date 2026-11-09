"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useTrackingStore } from "@/store/tracking";
import { useAttendanceMapStore } from "@/store/attendance-map";
import { useFieldActivityLiveStore } from "@/store/field-activity-live";
import type { AttendanceMapSnapshotItem } from "@/lib/api/attendance";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { getTrackingWebSocketUrl } from "@/lib/config/public-env";
import { getTaskRoute, listAgentLocations } from "@/lib/api/tracking";
import type { TrackingEnvelope } from "@/types/tracking";

const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 16000, 30000];
const POLL_INTERVAL_MS = 25_000;
const FAST_POLL_INTERVAL_MS = 8_000;
const STALE_THRESHOLD_MS = 15_000;
/** After this many consecutive close/reconnect failures, surface `wsStatus: 'error'`. */
const MAX_CONSECUTIVE_FAILURES = 5;

const LOG = "[tracking-ws]";

/**
 * Auth strategy: connect without putting the bearer token in the URL query
 * string (avoids token leakage via logs/proxies/Referer). The realtime relay
 * accepts either `?token=` on connect OR a post-open `authenticate` message —
 * we use only the message path. `company_id` / `task_ids` remain in the URL
 * as non-secret subscription hints.
 */

/** Ref-count so layout + agent map can share one connection lifecycle. */
let sharedMountCount = 0;

function isManagementRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase();
  return ["owner", "admin", "management", "manager", "supervisor"].includes(
    normalized
  );
}

function readyStateLabel(state: number): string {
  switch (state) {
    case WebSocket.CONNECTING:
      return "CONNECTING (0)";
    case WebSocket.OPEN:
      return "OPEN (1)";
    case WebSocket.CLOSING:
      return "CLOSING (2)";
    case WebSocket.CLOSED:
      return "CLOSED (3)";
    default:
      return `UNKNOWN (${state})`;
  }
}

function redactToken(token: string): string {
  if (token.length <= 12) return "***";
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    console.warn(LOG, "Failed to parse message as JSON", { raw, error: e });
    return null;
  }
}

export type UseTrackingWebSocketOptions = {
  /** When true, only the last unmount tears down the socket (dashboard layout). */
  shared?: boolean;
};

export function useTrackingWebSocket(options: UseTrackingWebSocketOptions = {}) {
  const shared = options.shared === true;
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role: companyRole } = getActiveCompanyContext(user);
  const store = useTrackingStore();
  const wsUrl = getTrackingWebSocketUrl();
  const [isInitialHydrating, setIsInitialHydratingLocal] = useState(false);

  const setIsInitialHydrating = useCallback((value: boolean) => {
    setIsInitialHydratingLocal(value);
    useTrackingStore.getState().setInitialHydrating(value);
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fastPollCountRef = useRef(0);
  const disconnectedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const authenticatedRef = useRef(false);
  const connectionAttemptRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const connectRef = useRef<() => void>(() => { });
  const subscribedTaskIdsRef = useRef<number[]>([]);
  const hydrateRef = useRef<(options?: { markInitial?: boolean }) => Promise<void>>(
    async () => undefined,
  );

  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const subscribedTaskIds = Array.from(
    new Set(
      [
        ...Object.keys(store.liveTasks).map((value) => Number.parseInt(value, 10)),
        store.activeTrackingTaskId,
      ].filter((value): value is number => Number.isFinite(value))
    )
  ).sort((left, right) => left - right);

  const hydrateLocationSnapshots = useCallback(async (options?: { markInitial?: boolean }) => {
    if (!companyId || !token) {
      return;
    }

    const markInitial = options?.markInitial ?? false;

    if (markInitial) {
      setIsInitialHydrating(true);
    }

    try {
      const res = await listAgentLocations(
        {
          company_id: companyId,
          include_offline: true,
          stale_after_seconds: 300,
          limit: 300,
        },
        token
      );

      useTrackingStore.getState().hydrateFromSnapshots(res.data.items);
      console.log(LOG, "Snapshot read model hydrated", {
        items: res.data.items.length,
      });
    } catch (err) {
      console.warn(LOG, "Snapshot hydration failed", err);
    } finally {
      if (markInitial) {
        setIsInitialHydrating(false);
      }
    }
  }, [companyId, token, setIsInitialHydrating]);

  useEffect(() => {
    hydrateRef.current = hydrateLocationSnapshots;
  }, [hydrateLocationSnapshots]);

  const rehydrateActiveTasks = useCallback(async () => {
    const { liveTasks } = useTrackingStore.getState();
    const active = Object.values(liveTasks).filter((t) => t.status !== "completed");
    if (!active.length || !companyId || !token) {
      return;
    }

    await Promise.allSettled(
      active.map(async (t) => {
        try {
          const routeRole = isManagementRole(companyRole) ? "management" : "agent";
          const res = await getTaskRoute(
            t.taskId,
            { company_id: companyId, role: routeRole },
            token
          );
          useTrackingStore.getState().hydrateFromRoute(t.taskId, res.data, {
            id: t.taskId,
            title: t.taskTitle,
            company_id: companyId as number,
            assigned_agent_id: t.userId,
            status: "in_progress",
            assignee: { id: t.userId, name: t.agentName, email: "" },
          } as Parameters<
            ReturnType<typeof useTrackingStore.getState>["hydrateFromRoute"]
          >[2]);
        } catch (err) {
          console.warn(LOG, "Route rehydrate failed for task", t.taskId, err);
        }
      })
    );
  }, [companyId, companyRole, token]);

  const runRecoveryCycle = useCallback(async () => {
    await hydrateLocationSnapshots();
    await rehydrateActiveTasks();
  }, [hydrateLocationSnapshots, rehydrateActiveTasks]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    fastPollCountRef.current = 0;
    console.log(LOG, "Starting REST polling fallback", {
      fastMs: FAST_POLL_INTERVAL_MS,
      slowMs: POLL_INTERVAL_MS,
    });

    const tick = () => {
      void runRecoveryCycle();
      fastPollCountRef.current += 1;
      if (fastPollCountRef.current === 2 && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
      }
    };

    void runRecoveryCycle();
    pollTimerRef.current = setInterval(tick, FAST_POLL_INTERVAL_MS);
  }, [runRecoveryCycle]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      console.log(LOG, "Stopping REST polling fallback");
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!token || !companyId || !wsUrl || !mountedRef.current) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    connectionAttemptRef.current += 1;
    const attempt = connectionAttemptRef.current;

    store.setWsStatus("connecting");

    const params = new URLSearchParams({
      company_id: String(companyId),
    });
    if (subscribedTaskIds.length > 0) {
      params.set("task_ids", subscribedTaskIds.join(","));
    }
    const url = `${wsUrl}?${params.toString()}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }

      backoffRef.current = 0;
      consecutiveFailuresRef.current = 0;
      disconnectedAtRef.current = null;
      authenticatedRef.current = false;
      subscribedTaskIdsRef.current = subscribedTaskIds;
      store.setWsStatus("connected");
      stopPolling();

      // Token is sent only here — not duplicated in the WebSocket URL.
      ws.send(JSON.stringify({
        type: "authenticate",
        token,
        company_id: companyId,
        task_ids: subscribedTaskIds,
      }));

      void runRecoveryCycle();
    };

    ws.onmessage = (evt) => {
      const raw = typeof evt.data === "string" ? evt.data : String(evt.data);
      const parsed = safeParse(raw);
      if (!parsed || typeof parsed !== "object") return;

      const msg = parsed as {
        type: string;
        payload?: TrackingEnvelope["payload"];
        channel?: string;
        code?: string;
        message?: string;
        connection_id?: string;
        access_role?: string;
        company_id?: number;
        subscribed_task_ids?: number[];
      };

      if (msg.type === "system.connected") {
        authenticatedRef.current = true;
        subscribedTaskIdsRef.current = Array.isArray(msg.subscribed_task_ids)
          ? msg.subscribed_task_ids.filter(
            (value: number): value is number => Number.isFinite(value)
          )
          : subscribedTaskIdsRef.current;
        return;
      }

      if (msg.type === "system.error" || msg.type === "system.auth_required" || msg.type === "pong") {
        return;
      }

      if (
        msg.type === "tracking.task.started" ||
        msg.type === "tracking.task.near_destination" ||
        msg.type === "tracking.location.updated" ||
        msg.type === "tracking.agent.location.updated" ||
        msg.type === "tracking.task.arrived" ||
        msg.type === "tracking.task.completed" ||
        msg.type === "tracking.task.reassigned"
      ) {
        if (msg.payload) {
          store.upsertFromWs({
            type: msg.type as TrackingEnvelope["type"],
            channel: msg.channel ?? "",
            payload: msg.payload,
          });
        }
        return;
      }

      if (msg.type === "attendance.clocked_in" || msg.type === "attendance.clocked_out") {
        const attendanceStore = useAttendanceMapStore.getState();
        const data = msg.payload?.data as AttendanceMapSnapshotItem | undefined;

        if (msg.type === "attendance.clocked_in" && data) {
          attendanceStore.upsertSnapshot(data);
        }

        if (msg.type === "attendance.clocked_out" && msg.payload?.user_id) {
          const userId = Number(msg.payload.user_id);
          attendanceStore.removeSnapshot(userId);
          useFieldActivityLiveStore.getState().removeAgent(userId);
        }
        return;
      }

      if (msg.type === "field_activity.location") {
        const payload = msg.payload as {
          user_id?: number;
          field_activity_session_id?: number;
          latitude?: number;
          longitude?: number;
          movement_state?: string | null;
          recorded_at?: string | null;
        } | undefined;
        if (
          payload?.user_id != null &&
          payload.latitude != null &&
          payload.longitude != null &&
          Number.isFinite(payload.latitude) &&
          Number.isFinite(payload.longitude)
        ) {
          useFieldActivityLiveStore.getState().appendPoint(
            Number(payload.user_id),
            [Number(payload.longitude), Number(payload.latitude)],
            {
              sessionId: payload.field_activity_session_id
                ? Number(payload.field_activity_session_id)
                : undefined,
              movementState: payload.movement_state ?? null,
              recordedAt: payload.recorded_at ?? null,
            },
          );
        }
        return;
      }

      if (msg.type === "field_activity.stop_created") {
        const payload = msg.payload as {
          user_id?: number;
          stop?: {
            id: number;
            field_activity_session_id: number;
            latitude: number;
            longitude: number;
            address?: string | null;
            duration_seconds?: number;
            classification?: string | null;
            arrived_at?: string | null;
            departed_at?: string | null;
          };
        } | undefined;
        if (payload?.user_id != null && payload.stop?.id != null) {
          useFieldActivityLiveStore.getState().upsertStop(Number(payload.user_id), {
            id: payload.stop.id,
            field_activity_session_id: payload.stop.field_activity_session_id,
            latitude: payload.stop.latitude,
            longitude: payload.stop.longitude,
            address: payload.stop.address,
            duration_seconds: payload.stop.duration_seconds,
            classification: payload.stop.classification,
            arrived_at: payload.stop.arrived_at,
            departed_at: payload.stop.departed_at,
          });
        }
      }
    };

    ws.onerror = () => {
      console.error(LOG, "Socket error", { attempt });
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;

      authenticatedRef.current = false;
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        store.setWsStatus("error");
      } else {
        store.setWsStatus("reconnecting");
      }
      disconnectedAtRef.current = disconnectedAtRef.current ?? Date.now();

      const elapsed = Date.now() - disconnectedAtRef.current;
      if (elapsed > STALE_THRESHOLD_MS) {
        startPolling();
      } else {
        void runRecoveryCycle();
      }

      const delay = BACKOFF_STEPS[Math.min(backoffRef.current, BACKOFF_STEPS.length - 1)];
      backoffRef.current++;

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connectRef.current();
      }, delay);

      void event;
    };
  }, [
    token,
    companyId,
    store,
    runRecoveryCycle,
    startPolling,
    stopPolling,
    subscribedTaskIds,
    wsUrl,
  ]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authenticatedRef.current) {
      return;
    }

    const previous = new Set(subscribedTaskIdsRef.current);
    const next = new Set(subscribedTaskIds);

    for (const taskId of subscribedTaskIds) {
      if (previous.has(taskId)) continue;
      ws.send(JSON.stringify({ type: "subscribe_task", task_id: taskId }));
    }

    for (const taskId of subscribedTaskIdsRef.current) {
      if (next.has(taskId)) continue;
      ws.send(JSON.stringify({ type: "unsubscribe_task", task_id: taskId }));
    }

    subscribedTaskIdsRef.current = subscribedTaskIds;
  }, [subscribedTaskIds]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const wsStatus = useTrackingStore((s) => s.wsStatus);

  useEffect(() => {
    if (!token || !companyId || !isManagementRole(companyRole)) return;
    if (wsStatus === "connected") return;

    const refresh = () => {
      void hydrateLocationSnapshots();
    };

    const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [token, companyId, companyRole, hydrateLocationSnapshots, wsStatus]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void hydrateRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (shared) {
      sharedMountCount += 1;
    }

    if (token && companyId) {
      queueMicrotask(() => {
        void hydrateLocationSnapshots({ markInitial: true });
      });
    }

    if (token && companyId && wsUrl) {
      connect();
    }

    return () => {
      if (shared) {
        sharedMountCount = Math.max(0, sharedMountCount - 1);
        if (sharedMountCount > 0) {
          return;
        }
        // Defer teardown so React Strict Mode remount does not drop the socket.
        window.setTimeout(() => {
          if (sharedMountCount > 0) return;
          mountedRef.current = false;
          authenticatedRef.current = false;
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          stopPolling();
          const ws = wsRef.current;
          wsRef.current = null;
          useTrackingStore.getState().setWsStatus("idle");
          if (ws) {
            ws.onclose = null;
            ws.onerror = null;
            if (ws.readyState !== WebSocket.CONNECTING) {
              ws.close();
            }
          }
        }, 100);
        return;
      }

      mountedRef.current = false;
      authenticatedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      stopPolling();
      const ws = wsRef.current;
      wsRef.current = null;
      store.setWsStatus("idle");

      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState !== WebSocket.CONNECTING) {
          ws.close();
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, String(companyId), wsUrl, shared]);

  return { wsStatus: store.wsStatus, isInitialHydrating };
}
