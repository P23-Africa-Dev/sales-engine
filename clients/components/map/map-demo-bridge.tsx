'use client';

import { useEffect } from 'react';
import seed from '@/data/data.json';
import { useTrackingStore } from '@/store/tracking';
import { useAttendanceMapStore } from '@/store/attendance-map';
import { useFieldActivityLiveStore, type FieldActivityLiveAgent } from '@/store/field-activity-live';
import { useAuthStore } from '@/store/auth';
import { useMapAnalyticsStore } from '@/store/map-analytics';
import type { LiveTaskState } from '@/types/tracking';
import type { AttendanceMapSnapshotItem } from '@/lib/api/attendance';

type DemoAgent = {
  user_id: number;
  name: string;
  avatar_url?: string | null;
  session: { id: number };
  last_movement_state?: string | null;
  route: { coordinates: [number, number][] };
  stops: {
    id: number;
    field_activity_session_id: number;
    address?: string | null;
    latitude: number;
    longitude: number;
    duration_seconds?: number;
    classification?: string | null;
    arrived_at?: string | null;
    departed_at?: string | null;
  }[];
};

const STEP_MS = 4000;

const TASK_TITLES = [
  'Client visit — Paystack Ventures HQ',
  'Merchant onboarding — Bolt Fleet NG',
  'Product demo — Flutterwave Merchant Labs',
  'Follow-up meeting — Interswitch Retail Ajah',
  'Site survey — NordTech Solutions GmbH',
];

const PROJECT_NAMES = [
  'Victoria Island Enterprise Q4',
  'Ikeja GRA SME Expansion',
  'Surulere Retail Rollout',
  'Ajah Corridor Growth',
  'Apapa Maritime & Logistics',
];

/**
 * Demo-only: there is no tracking WebSocket in this build, so feed the map's
 * live-tracking store, attendance store, and field-activity store from data/data.json
 * and walk each agent along its route.
 * Also sizes the map to sit exactly under this app's navbar.
 */
