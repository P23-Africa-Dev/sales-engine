"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { watchPosition } from "@/lib/tracking/geolocation";
import { ApiRequestError } from "@/lib/api/onboarding";
import {
  getFieldActivityToday,
  recordFieldActivityPoints,
  type FieldPointPayload,
} from "@/lib/api/field-activity";
import type { GeoReading } from "@/types/tracking";

export const FIELD_ACTIVITY_TODAY_KEY = ["field-activity", "agent-today"] as const;

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BATCH = 50;
const MAX_QUEUE = 500;
const STORAGE_PREFIX = "field-activity-points:";

type FieldActivityReporterContextValue = {
  /** Sends all buffered journey points to the server. Safe to call anytime. */
  flush: () => Promise<void>;
  isReporting: boolean;
  sessionId: number | null;
};

const FieldActivityReporterContext =
  createContext<FieldActivityReporterContextValue>({
    flush: async () => {},
    isReporting: false,
    sessionId: null,
  });

export function useFieldActivityReporter() {
  return useContext(FieldActivityReporterContext);
}

function loadStoredQueue(sessionId: number): FieldPointPayload[] {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQueue(sessionId: number, queue: FieldPointPayload[]): void {
  try {
    if (queue.length === 0) {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${sessionId}`);
    } else {
      sessionStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(queue));
    }
  } catch {
    // Storage full/unavailable — memory queue still holds points.
  }
}

function isStationary(reading: GeoReading): boolean {
  if (reading.speedMps == null || !Number.isFinite(reading.speedMps)) return false;
  return reading.speedMps * 3.6 < 1;
}

/**
 * Streams day-level journey GPS points to the backend while the agent has an
 * active attendance-linked field activity session. Web counterpart of the
 * agent PWA's FieldActivityProvider — without it, journeys recorded from the
 * web dashboard only contain the clock-in seed point.
 */
export function FieldActivityReporterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const { user } = useAuthStore();
  const { apiCompanyId } = getActiveCompanyContext(user);

  const todayQuery = useQuery({
    queryKey: FIELD_ACTIVITY_TODAY_KEY,
    queryFn: async () => {
      const res = await getFieldActivityToday(token, apiCompanyId ?? undefined);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const data = todayQuery.data;
  const isActive = Boolean(
    data?.enabled && data.session && data.session.status === "active",
  );
  const sessionId = isActive ? data!.session!.id : null;

  const queueRef = useRef<FieldPointPayload[]>([]);
  const sessionIdRef = useRef<number | null>(null);
  const companyIdRef = useRef<number | string | undefined>(apiCompanyId ?? undefined);
  const tokenRef = useRef(token);
  const lastSampleAtRef = useRef(0);
  const flushingRef = useRef(false);
  const movingIntervalRef = useRef(60);
  const stationaryIntervalRef = useRef(60);

  useEffect(() => {
    companyIdRef.current = apiCompanyId ?? undefined;
    tokenRef.current = token;
    movingIntervalRef.current = data?.config?.moving_interval_seconds ?? 60;
    stationaryIntervalRef.current = data?.config?.stationary_interval_seconds ?? 60;
  }, [apiCompanyId, token, data?.config?.moving_interval_seconds, data?.config?.stationary_interval_seconds]);

  const flush = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || flushingRef.current) return;
    flushingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const batch = queueRef.current.slice(0, MAX_BATCH);
        try {
          await recordFieldActivityPoints(sid, batch, tokenRef.current, companyIdRef.current);
          queueRef.current = queueRef.current.slice(batch.length);
          persistQueue(sid, queueRef.current);
        } catch (err) {
          if (err instanceof ApiRequestError && err.status === 422) {
            // Session no longer accepts points (already ended) — drop and resync.
            queueRef.current = [];
            persistQueue(sid, queueRef.current);
            void queryClient.invalidateQueries({ queryKey: FIELD_ACTIVITY_TODAY_KEY });
          }
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    if (!sessionId) return;

    // Recover points buffered before a refresh/navigation.
    const stored = loadStoredQueue(sessionId);
    if (stored.length > 0) {
      queueRef.current = [...stored, ...queueRef.current].slice(-MAX_QUEUE);
    }
    lastSampleAtRef.current = 0;

    const enqueue = (reading: GeoReading) => {
      const now = Date.now();
      const intervalSeconds = isStationary(reading)
        ? stationaryIntervalRef.current
        : movingIntervalRef.current;
      if (
        queueRef.current.length > 0 &&
        now - lastSampleAtRef.current < intervalSeconds * 1000 * 0.85
      ) {
        return;
      }
      lastSampleAtRef.current = now;

      queueRef.current.push({
        latitude: reading.latitude,
        longitude: reading.longitude,
        accuracy_meters: reading.accuracyMeters,
        speed_mps: reading.speedMps,
        heading_degrees: reading.headingDegrees,
        recorded_at: reading.recordedAt,
      });
      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current = queueRef.current.slice(-MAX_QUEUE);
      }
      persistQueue(sessionId, queueRef.current);
    };

    const stopWatch = watchPosition(enqueue, () => {
      // Errors are transient (permission prompt, GPS loss); watcher keeps trying.
    });

    const flushInterval = setInterval(() => {
      void flush();
    }, FLUSH_INTERVAL_MS);

    void flush();

    return () => {
      stopWatch();
      clearInterval(flushInterval);
      void flush();
    };
  }, [sessionId, flush]);

  return (
    <FieldActivityReporterContext.Provider
      value={{ flush, isReporting: Boolean(sessionId), sessionId }}
    >
      {children}
    </FieldActivityReporterContext.Provider>
  );
}
