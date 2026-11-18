'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChartNoAxesCombined } from 'lucide-react';
// import { FactoryDemoTabs } from '@/components/map/factory-demo-tabs';
import { MapToolbarTarget } from '@/components/map/map-toolbar-controls';
import dynamic from 'next/dynamic';
import { MapDemoBridge } from '@/components/map/map-demo-bridge';
import type { DemoMarket } from '@/lib/map/factory-demo';

const loading = () => <div className="h-[70vh] animate-pulse bg-slate-100" aria-label="Loading map" />;
const MapView = dynamic(() => import('@/components/map/map-view').then((module) => module.MapView), { ssr: false, loading });
const FactoryDemoMap = dynamic(() => import('@/components/map/factory-demo-map').then((module) => module.FactoryDemoMap), { ssr: false, loading });

export function MapScreens({ market, companyId }: { market?: DemoMarket; companyId?: number }) {
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  return (
    <MapToolbarTarget.Provider value={toolbarTarget}>
      <div className={market ? "hidden" : "relative z-50 flex items-center gap-2 border-b border-slate-200 bg-[#f6faf9] px-2 py-2 md:gap-3 md:px-8"}>
        {/* <FactoryDemoTabs market={market} /> */}
        <div ref={setToolbarTarget} className={market ? "min-w-0 overflow-x-auto py-1" : undefined} />
        <Link aria-label="History & analytics" className="ml-auto shrink-0 rounded-xl px-2 py-2 text-sm font-semibold text-[#105c60] hover:bg-teal-100 sm:px-3" href={`/admin/map/analytics${market ? `?market=${market}` : ''}`}>
          <ChartNoAxesCombined size={18} className="sm:hidden" />
          <span className="hidden sm:inline">History &amp; analytics</span>
        </Link>
      </div>
      {market ? <FactoryDemoMap market={market} companyId={companyId} /> : <><MapDemoBridge /><MapView /></>}
    </MapToolbarTarget.Provider>
  );
}
