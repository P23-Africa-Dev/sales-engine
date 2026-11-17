'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FactoryDemoTabs } from './factory-demo-tabs';
import { MapAnalyticsHistoryDrawer } from './MapAnalyticsHistoryDrawer';
import { useMapAnalyticsStore } from '@/store/map-analytics';

export function LagosMapAnalytics({ agentId, initialTab }: { agentId?: number; initialTab?: string }) {
  const router = useRouter();
  const weeks = useMapAnalyticsStore((state) => state.weeklyRecords);

  useEffect(() => {
    const store = useMapAnalyticsStore.getState();
    store.hydrateWeeklyRecordsFromStorage();
    store.setIsPlayingRoute(false);
    store.setDrawerTab(initialTab === 'weekly' || initialTab === 'monthly' || initialTab === 'archive' ? initialTab : 'visits');
    store.setSelectedAgentId(agentId ?? null);
  }, [agentId, initialTab]);

  function viewCoordinate(lng: number, lat: number, zoom = 15) {
    router.push(`/admin/map?market=lagos&visitLng=${lng}&visitLat=${lat}&visitZoom=${zoom}`);
  }

  function fitCoordinates(coordinates: [number, number][]) {
    const bounds = coordinates.reduce(([west, south, east, north], [lng, lat]) =>
      [Math.min(west, lng), Math.min(south, lat), Math.max(east, lng), Math.max(north, lat)],
      [Infinity, Infinity, -Infinity, -Infinity]);
    if (bounds.every(Number.isFinite)) router.push(`/admin/map?market=lagos&visitBounds=${bounds.join(',')}`);
  }

  const visitTrend = weeks.filter((week) => week.status === 'active').slice().reverse()
    .map((week) => ({ week: `W${week.weekNumber}`, visits: week.totalVisits, target: week.targetVisits }));

  return (
    <section className="min-h-[75vh] bg-[#f5f8f7] px-4 py-6 text-dash-dark md:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin/map?market=lagos" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800"><ArrowLeft size={16} /> Operational map</Link>
        <div className="mb-5 mt-4 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold text-teal-800">Lagos</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Field activity analytics</h1></div>
          <FactoryDemoTabs analytics />
        </div>
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-bold">Weekly visits and targets</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visitTrend} accessibilityLayer><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="week" /><YAxis /><Tooltip /><Bar dataKey="visits" name="Visits" fill="#087e81" /><Bar dataKey="target" name="Target" fill="#91a8b5" /></BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <MapAnalyticsHistoryDrawer standalone onFlyToCoordinate={viewCoordinate} onFitCoordinates={fitCoordinates} />
      </div>
    </section>
  );
}
