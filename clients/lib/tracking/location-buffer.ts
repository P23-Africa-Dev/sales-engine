import type { GeoReading } from "@/types/tracking";
import { recordTaskLocation } from "@/lib/api/tracking";
import { useTrackingStore } from "@/store/tracking";
import { watchPosition, watchVisibilityAccuracy } from "./geolocation";
import {
  LIVE_FLUSH_HEARTBEAT_MS,
  shouldFlushLiveLocation,
  type LiveFlushCursor,
} from "@/lib/tracking/live-flush";

const MAX_QUEUE = 50;
const SESSION_KEY_PREFIX = "factory_location_buffer";

interface BufferCallbacks {
  onArrived?: () => void;
  onError?: (err: unknown) => void;
  /** Server rejected tracking for this task (e.g. reassigned) — tracking stops. */
  onStopped?: (message: string) => void;
}

interface BufferState {
  taskId: number;
  companyId: number | string;
  token: string;
  sessionKey: string;
  callbacks: BufferCallbacks;
  queue: GeoReading[];
  flushTimer: ReturnType<typeof setInterval> | null;
  stopWatch: (() => void) | null;
  stopVisibility: (() => void) | null;
  lowAccuracy: boolean;
  active: boolean;
  needsImmediateFlush: boolean;
  lastFlush: LiveFlushCursor | null;
}

let state: BufferState | null = null;

function makeSessionKey(taskId: number, companyId: number | string): string {
  return `${SESSION_KEY_PREFIX}:${String(companyId)}:${taskId}`;
}

function saveToSession(key: string, queue: GeoReading[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(queue));
  } catch {
    // sessionStorage not available
  }
}

function loadFromSession(key: string): GeoReading[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as GeoReading[]) : [];
  } catch {
    return [];
  }
}

function clearSession(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

async function flushState(target: BufferState, options: { allowInactive?: boolean } = {}) {
  const allowInactive = options.allowInactive ?? false;
  if ((!target.active && !allowInactive) || target.queue.length === 0) return;

  // Don't burn a failing request while offline; the 'online' listener and the
  // periodic flush will retry once connectivity returns (PWA parity).
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const batch = target.queue.splice(0, MAX_QUEUE);
  saveToSession(target.sessionKey, target.queue);

  try {
    const res = await recordTaskLocation(
      target.taskId,
      {
        company_id: target.companyId,
        points: batch.map((r) => ({
          latitude: r.latitude,
          longitude: r.longitude,
          accuracy_meters: r.accuracyMeters,
          speed_mps: r.speedMps,
          heading_degrees: r.headingDegrees,
          recorded_at: r.recordedAt,
        })),
      },
      target.token
    );

    const last = batch[batch.length - 1];
    if (last) {
      target.lastFlush = {
        atMs: Date.now(),
        lng: last.longitude,
        lat: last.latitude,
      };
    }

    if (res.data.arrived) {
      target.callbacks.onArrived?.();
    }
  } catch (err) {
    // Server explicitly rejected tracking (e.g. task reassigned/no longer
    // assigned to this agent) — stop cleanly instead of retry-looping.
    const status = (err as { status?: number })?.status;
    if (status === 422 || status === 403) {
      const message =
        (err as { message?: string })?.message ??
        "You can only track tasks currently assigned to you.";
      const callbacks = target.callbacks;
      // Drop the queue so stop()'s final flush doesn't retry the rejected batch.
      target.queue = [];
      clearSession(target.sessionKey);
      if (state === target) {
        stop();
      }
      callbacks.onStopped?.(message);
      return;
    }

    // Put points back at the front of the queue for retry
    target.queue.unshift(...batch);
    if (target.queue.length > MAX_QUEUE) {
      target.queue.splice(MAX_QUEUE);
    }
    saveToSession(target.sessionKey, target.queue);
    target.callbacks.onError?.(err);
  }
}

async function flush() {
  if (!state) return;
  await flushState(state);
}

function push(reading: GeoReading) {
  if (!state || !state.active) return;
  state.queue.push(reading);
  if (state.queue.length > MAX_QUEUE) {
    state.queue.shift();
  }
  saveToSession(state.sessionKey, state.queue);

  // Optimistically move the agent's own marker immediately instead of waiting
  // for the REST flush + WebSocket echo round-trip (parity with the PWA).
  useTrackingStore
    .getState()
    .appendPolylinePoint(state.taskId, [reading.longitude, reading.latitude]);

  // Flush the very first fix immediately so the rest of the pipeline (WS
  // consumers, management map) sees movement right away (PWA parity).
  if (state.needsImmediateFlush) {
    state.needsImmediateFlush = false;
    void flush();
    return;
  }

  if (
    shouldFlushLiveLocation(
      {
        longitude: reading.longitude,
        latitude: reading.latitude,
        speedMps: reading.speedMps,
      },
      state.lastFlush,
      Date.now(),
    )
  ) {
    void flush();
  }
}

function startWatcher() {
  if (!state) return;
  state.stopWatch?.();
  state.stopWatch = watchPosition(
    push,
    (err) => state?.callbacks.onError?.(err),
    state.lowAccuracy
  );
}

export function start(
  taskId: number,
  companyId: number | string,
  token: string,
  callbacks: BufferCallbacks = {}
) {
  if (state) stop();

  const sessionKey = makeSessionKey(taskId, companyId);
  const recovered = loadFromSession(sessionKey);

  state = {
    taskId,
    companyId,
    token,
    sessionKey,
    callbacks,
    queue: recovered,
    flushTimer: null,
    stopWatch: null,
    stopVisibility: null,
    lowAccuracy: false,
    active: true,
    needsImmediateFlush: true,
    lastFlush: null,
  };

  startWatcher();

  state.stopVisibility = watchVisibilityAccuracy((low) => {
    if (!state) return;
    state.lowAccuracy = low;
    startWatcher(); // restart with new accuracy
  });

  state.flushTimer = setInterval(flush, LIVE_FLUSH_HEARTBEAT_MS);

  // Flush recovered points immediately
  if (recovered.length > 0) {
    flush();
  }

  // Also flush on network recovery and when the tab becomes visible again
  // (batched fixes accumulated in the background go out right away).
  if (typeof window !== "undefined") {
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", flushOnVisible);
  }
}

function flushOnVisible() {
  if (document.visibilityState === "visible") {
    void flush();
  }
}

export function stop() {
  if (!state) return;

  const stopping = state;
  state = null;

  stopping.active = false;
  stopping.stopWatch?.();
  stopping.stopVisibility?.();
  if (stopping.flushTimer) clearInterval(stopping.flushTimer);

  if (typeof window !== "undefined") {
    window.removeEventListener("online", flush);
    document.removeEventListener("visibilitychange", flushOnVisible);
  }

  // Final flush attempt
  flushState(stopping, { allowInactive: true }).finally(() => {
    clearSession(stopping.sessionKey);
  });
}

export function isActive(): boolean {
  return !!state?.active;
}

export function getActiveTaskId(): number | null {
  return state?.taskId ?? null;
}
