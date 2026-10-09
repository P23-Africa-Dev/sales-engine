import { haversineMeters } from "@/lib/tracking/live-polyline";

/** Heartbeat / offline drain — still flush even if the agent is stationary. */
export const LIVE_FLUSH_HEARTBEAT_MS = 30_000;

/** Flush while moving if this much time has passed since the last upload. */
export const LIVE_FLUSH_MOVING_MS = 2_000;

/** Flush when the agent has moved this far since the last upload. */
export const LIVE_FLUSH_DISTANCE_M = 20;

/** Treat as moving for time-based flush. */
export const LIVE_FLUSH_MOVING_SPEED_MPS = 0.5;

export type LiveFlushSample = {
  longitude: number;
  latitude: number;
  speedMps?: number | null;
};

export type LiveFlushCursor = {
  atMs: number;
  lng: number;
  lat: number;
};

export function shouldFlushLiveLocation(
  sample: LiveFlushSample,
  lastFlush: LiveFlushCursor | null,
  nowMs: number,
): boolean {
  if (!lastFlush) return true;

  const movedM = haversineMeters(lastFlush.lng, lastFlush.lat, sample.longitude, sample.latitude);
  if (movedM >= LIVE_FLUSH_DISTANCE_M) return true;

  const elapsed = nowMs - lastFlush.atMs;
  const speed = typeof sample.speedMps === "number" ? sample.speedMps : 0;
  const moving = speed > LIVE_FLUSH_MOVING_SPEED_MPS || movedM > 3;
  return moving && elapsed >= LIVE_FLUSH_MOVING_MS;
}
