'use client';

import { useEffect } from 'react';
import seed from '@/data/data.json';
import { useTrackingStore } from '@/store/tracking';
import type { LiveTaskState } from '@/types/tracking';

type DemoAgent = {
  user_id: number;
  name: string;
  session: { id: number };
  route: { coordinates: [number, number][] };
  stops: { address?: string | null; latitude: number; longitude: number }[];
};

const STEP_MS = 4000;

/**
 * Demo-only: there is no tracking WebSocket in this build, so feed the map's
 * live-tracking store from data/data.json and walk each agent along its route.
 * Also sizes the map to sit exactly under this app's (taller) navbar.
 */
export function MapDemoBridge() {
  useEffect(() => {
    const agents = (seed as unknown as { map: { fieldActivityLive: DemoAgent[] } }).map.fieldActivityLive;
    let tick = 0;

    const push = () => {
      const now = new Date();
      const entries: LiveTaskState[] = agents.map((agent, index) => {
        const route = agent.route.coordinates;
        const position = route[(tick + index) % route.length];
        const destination = agent.stops[agent.stops.length - 1];
        return {
          taskId: 60000 + agent.user_id,
          trackingSessionId: agent.session.id,
          userId: agent.user_id,
          agentName: agent.name,
          taskTitle: ['Client visit', 'Merchant onboarding', 'Product demo', 'Follow-up meeting', 'Site survey'][index % 5],
          taskAddress: destination?.address ?? undefined,
          status: 'in_progress',
          destination: destination ? { lat: destination.latitude, lng: destination.longitude, radiusM: 100 } : undefined,
          lastPosition: position,
          polyline: route.slice(0, ((tick + index) % route.length) + 1),
          trackingStartedAt: new Date(now.getTime() - 45 * 60_000).toISOString(),
          lastEventAt: now.toISOString(),
          lastReceivedAt: now.getTime(),
          movementStarted: true,
          speedMps: 4 + index,
          isOnline: true,
        };
      });
      useTrackingStore.getState().hydrateBatch(entries);
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
