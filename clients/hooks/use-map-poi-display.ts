"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMapPoiDisplay, type MapPoiDisplaySettings } from "@/lib/api/map";

const STORAGE_PREFIX = "map.poi_display.";

function storageKey(companyId?: number | string): string {
  return `${STORAGE_PREFIX}${companyId ?? "self"}`;
}

/**
 * Seed from the last-known value (localStorage) so we don't flash business pins
 * for an org that has them turned off, or hide them for an org that has them on,
 * while the first request is in flight. Defaults to enabled (current behavior).
 */
function cachedEnabled(companyId?: number | string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // ignore
  }
  return true;
}

export type UseMapPoiDisplayResult = {
  enabled: boolean;
  globalEnabled: boolean;
  isLoading: boolean;
};

export function useMapPoiDisplay(
  companyId?: number | string,
  options?: { enabled?: boolean },
): UseMapPoiDisplayResult {
  const query = useQuery<MapPoiDisplaySettings>({
    queryKey: ["map-poi-display", companyId ?? null],
    queryFn: async () => (await getMapPoiDisplay(companyId)).data,
    enabled: options?.enabled ?? true,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!query.data || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey(companyId),
        query.data.enabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [query.data, companyId]);

  return {
    enabled: query.data?.enabled ?? cachedEnabled(companyId),
    globalEnabled: query.data?.global_enabled ?? cachedEnabled(companyId),
    isLoading: query.isLoading,
  };
}
