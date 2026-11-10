/** Max gap (m) between the last trail vertex and a new fix to treat as the same session. */
export const MAX_LIVE_TRAIL_GAP_M = 400;

/** @deprecated origin-vs-current was the wrong check; kept for callers that still import it. */
export const MAX_LIVE_TRAIL_ORIGIN_DRIFT_M = MAX_LIVE_TRAIL_GAP_M;

export function haversineMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function shouldKeepLivePolyline(
  polyline: [number, number][] | undefined,
  anchor: [number, number] | undefined,
): boolean {
  if (!polyline?.length || !anchor) return false;
  const last = polyline[polyline.length - 1];
  return haversineMeters(last[0], last[1], anchor[0], anchor[1]) <= MAX_LIVE_TRAIL_GAP_M;
}

/** Live trail for map display: keep a continuing session; reset only on teleport / new session. */
export function resolveLivePolylineForHydrate(
  prevPolyline: [number, number][] | undefined,
  anchor: [number, number] | undefined,
): [number, number][] {
  if (!anchor) return prevPolyline?.length ? prevPolyline : [];
  if (!shouldKeepLivePolyline(prevPolyline, anchor)) {
    return [anchor];
  }

  const trail = prevPolyline!;
  const last = trail[trail.length - 1];
  if (last[0] === anchor[0] && last[1] === anchor[1]) {
    return trail;
  }
  return [...trail, anchor];
}
