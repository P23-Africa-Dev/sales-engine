"use client";

import { useMemo } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  CalendarDays,
  Compass,
  Flame,
  Hexagon,
  History,
  Layers,
  Radio,
} from "lucide-react";
import {
  DEMO_AGENT_DESCRIPTORS,
  getMonthlyActivitySummaries,
} from "@/lib/map/map-analytics-data";
import { useMapAnalyticsStore } from "@/store/map-analytics";

export type MapAnalyticalModeHeaderProps = {
  onFitLagosFleet: () => void;
};

export function MapAnalyticalModeHeader({
  onFitLagosFleet,
}: MapAnalyticalModeHeaderProps) {
  const viewMode = useMapAnalyticsStore((s) => s.viewMode);
  const setViewMode = useMapAnalyticsStore((s) => s.setViewMode);
  const drawerOpen = useMapAnalyticsStore((s) => s.drawerOpen);
  const drawerTab = useMapAnalyticsStore((s) => s.drawerTab);
  const openDrawerToTab = useMapAnalyticsStore((s) => s.openDrawerToTab);
  const setDrawerOpen = useMapAnalyticsStore((s) => s.setDrawerOpen);

  const heatmapEnabled = useMapAnalyticsStore((s) => s.heatmapEnabled);
  const setHeatmapEnabled = useMapAnalyticsStore((s) => s.setHeatmapEnabled);

  const territoryLayerEnabled = useMapAnalyticsStore(
    (s) => s.territoryLayerEnabled
  );
  const setTerritoryLayerEnabled = useMapAnalyticsStore(
    (s) => s.setTerritoryLayerEnabled
  );
  const territoryVisualMode = useMapAnalyticsStore(
    (s) => s.territoryVisualMode
  );
  const setTerritoryVisualMode = useMapAnalyticsStore(
    (s) => s.setTerritoryVisualMode
  );
  const territoryColorScheme = useMapAnalyticsStore(
    (s) => s.territoryColorScheme
  );
  const setTerritoryColorScheme = useMapAnalyticsStore(
    (s) => s.setTerritoryColorScheme
  );
  const setTerritoryLegendOpen = useMapAnalyticsStore(
    (s) => s.setTerritoryLegendOpen
  );

  const selectedWeekId = useMapAnalyticsStore((s) => s.selectedWeekId);
  const selectedMonthId = useMapAnalyticsStore((s) => s.selectedMonthId);
  const weeklyRecords = useMapAnalyticsStore((s) => s.weeklyRecords);

  const currentWeek = useMemo(
    () =>
      weeklyRecords.find((w) => w.weekId === selectedWeekId) ??
      weeklyRecords[0],
    [weeklyRecords, selectedWeekId]
  );

  const monthlySummaries = useMemo(() => getMonthlyActivitySummaries(), []);
  const currentMonth = useMemo(
    () =>
      monthlySummaries.find((m) => m.monthId === selectedMonthId) ??
      monthlySummaries[0],
    [monthlySummaries, selectedMonthId]
  );

  const eligibleArchiveCount = useMemo(
    () =>
      weeklyRecords.filter((w) => w.status === "active" && w.eligibleForArchive)
        .length,
    [weeklyRecords]
  );

  const archivedCount = useMemo(
    () => weeklyRecords.filter((w) => w.status === "archived").length,
    [weeklyRecords]
  );

  return (
    <div className="pointer-events-none absolute top-4 left-4 right-4 md:top-6 md:left-[384px] md:right-[348px] xl:right-[388px] z-30 flex flex-col items-center gap-2">
      {/* Primary Mode & Quick Layer Switcher Bar */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-slate-200/80 bg-white/95 px-2.5 py-1.5 shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        {/* Operational vs Analytical Mode Switch */}
        <div className="flex items-center rounded-full bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("operational")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-all ${
              viewMode === "operational"
                ? "bg-[#0A192F] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Radio
              size={13}
              className={
                viewMode === "operational" ? "text-[#2AE9C9]" : "text-slate-400"
              }
            />
            Operational Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode("analytical")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-all ${
              viewMode === "analytical"
                ? "bg-[#0A192F] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Activity
              size={13}
              className={
                viewMode === "analytical" ? "text-[#2AE9C9]" : "text-slate-400"
              }
            />
            Analytical View
          </button>
        </div>

        <span className="h-4 w-px bg-slate-200 mx-0.5 hidden sm:inline-block" />

        {/* Territory / Coverage Mode Quick Pill */}
        <button
          type="button"
          onClick={() => {
            if (!territoryLayerEnabled) {
              setTerritoryLayerEnabled(true);
              setTerritoryLegendOpen(true);
            } else if (territoryVisualMode === "boundaries") {
              setTerritoryVisualMode("coverage");
            } else if (territoryVisualMode === "coverage") {
              setTerritoryVisualMode("compare");
            } else {
              setTerritoryVisualMode("boundaries");
            }
          }}
          title="Cycle Territory Visualization: Assigned Zones → Coverage Footprints → Compare Overlay"
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
            territoryLayerEnabled
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Hexagon size={13} className="text-emerald-600" />
          <span>
            {!territoryLayerEnabled
              ? "Territories Off"
              : territoryVisualMode === "coverage"
                ? "Coverage Areas"
                : territoryVisualMode === "compare"
                  ? "Compare Zones"
                  : "Territories (5)"}
          </span>
        </button>

        {/* Colour-Coded Coverage RAG Toggle */}
        <button
          type="button"
          onClick={() => {
            setTerritoryLayerEnabled(true);
            setTerritoryVisualMode("coverage");
            setTerritoryColorScheme(
              territoryColorScheme === "health" ? "agent" : "health"
            );
          }}
          title="Toggle Colour-Coded Coverage Health (RAG vs Agent Palette)"
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
            territoryLayerEnabled && territoryColorScheme === "health"
              ? "bg-amber-500 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Layers size={13} />
          <span>
            {territoryColorScheme === "health"
              ? "RAG Coverage"
              : "Colour Coverage"}
          </span>
        </button>

        {/* Heatmap Toggle */}
        <button
          type="button"
          onClick={() => setHeatmapEnabled(!heatmapEnabled)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
            heatmapEnabled
              ? "bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Flame size={13} />
          <span>Heat Map</span>
        </button>

        {/* Visit History & Weekly/Monthly Drawer Toggle */}
        <button
          type="button"
          onClick={() => {
            if (drawerOpen) {
              setDrawerOpen(false);
            } else {
              openDrawerToTab("visits");
            }
          }}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
            drawerOpen
              ? "bg-[#0A192F] text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <History size={13} className={drawerOpen ? "text-[#2AE9C9]" : ""} />
          <span>History & Analytics</span>
          {eligibleArchiveCount > 0 && (
            <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[9.5px] font-extrabold text-white">
              {eligibleArchiveCount}
            </span>
          )}
        </button>

        {/* Fit Lagos Fleet */}
        <button
          type="button"
          onClick={onFitLagosFleet}
          title="Fit all 5 Lagos territories and active field agents"
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-200 transition-all"
        >
          <Compass size={13} className="text-dash-teal" />
          <span className="hidden md:inline">Fit Lagos Fleet</span>
        </button>
      </div>

      {/* Analytical KPI Ribbon (visible when Analytical View is active) */}
      {viewMode === "analytical" && currentWeek && currentMonth && (
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-3xl border border-slate-200/80 bg-[#0A192F]/95 px-4 py-2 text-white shadow-[0_16px_40px_rgba(15,23,42,0.25)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => openDrawerToTab("visits")}
            className={`flex items-center gap-2 rounded-2xl px-2.5 py-1 text-left transition-colors ${
              drawerOpen && drawerTab === "visits"
                ? "bg-white/15"
                : "hover:bg-white/10"
            }`}
          >
            <History size={14} className="text-[#2AE9C9]" />
            <div>
              <p className="text-[9.5px] uppercase tracking-wider text-slate-300 font-semibold">
                Visit History ({currentWeek.label})
              </p>
              <p className="text-[12.5px] font-extrabold">
                {currentWeek.totalVisits} visits · {currentWeek.totalDistanceKm}{" "}
                km
              </p>
            </div>
          </button>

          <span className="h-6 w-px bg-white/15 hidden sm:inline-block" />

          <button
            type="button"
            onClick={() => openDrawerToTab("weekly")}
            className={`flex items-center gap-2 rounded-2xl px-2.5 py-1 text-left transition-colors ${
              drawerOpen && drawerTab === "weekly"
                ? "bg-white/15"
                : "hover:bg-white/10"
            }`}
          >
            <CalendarDays size={14} className="text-sky-400" />
            <div>
              <p className="text-[9.5px] uppercase tracking-wider text-slate-300 font-semibold">
                Weekly Efficiency & Coverage
              </p>
              <p className="text-[12.5px] font-extrabold">
                {currentWeek.travelEfficiencyPct}% eff ·{" "}
                <span className="text-[#2AE9C9]">
                  {currentWeek.coveragePct}% covered
                </span>
              </p>
            </div>
          </button>

          <span className="h-6 w-px bg-white/15 hidden sm:inline-block" />

          <button
            type="button"
            onClick={() => openDrawerToTab("monthly")}
            className={`flex items-center gap-2 rounded-2xl px-2.5 py-1 text-left transition-colors ${
              drawerOpen && drawerTab === "monthly"
                ? "bg-white/15"
                : "hover:bg-white/10"
            }`}
          >
            <BarChart3 size={14} className="text-amber-400" />
            <div>
              <p className="text-[9.5px] uppercase tracking-wider text-slate-300 font-semibold">
                {currentMonth.shortLabel} Summary
              </p>
              <p className="text-[12.5px] font-extrabold">
                {currentMonth.totalVisits} visits ·{" "}
                {currentMonth.uniqueBusinessesVisited} accounts
              </p>
            </div>
          </button>

          <span className="h-6 w-px bg-white/15 hidden sm:inline-block" />

          <button
            type="button"
            onClick={() => openDrawerToTab("archive")}
            className={`flex items-center gap-2 rounded-2xl px-2.5 py-1 text-left transition-colors ${
              drawerOpen && drawerTab === "archive"
                ? "bg-white/15"
                : "hover:bg-white/10"
            }`}
          >
            <Archive size={14} className="text-rose-400" />
            <div>
              <p className="text-[9.5px] uppercase tracking-wider text-slate-300 font-semibold">
                Weekly Archive Vault
              </p>
              <p className="text-[12.5px] font-extrabold">
                {archivedCount} archived ·{" "}
                <span className="text-amber-300">
                  {eligibleArchiveCount} eligible
                </span>
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

export function getLagosFleetCoordinates(): [number, number][] {
  return DEMO_AGENT_DESCRIPTORS.flatMap((d) => d.baseRoute);
}
