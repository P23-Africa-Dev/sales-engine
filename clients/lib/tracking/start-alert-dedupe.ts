/** Default window to suppress duplicate "agent started task" alerts. */
export const TRACKING_START_ALERT_DEDUPE_MS = 60_000;

/**
 * Returns true when a start alert for `taskId` should be shown, updating `seen`.
 */
export function shouldEmitTrackingStartAlert(
  seen: Map<number, number>,
  taskId: number,
  nowMs: number,
  dedupeMs: number = TRACKING_START_ALERT_DEDUPE_MS,
): boolean {
  const prev = seen.get(taskId);
  if (prev != null && nowMs - prev < dedupeMs) return false;
  seen.set(taskId, nowMs);
  return true;
}
