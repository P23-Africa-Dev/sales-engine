/**
 * Dead-reckoning helpers for continuous marker movement between GPS fixes.
 *
 * GPS fixes arrive every ~15-30s; without prediction, markers jump once per
 * fix. These helpers let map surfaces glide a marker forward along the last
 * known speed/heading so movement reads as continuous (Uber/InDrive style),
 * re-anchoring whenever a real fix arrives.
 */

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

/** Max distance we allow prediction to travel without a fresh fix. */
export const MAX_PREDICTION_METERS = 120;

/** How long prediction stays active after the latest fix before freezing. */
export const MAX_PREDICTION_MS = 45_000;

/**
 * Project a [lng, lat] point forward by `seconds` at `speedMps` along
 * `headingDegrees` (compass bearing, 0 = north). Returns the original point
 * when inputs are unusable.
 */
export function projectPosition(
    position: [number, number],
    speedMps: number | null | undefined,
    headingDegrees: number | null | undefined,
    seconds: number,
): [number, number] {
    if (
        !Number.isFinite(position[0]) ||
        !Number.isFinite(position[1]) ||
        !Number.isFinite(seconds) ||
        seconds <= 0 ||
        typeof speedMps !== "number" ||
        !Number.isFinite(speedMps) ||
        speedMps <= 0.5 || // ignore GPS noise while standing still
        typeof headingDegrees !== "number" ||
        !Number.isFinite(headingDegrees)
    ) {
        return position;
    }

    const distance = Math.min(speedMps * seconds, MAX_PREDICTION_METERS);
    const bearing = headingDegrees * DEG;
    const [lng, lat] = position;
    const latRad = lat * DEG;

    const dLat = (distance * Math.cos(bearing)) / EARTH_RADIUS_M;
    const dLng =
        (distance * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.max(Math.cos(latRad), 1e-6));

    return [lng + dLng / DEG, lat + dLat / DEG];
}

/** Compass bearing (degrees, 0 = north) from point `a` to point `b`, both [lng, lat]. */
export function bearingBetween(a: [number, number], b: [number, number]): number | null {
    if (
        !Number.isFinite(a[0]) || !Number.isFinite(a[1]) ||
        !Number.isFinite(b[0]) || !Number.isFinite(b[1]) ||
        (a[0] === b[0] && a[1] === b[1])
    ) {
        return null;
    }

    const lat1 = a[1] * DEG;
    const lat2 = b[1] * DEG;
    const dLng = (b[0] - a[0]) * DEG;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/**
 * Smoothly blend a bearing toward a new target along the shortest arc.
 * `factor` in (0, 1]; 1 snaps immediately.
 */
export function smoothBearing(
    previous: number | null,
    next: number,
    factor = 0.35,
): number {
    if (previous == null || !Number.isFinite(previous)) return next;
    const delta = ((next - previous + 540) % 360) - 180;
    return (previous + delta * Math.min(Math.max(factor, 0), 1) + 360) % 360;
}

/**
 * Resolve the heading to use for a task: prefer the device-reported heading,
 * fall back to the bearing between the last two trail points.
 */
export function resolveHeading(
    reportedHeading: number | null | undefined,
    trail: [number, number][],
): number | null {
    if (typeof reportedHeading === "number" && Number.isFinite(reportedHeading)) {
        return ((reportedHeading % 360) + 360) % 360;
    }
    if (trail.length >= 2) {
        return bearingBetween(trail[trail.length - 2], trail[trail.length - 1]);
    }
    return null;
}
