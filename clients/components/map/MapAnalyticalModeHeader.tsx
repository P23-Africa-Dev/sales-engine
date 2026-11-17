"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Flame, Hexagon, History, MoreHorizontal } from "lucide-react";
import { DEMO_AGENT_DESCRIPTORS } from "@/lib/map/map-analytics-data";
import { MapActivityButton, MapToolbarControls, mapControlClass } from "./map-toolbar-controls";
import { useMapAnalyticsStore } from "@/store/map-analytics";

type MapAnalyticalModeHeaderProps = {
  onFitLagosFleet: () => void;
  activityPanelOpen: boolean;
  onToggleActivity?: () => void;
};

const optionClass = "flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-dash-dark hover:bg-slate-50";

export function MapAnalyticalModeHeader({
  onFitLagosFleet,
  activityPanelOpen,
  onToggleActivity,
}: MapAnalyticalModeHeaderProps) {
  const isAdminMap = usePathname() === "/admin/map";
  const heatmapEnabled = useMapAnalyticsStore((state) => state.heatmapEnabled);
  const setHeatmapEnabled = useMapAnalyticsStore((state) => state.setHeatmapEnabled);
  const territoryEnabled = useMapAnalyticsStore((state) => state.territoryLayerEnabled);
  const setTerritoryEnabled = useMapAnalyticsStore((state) => state.setTerritoryLayerEnabled);
  const territoryMode = useMapAnalyticsStore((state) => state.territoryVisualMode);
  const setTerritoryMode = useMapAnalyticsStore((state) => state.setTerritoryVisualMode);
  const colorScheme = useMapAnalyticsStore((state) => state.territoryColorScheme);
  const setColorScheme = useMapAnalyticsStore((state) => state.setTerritoryColorScheme);
  const openHistory = useMapAnalyticsStore((state) => state.openDrawerToTab);

  return (
    <MapToolbarControls>
      {onToggleActivity && (
        <MapActivityButton active={activityPanelOpen} onClick={onToggleActivity} />
      )}
      <details className="relative" onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}>
        <summary aria-label="Map options" title="Map options" className={`${mapControlClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <MoreHorizontal size={20} />
        </summary>
        <div className="absolute left-0 top-full mt-2 max-h-[60dvh] w-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
          <label className={optionClass}>
            <Flame size={16} className="text-amber-600" />
            Heat map
            <input className="ml-auto accent-teal-700" type="checkbox" checked={heatmapEnabled} onChange={(event) => setHeatmapEnabled(event.target.checked)} />
          </label>
          <label className={optionClass}>
            <Hexagon size={16} className="text-teal-700" />
            Territories
            <input className="ml-auto accent-teal-700" type="checkbox" checked={territoryEnabled} onChange={(event) => setTerritoryEnabled(event.target.checked)} />
          </label>
          {territoryEnabled && (
            <div className="space-y-2 px-3 pb-2 text-sm text-dash-dark">
              <select aria-label="Territory overlay" className="w-full rounded-lg border border-slate-200 p-2" value={territoryMode} onChange={(event) => setTerritoryMode(event.target.value as typeof territoryMode)}>
                <option value="boundaries">Assigned territories</option>
                <option value="coverage">Agent coverage</option>
                <option value="compare">Compare zones</option>
              </select>
              <select aria-label="Coverage colors" className="w-full rounded-lg border border-slate-200 p-2" value={colorScheme} onChange={(event) => setColorScheme(event.target.value as typeof colorScheme)}>
                <option value="agent">Color by agent</option>
                <option value="health">Color by coverage level</option>
              </select>
            </div>
          )}
          <div className="mt-1 border-t border-slate-100 pt-1">
            {isAdminMap ? (
              <Link href="/admin/map/analytics" className={optionClass}><History size={16} /> History &amp; analytics</Link>
            ) : (
            <button type="button" className={optionClass} onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              openHistory("visits");
            }}>
              <History size={16} /> History &amp; Analytics
            </button>
            )}
            <button type="button" className={optionClass} onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onFitLagosFleet();
            }}>
              <Compass size={16} /> Fit Lagos fleet
            </button>
          </div>
        </div>
      </details>
    </MapToolbarControls>
  );
}

export function getLagosFleetCoordinates(): [number, number][] {
  return DEMO_AGENT_DESCRIPTORS.flatMap((agent) => agent.baseRoute);
}
