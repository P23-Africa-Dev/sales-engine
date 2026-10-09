"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getActiveCompanyContext } from "@/lib/company-context";
import {
  getFieldActivityLive,
  type FieldActivityLiveAgentDto,
} from "@/lib/api/field-activity";
import { useAuthStore } from "@/store/auth";
import {
  useFieldActivityLiveStore,
  type FieldActivityLiveAgent,
} from "@/store/field-activity-live";
import { useTrackingStore } from "@/store/tracking";

function mapAgent(dto: FieldActivityLiveAgentDto): FieldActivityLiveAgent {
  const lastLng = dto.last_longitude;
  const lastLat = dto.last_latitude;
  return {
    userId: dto.user_id,
    name: dto.name,
    avatarUrl: dto.avatar_url,
    sessionId: dto.session.id,
    lastPosition:
      lastLng != null && lastLat != null ? [lastLng, lastLat] : null,
    lastMovementState: dto.last_movement_state,
    lastRecordedAt: dto.last_recorded_at,
    polyline: (dto.route?.coordinates ?? []) as [number, number][],
    stops: (dto.stops ?? []).map((stop) => ({
      id: stop.id,
      field_activity_session_id: stop.field_activity_session_id,
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address,
      duration_seconds: stop.duration_seconds,
      classification: stop.classification,
      arrived_at: stop.arrived_at,
      departed_at: stop.departed_at,
    })),
  };
}

export function useFieldActivityLiveHydrate(enabled = true) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId } = getActiveCompanyContext(user);
  const hydrate = useFieldActivityLiveStore((s) => s.hydrate);
  const clear = useFieldActivityLiveStore((s) => s.clear);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const wsStatus = useTrackingStore((s) => s.wsStatus);
  // Field activity points also arrive over WS — poll only when disconnected.
  const refetchInterval = wsStatus === "connected" ? false : 60_000;

  const query = useQuery({
    queryKey: ["field-activity", "live", apiCompanyId],
    enabled: enabled && !!apiCompanyId && !!token,
    queryFn: async () => {
      const res = await getFieldActivityLive(
        { company_id: apiCompanyId ?? undefined },
        token,
      );
      return res.data;
    },
    refetchInterval,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!enabled) {
      clear();
      return;
    }
    if (query.data?.agents) {
      hydrate(query.data.agents.map(mapAgent));
    }
  }, [enabled, query.data, hydrate, clear]);

  return query;
}