export function MapDemoBridge() {
  useEffect(() => {
    // 1. Ensure demo auth user & company context exist so admin layers (Territories, Analytics) are enabled.
    const currentAuthUser = useAuthStore.getState().user;
    if (!currentAuthUser || !currentAuthUser.active_company) {
      const seedUser = (seed as unknown as {
        user?: { id: number; name: string; email: string; organization_role?: string };
        organization?: { id: number; name: string; slug: string };
      }).user;
      const seedOrg = (seed as unknown as {
        organization?: { id: number; name: string; slug: string };
      }).organization;

      useAuthStore.getState().setUser({
        id: seedUser?.id ?? 7,
        name: seedUser?.name ?? 'Elijah Obominuru',
        email: seedUser?.email ?? 'demo@salesengine.app',
        avatar: null,
        access_role: 'owner',
        active_company: {
          id: seedOrg?.id ?? 1,
          company_id: seedOrg?.slug ?? 'p23-africa',
          name: seedOrg?.name ?? 'P23 Africa',
          status: 'active',
          role: 'owner',
          subscription_status: 'active',
          has_active_subscription: true,
          billing_enforced: false,
        },
      });
    }

    // 2. Hydrate persisted weekly archive state
    useMapAnalyticsStore.getState().hydrateWeeklyRecordsFromStorage();

    // 3. Hydrate Clocked-In Attendance snapshots from seed.map.attendanceSnapshots
    const rawSnapshots =
      ((seed as unknown as { map?: { attendanceSnapshots?: AttendanceMapSnapshotItem[] } }).map
        ?.attendanceSnapshots ?? []);
    const todayBase = new Date();
    todayBase.setHours(8, 0, 0, 0);
    const hydratedSnapshots: AttendanceMapSnapshotItem[] = rawSnapshots.map((item, idx) => ({
      ...item,
      clock_in_at: new Date(todayBase.getTime() + idx * 16 * 60_000).toISOString(),
    }));
    useAttendanceMapStore.getState().setSnapshots(hydratedSnapshots);

    const agents = (seed as unknown as { map: { fieldActivityLive: DemoAgent[] } }).map.fieldActivityLive;
    let tick = 0;

    const push = () => {
      const now = new Date();

      const entries: LiveTaskState[] = agents.map((agent, index) => {
        const route = agent.route.coordinates;
        const routeIndex = (tick + index) % route.length;
        const nextIndex = (routeIndex + 1) % route.length;
        const position = route[routeIndex];
        const nextPos = route[nextIndex];
        const destination = agent.stops[agent.stops.length - 1];

        const dLng = (nextPos?.[0] ?? position[0]) - position[0];
        const dLat = (nextPos?.[1] ?? position[1]) - position[1];
        const headingDeg =
          dLng !== 0 || dLat !== 0
            ? Math.round(((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360)
            : 45 * index;

        const remainingSteps = Math.max(1, route.length - 1 - routeIndex);
        const speedMps = Number((4.6 + index * 0.85).toFixed(1));
        const distanceRemainingMeters = Math.round(remainingSteps * 340 + index * 110);
        const etaSeconds = Math.max(90, Math.round(distanceRemainingMeters / speedMps));

        return {
          taskId: 60000 + agent.user_id,
          trackingSessionId: agent.session.id,
          userId: agent.user_id,
          agentName: agent.name,
          projectName: PROJECT_NAMES[index % PROJECT_NAMES.length],
          taskTitle: TASK_TITLES[index % TASK_TITLES.length],
          taskAddress: destination?.address ?? undefined,
          status: 'in_progress',
          destination: destination
            ? { lat: destination.latitude, lng: destination.longitude, radiusM: 120 }
            : undefined,
          lastPosition: position,
          polyline: route.slice(0, routeIndex + 1),
          trackingStartedAt: new Date(now.getTime() - 45 * 60_000).toISOString(),
          lastEventAt: now.toISOString(),
          lastReceivedAt: now.getTime(),
          movementStarted: true,
          speedMps,
          headingDeg,
          etaSeconds,
          distanceRemainingMeters,
          routeDeviationMeters: index === 3 ? 42 : 12 + index * 4,
          isOnline: true,
        };
      });

      useTrackingStore.getState().hydrateBatch(entries);

      // Keep FieldActivityLiveStore synchronized so Clocked-In trails & stops animate smoothly
      const liveFieldAgents: FieldActivityLiveAgent[] = agents.map((agent, index) => {
        const route = agent.route.coordinates;
        const routeIndex = (tick + index) % route.length;
        const position = route[routeIndex];
        return {
          userId: agent.user_id,
          name: agent.name,
          avatarUrl: agent.avatar_url ?? null,
          sessionId: agent.session.id,
          lastPosition: position,
          lastMovementState: agent.last_movement_state ?? 'moving',
          lastRecordedAt: now.toISOString(),
          polyline: route.slice(0, Math.max(2, routeIndex + 1)),
          stops: (agent.stops ?? []).map((s) => ({
            id: s.id,
            field_activity_session_id: s.field_activity_session_id,
            latitude: s.latitude,
            longitude: s.longitude,
            address: s.address,
            duration_seconds: s.duration_seconds,
            classification: s.classification,
            arrived_at: s.arrived_at,
            departed_at: s.departed_at,
          })),
        };
      });
      useFieldActivityLiveStore.getState().hydrate(liveFieldAgents);

      tick += 1;
    };

    push();
    const timer = window.setInterval(push, STEP_MS);

    const sizeMap = () => {
      const header = document.querySelector('.dashboard-shell > nav, .dashboard-shell > header');
      const offset = header ? Math.round(header.getBoundingClientRect().height) : 64;
      document.documentElement.style.setProperty('--map-top-offset', `${offset}px`);
    };
    sizeMap();
    window.addEventListener('resize', sizeMap);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', sizeMap);
    };
  }, []);

  return null;
}
