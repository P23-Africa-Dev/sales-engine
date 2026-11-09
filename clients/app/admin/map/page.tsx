'use client';

import dynamic from 'next/dynamic';
import { MapDemoBridge } from '@/components/map/map-demo-bridge';

// Mapbox GL JS uses browser-only APIs, so the map renders on the client only.
const MapView = dynamic(
  () => import('@/components/map/map-view').then((m) => m.MapView),
  { ssr: false, loading: () => <div style={{ height: 'calc(100vh - 64px)' }} className="bg-[#e8ecef] animate-pulse" /> }
);

export default function MapPage() {
  return (
    <>
      <MapDemoBridge />
      <MapView />
    </>
  );
}
