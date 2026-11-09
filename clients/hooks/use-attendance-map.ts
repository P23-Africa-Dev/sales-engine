"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import {
  getAgentAttendanceMapSnapshot,
  getAttendanceMapSnapshots,
  type AttendanceMapSnapshotsParams,
} from "@/lib/api/attendance";
import { useAttendanceMapStore } from "@/store/attendance-map";
import { useTrackingStore } from "@/store/tracking";

export const ATTENDANCE_MAP_KEYS = {
  snapshots: (params: AttendanceMapSnapshotsParams, scope: "management" | "agent") =>
    ["attendance-map", scope, params] as const,
};

type UseAttendanceMapOptions = {
  enabled?: boolean;
  scope?: "management" | "agent";
  pollIntervalMs?: number;
};

export function useAttendanceMapSnapshots(
  params: AttendanceMapSnapshotsParams = {},
  options: UseAttendanceMapOptions = {}
) {
  const { enabled = true, scope = "management", pollIntervalMs = 60_000 } = options;
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const setSnapshots = useAttendanceMapStore((s) => s.setSnapshots);
  const wsStatus = useTrackingStore((s) => s.wsStatus);
  // WS pushes attendance events live — poll only as fallback when disconnected.
  const refetchInterval = wsStatus === "connected" ? false : pollIntervalMs;

  const query = useQuery({
    queryKey: ATTENDANCE_MAP_KEYS.snapshots({ ...params, company_id: companyId ?? params.company_id }, scope),
    queryFn: async () => {
      const resolvedParams = { ...params, company_id: companyId ?? params.company_id };
      const response =
        scope === "agent"
          ? await getAgentAttendanceMapSnapshot(resolvedParams, token)
          : await getAttendanceMapSnapshots(resolvedParams, token);
      return response.data;
    },
    enabled: enabled && !!token && !!(companyId ?? params.company_id),
    staleTime: 30_000,
    refetchInterval,
  });

  useEffect(() => {
    if (query.data?.items) {
      setSnapshots(query.data.items);
    }
  }, [query.data?.items, setSnapshots]);

  return query;
}
