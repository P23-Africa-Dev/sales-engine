import type { GeoReading } from "@/types/tracking";

const LOG = "[geolocation]";

const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
};

const LOW_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 30_000,
};

const MAX_STREAMING_ACCURACY_HIGH_M = 120;
const MAX_STREAMING_ACCURACY_LOW_M = 250;

function coordsToReading(coords: GeolocationCoordinates): GeoReading {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMeters: coords.accuracy ?? null,
    speedMps: coords.speed ?? null,
    headingDegrees: coords.heading ?? null,
    recordedAt: new Date().toISOString(),
  };
}

function isValidReading(r: GeoReading, maxAccuracyM = 1000): boolean {
  if (r.latitude === 0 && r.longitude === 0) return false;
  if (r.accuracyMeters !== null && r.accuracyMeters > maxAccuracyM) return false;
  return true;
}

function geolocationErrorDetails(err: GeolocationPositionError) {
  const hints: Record<number, string> = {
    1: "PERMISSION_DENIED",
    2: "POSITION_UNAVAILABLE",
    3: "TIMEOUT",
  };
  return { code: err.code, message: err.message, hint: hints[err.code] ?? "UNKNOWN" };
}

export async function requestLocationPermission(): Promise<PermissionState> {
  console.log(LOG, "requestLocationPermission() called");
  if (typeof navigator === "undefined") {
    console.warn(LOG, "navigator undefined — returning denied");
    return "denied";
  }
  if (!navigator.permissions) {
    console.log(LOG, "Permissions API unavailable — treating as prompt (Safari fallback)");
    return "prompt";
  }
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    console.log(LOG, "Permission query result", { state: result.state });
    return result.state;
  } catch (e) {
    console.warn(LOG, "Permission query failed — treating as prompt", e);
    return "prompt";
  }
}

export function getCurrentPosition(
  options?: PositionOptions
): Promise<GeoReading> {
  console.log(LOG, "getCurrentPosition() — triggers browser location prompt if not yet granted");
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      console.error(LOG, "Geolocation API not available");
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    // Attempt with caller-specified or high-accuracy options first.
    // If that times out or position is unavailable, fall back to low accuracy
    // (common on desktop, or when the device hasn't got a GPS fix yet).
    const attempt = (opts: PositionOptions, isRetry: boolean) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const reading = coordsToReading(pos.coords);
          console.log(LOG, "getCurrentPosition success", { isRetry, reading });
          // Accept any real fix — accuracy gate is enforced during live tracking,
          // not here, so the agent can proceed even on an imprecise initial lock.
          if (!isValidReading(reading)) {
            console.warn(LOG, "Reading at (0,0) — ignoring", reading);
            reject(new Error("Could not determine your location. Please try again."));
            return;
          }
          resolve(reading);
        },
        (err) => {
          console.warn(LOG, `getCurrentPosition ${isRetry ? "retry" : "attempt"} failed`, geolocationErrorDetails(err));
          if (!isRetry && (err.code === GeolocationPositionError.TIMEOUT || err.code === GeolocationPositionError.POSITION_UNAVAILABLE)) {
            // High accuracy timed out or unavailable — try low accuracy as fallback
            console.log(LOG, "Retrying with low-accuracy options");
            attempt(LOW_ACCURACY_OPTIONS, true);
            return;
          }
          reject(err);
        },
        opts
      );
    };

    attempt(options ?? HIGH_ACCURACY_OPTIONS, false);
  });
}

export function watchPosition(
  onReading: (r: GeoReading) => void,
  onError: (e: GeolocationPositionError) => void,
  lowAccuracy = false
): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    console.warn(LOG, "watchPosition skipped — geolocation unavailable");
    return () => { };
  }

  const options = lowAccuracy ? LOW_ACCURACY_OPTIONS : HIGH_ACCURACY_OPTIONS;
  console.log(LOG, "watchPosition started", { lowAccuracy, options });

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const reading = coordsToReading(pos.coords);
      const maxAccuracyM = lowAccuracy
        ? MAX_STREAMING_ACCURACY_LOW_M
        : MAX_STREAMING_ACCURACY_HIGH_M;

      if (isValidReading(reading, maxAccuracyM)) {
        console.log(LOG, "watchPosition update", reading);
        onReading(reading);
      } else {
        console.log(LOG, "watchPosition update ignored (quality check)", {
          reading,
          maxAccuracyM,
        });
      }
    },
    (err) => {
      console.warn(LOG, "watchPosition error", geolocationErrorDetails(err));
      onError(err);
    },
    options
  );

  return () => {
    console.log(LOG, "watchPosition stopped", { watchId });
    navigator.geolocation.clearWatch(watchId);
  };
}

// Reduce accuracy when the tab is hidden to save battery.
// Call this once in the tracking provider; it returns a cleanup fn.
export function watchVisibilityAccuracy(
  onChange: (lowAccuracy: boolean) => void
): () => void {
  if (typeof document === "undefined") return () => { };

  const handler = () => onChange(document.visibilityState === "hidden");
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
