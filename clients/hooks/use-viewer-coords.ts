"use client";

import { useEffect, useState } from "react";

export type ViewerCoords = {
  latitude: number;
  longitude: number;
};

/**
 * One-shot browser geolocation for proximity-sorted lists.
 * Returns null until available (or if denied/unavailable).
 */
export function useViewerCoords(): ViewerCoords | null {
  const [coords, setCoords] = useState<ViewerCoords | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        // Permission denied / unavailable — keep null (API falls back to newest-first).
      },
      {
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: 60_000,
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
