"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FastForward,
  History,
  MapPin,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  CLASSIFICATION_META,
  DEMO_AGENT_DESCRIPTORS,
  getMonthlyActivitySummaries,
  type DayOfWeekShort,
  type EnrichedVisitStop,
  type VisitClassification,
} from "@/lib/map/map-analytics-data";
import {
  useMapAnalyticsStore,
  type AnalyticsDrawerTab,
} from "@/store/map-analytics";

export type MapAnalyticsHistoryDrawerProps = {
  onFlyToCoordinate: (lng: number, lat: number, zoom?: number) => void;
  onFitCoordinates: (coords: [number, number][]) => void;
};

function formatCurrencyNgn(amount: number): string {
  if (amount >= 1_000_000) {
    return `₦${(amount / 1_000_000).toFixed(1)}M`;
  }
  return `₦${amount.toLocaleString()}`;
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

export function MapAnalyticsHistoryDrawer({
  onFlyToCoordinate,
  onFitCoordinates,
}: MapAnalyticsHistoryDrawerProps) {
  const drawerOpen = useMapAnalyticsStore((s) => s.drawerOpen);
  const setDrawerOpen = useMapAnalyticsStore((s) => s.setDrawerOpen);
  const drawerTab = useMapAnalyticsStore((s) => s.drawerTab);
  const setDrawerTab = useMapAnalyticsStore((s) => s.setDrawerTab);
  const selectedAgentId = useMapAnalyticsStore((s) => s.selectedAgentId);
  const setSelectedAgentId = useMapAnalyticsStore((s) => s.setSelectedAgentId);
  const selectedWeekId = useMapAnalyticsStore((s) => s.selectedWeekId);
  const setSelectedWeekId = useMapAnalyticsStore((s) => s.setSelectedWeekId);
  const selectedDayOfWeek = useMapAnalyticsStore((s) => s.selectedDayOfWeek);
  const setSelectedDayOfWeek = useMapAnalyticsStore(
    (s) => s.setSelectedDayOfWeek
  );
  const selectedMonthId = useMapAnalyticsStore((s) => s.selectedMonthId);
  const setSelectedMonthId = useMapAnalyticsStore((s) => s.setSelectedMonthId);

  const playbackIndex = useMapAnalyticsStore((s) => s.playbackIndex);
  const setPlaybackIndex = useMapAnalyticsStore((s) => s.setPlaybackIndex);
  const isPlayingRoute = useMapAnalyticsStore((s) => s.isPlayingRoute);
  const setIsPlayingRoute = useMapAnalyticsStore((s) => s.setIsPlayingRoute);

  const weeklyRecords = useMapAnalyticsStore((s) => s.weeklyRecords);
  const archiveWeek = useMapAnalyticsStore((s) => s.archiveWeek);
  const archiveAllEligibleWeeks = useMapAnalyticsStore(
    (s) => s.archiveAllEligibleWeeks
  );
  const restoreArchivedWeek = useMapAnalyticsStore(
    (s) => s.restoreArchivedWeek
  );

  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);
  const [archiveFilter, setArchiveFilter] = useState<"all" | "archived" | "eligible">("all");
  const [archiveReasonInput, setArchiveReasonInput] = useState(
    "Agreed 4-week retention policy"
  );

  const monthlySummaries = useMemo(() => getMonthlyActivitySummaries(), []);

  const currentWeek = useMemo(
    () =>
      weeklyRecords.find((w) => w.weekId === selectedWeekId) ??
      weeklyRecords[0],
    [weeklyRecords, selectedWeekId]
  );

  const currentMonth = useMemo(
    () =>
      monthlySummaries.find((m) => m.monthId === selectedMonthId) ??
      monthlySummaries[0],
    [monthlySummaries, selectedMonthId]
  );

  const eligibleWeeksCount = useMemo(
    () =>
      weeklyRecords.filter((w) => w.status === "active" && w.eligibleForArchive)
        .length,
    [weeklyRecords]
  );

  const archivedWeeksCount = useMemo(
    () => weeklyRecords.filter((w) => w.status === "archived").length,
    [weeklyRecords]
  );

  // Filtered stops & route for Visit History and Weekly views
  const { activeStops, activePolyline, summaryStats } = useMemo(() => {
    if (!currentWeek) {
      return {
        activeStops: [] as EnrichedVisitStop[],
        activePolyline: [] as [number, number][],
        summaryStats: {
          visits: 0,
          targetVisits: 0,
          distanceKm: 0,
          dwellMins: 0,
          efficiencyPct: 0,
          coveragePct: 0,
        },
      };
    }

    const agents =
      selectedAgentId != null
        ? currentWeek.agentBreakdown.filter((a) => a.userId === selectedAgentId)
        : currentWeek.agentBreakdown;

    let stops = agents.flatMap((a) => a.stops);
    if (drawerTab === "weekly" && selectedDayOfWeek !== "all") {
      stops = stops.filter((s) => s.dayOfWeek === selectedDayOfWeek);
    }

    const resequenced = stops.map((s, idx) => ({ ...s, sequence: idx + 1 }));
    const polyline = agents.flatMap((a) => a.polyline);
    const distanceKm = Number(
      agents.reduce((s, a) => s + a.distanceKm, 0).toFixed(1)
    );
    const targetVisits = agents.reduce((s, a) => s + a.targetVisits, 0);
    const dwellMins = Math.round(
      resequenced.reduce((s, st) => s + st.durationSeconds, 0) / 60
    );
    const efficiencyPct =
      agents.length > 0
        ? Math.round(
            agents.reduce((s, a) => s + a.efficiencyPct, 0) / agents.length
          )
        : 0;
    const coveragePct =
      agents.length > 0
        ? Math.round(
            agents.reduce((s, a) => s + a.coveragePct, 0) / agents.length
          )
        : 0;

    return {
      activeStops: resequenced,
      activePolyline: polyline,
      summaryStats: {
        visits: resequenced.length,
        targetVisits,
        distanceKm,
        dwellMins,
        efficiencyPct,
        coveragePct,
      },
    };
  }, [currentWeek, selectedAgentId, drawerTab, selectedDayOfWeek]);

  // Route playback animation timer
  useEffect(() => {
    if (!isPlayingRoute || activePolyline.length < 2) return;
    const intervalMs = Math.max(180, Math.round(900 / playbackSpeed));
    const timer = window.setInterval(() => {
      const current = useMapAnalyticsStore.getState().playbackIndex;
      if (current >= activePolyline.length - 1) {
        useMapAnalyticsStore.getState().setIsPlayingRoute(false);
      } else {
        const nextIdx = current + 1;
        useMapAnalyticsStore.getState().setPlaybackIndex(nextIdx);
        const pt = activePolyline[nextIdx];
        if (pt) {
          onFlyToCoordinate(pt[0], pt[1], 14.5);
        }
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlayingRoute, activePolyline, playbackSpeed, onFlyToCoordinate]);

  const handleExportMonthlyCsv = () => {
    if (!currentMonth) return;
    const headers = [
      "Period",
      "Agent Name",
      "Territory",
      "Visits Completed",
      "Monthly Quota",
      "Attainment (%)",
      "Unique Clients Visited",
      "Distance Traveled (km)",
      "Field Hours",
      "Travel Efficiency (%)",
      "Territory Coverage (%)",
      "On-Time Days",
      "Late Days",
      "Pipeline Influenced (NGN)",
      "Top Client Visited",
    ];
    const rows = currentMonth.agentSummaries.map((a) => [
      currentMonth.label,
      a.agentName,
      a.territoryName,
      String(a.visits),
      String(a.quota),
      `${Math.round((a.visits / Math.max(1, a.quota)) * 100)}%`,
      String(a.uniqueClients),
      String(a.distanceKm),
      String(a.fieldHours),
      `${a.travelEfficiencyPct}%`,
      `${a.coveragePct}%`,
      String(a.onTimeDays),
      String(a.lateCount),
      String(a.pipelineInfluencedNgn),
      `"${a.topClientVisited.replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `salesengine-monthly-activity-${currentMonth.monthId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${currentMonth.label} summary CSV`);
  };

  if (!drawerOpen) return null;

  return (
    <div className="absolute top-20 right-4 bottom-20 z-30 w-[min(94vw,430px)] rounded-[32px] border border-slate-200/80 bg-white/98 shadow-[0_24px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl flex flex-col overflow-hidden">
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0 bg-gradient-to-r from-[#0A192F] to-[#132B4A] text-white">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[#2AE9C9] shrink-0" />
            <h3 className="text-[14.5px] font-bold truncate">
              Field Activity & Analytical Intelligence
            </h3>
          </div>
          <p className="text-[11px] text-slate-300 mt-0.5 truncate">
            Visit histories, weekly routes, monthly rollups & archive vault
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white shrink-0"
          title="Close panel"
        >
          <X size={15} />
        </button>
      </div>

      {/* 4-Tab Navigation Bar */}
      <div className="grid grid-cols-4 gap-1 border-b border-slate-100 bg-slate-50 px-3 py-2 shrink-0">
        {(
          [
            { id: "visits", label: "Visit History", icon: History },
            { id: "weekly", label: "Weekly View", icon: CalendarDays },
            { id: "monthly", label: "Monthly", icon: BarChart3 },
            {
              id: "archive",
              label: `Archive (${archivedWeeksCount})`,
              icon: Archive,
            },
          ] as { id: AnalyticsDrawerTab; label: string; icon: typeof History }[]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = drawerTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDrawerTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl py-2 px-1.5 text-[11px] font-semibold transition-all ${
                active
                  ? "bg-[#0A192F] text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
              }`}
            >
              <Icon size={14} className={active ? "text-[#2AE9C9]" : ""} />
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Agent Filter Strip (shared across Visit History & Weekly tabs) */}
      {(drawerTab === "visits" || drawerTab === "weekly") && (
        <div className="border-b border-slate-100 px-4 py-2.5 bg-white shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Filter by Field Agent
            </span>
            <button
              type="button"
              onClick={() => {
                if (activePolyline.length > 0) {
                  onFitCoordinates(activePolyline);
                }
              }}
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-dash-teal hover:underline"
            >
              <Navigation size={11} />
              Fit route on map
            </button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedAgentId(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                selectedAgentId === null
                  ? "bg-[#0A192F] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Agents (5)
            </button>
            {DEMO_AGENT_DESCRIPTORS.map((agent) => {
              const active = selectedAgentId === agent.userId;
              return (
                <button
                  key={agent.userId}
                  type="button"
                  onClick={() => {
                    setSelectedAgentId(agent.userId);
                    if (agent.baseRoute.length > 0) {
                      onFitCoordinates(agent.baseRoute);
                    }
                  }}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                    active
                      ? "bg-[#0A192F] text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span>{agent.agentName.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 1: AGENT VISIT HISTORIES */}
      {drawerTab === "visits" && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Route Playback Scrubber Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">
                Historical Route Playback
              </span>
              <div className="flex items-center gap-1">
                {([1, 2, 4] as const).map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      playbackSpeed === spd
                        ? "bg-[#0A192F] text-white"
                        : "bg-white text-slate-500 border border-slate-200"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (playbackIndex >= activePolyline.length - 1) {
                    setPlaybackIndex(0);
                  }
                  setIsPlayingRoute(!isPlayingRoute);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dash-teal text-white shadow-xs hover:opacity-95"
                title={isPlayingRoute ? "Pause playback" : "Play route"}
              >
                {isPlayingRoute ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlayingRoute(false);
                  setPlaybackIndex(0);
                  const first = activePolyline[0];
                  if (first) onFlyToCoordinate(first[0], first[1], 14);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                title="Reset playback"
              >
                <RotateCcw size={13} />
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, activePolyline.length - 1)}
                value={Math.min(
                  playbackIndex,
                  Math.max(0, activePolyline.length - 1)
                )}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setIsPlayingRoute(false);
                  setPlaybackIndex(idx);
                  const pt = activePolyline[idx];
                  if (pt) onFlyToCoordinate(pt[0], pt[1], 14.5);
                }}
                className="flex-1 accent-dash-teal cursor-pointer"
              />
              <span className="text-[10.5px] font-semibold text-slate-500 tabular-nums">
                {playbackIndex + 1}/{Math.max(1, activePolyline.length)}
              </span>
            </div>
          </div>

          {/* Summary KPI Grid */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-2">
              <p className="text-[9.5px] font-bold uppercase text-slate-400">
                Visits
              </p>
              <p className="text-[14px] font-extrabold text-slate-800 mt-0.5">
                {summaryStats.visits}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-2">
              <p className="text-[9.5px] font-bold uppercase text-slate-400">
                Distance
              </p>
              <p className="text-[14px] font-extrabold text-slate-800 mt-0.5">
                {summaryStats.distanceKm} km
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-2">
              <p className="text-[9.5px] font-bold uppercase text-slate-400">
                Dwell Time
              </p>
              <p className="text-[14px] font-extrabold text-slate-800 mt-0.5">
                {Math.floor(summaryStats.dwellMins / 60)}h{" "}
                {summaryStats.dwellMins % 60}m
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-2">
              <p className="text-[9.5px] font-bold uppercase text-slate-400">
                Efficiency
              </p>
              <p className="text-[14px] font-extrabold text-emerald-600 mt-0.5">
                {summaryStats.efficiencyPct}%
              </p>
            </div>
          </div>

          {/* Chronological Stop List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Chronological Visit Log ({activeStops.length})
              </p>
              <span className="text-[10.5px] text-slate-400">
                Click any stop to inspect on map
              </span>
            </div>

            {activeStops.map((stop) => {
              const meta = CLASSIFICATION_META[stop.classification];
              const dwellMins = Math.round(stop.durationSeconds / 60);
              return (
                <button
                  key={stop.id}
                  type="button"
                  onClick={() =>
                    onFlyToCoordinate(stop.longitude, stop.latitude, 16)
                  }
                  className="w-full text-left rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs transition-all hover:border-dash-teal hover:bg-slate-50/70"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white shadow-xs mt-0.5"
                      style={{ backgroundColor: meta.color }}
                    >
                      #{stop.sequence}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[13px] font-bold text-slate-800">
                          {stop.businessName}
                        </p>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${meta.bgClass} ${meta.textClass}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-slate-500 mt-0.5">
                        {stop.address}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-600">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: stop.territoryColor }}
                          />
                          {stop.agentName}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} className="text-slate-400" />
                          {stop.dayOfWeek} · {formatTimeShort(stop.arrivedAt)} –{" "}
                          {formatTimeShort(stop.departedAt)} ({dwellMins}m)
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          {stop.outcome}
                        </span>
                        <span className="text-[10.5px] font-bold text-slate-700">
                          {formatCurrencyNgn(stop.dealValueNgn)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: WEEKLY VISIT HISTORY VIEWS */}
      {drawerTab === "weekly" && currentWeek && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Week Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Select Weekly Period
              </label>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  currentWeek.status === "archived"
                    ? "bg-amber-100 text-amber-800"
                    : currentWeek.eligibleForArchive
                      ? "bg-sky-100 text-sky-800"
                      : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {currentWeek.status === "archived"
                  ? "Archived Record"
                  : currentWeek.eligibleForArchive
                    ? "Eligible for Archive (>4w)"
                    : "Active Retention Window"}
              </span>
            </div>

            <select
              value={selectedWeekId}
              onChange={(e) => setSelectedWeekId(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-[12.5px] font-bold text-slate-800 shadow-xs outline-none focus:border-dash-teal"
            >
              {weeklyRecords.map((w) => (
                <option key={w.weekId} value={w.weekId}>
                  {w.label} · {w.dateRangeLabel} ({w.totalVisits} visits)
                  {w.status === "archived"
                    ? " [ARCHIVED]"
                    : w.eligibleForArchive
                      ? " [ELIGIBLE FOR ARCHIVE]"
                      : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Archive Eligibility / Status Banner */}
          {currentWeek.status === "active" && currentWeek.eligibleForArchive && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[11.5px] font-bold text-amber-900">
                  Older than 4-week active window
                </p>
                <p className="text-[10.5px] text-amber-700">
                  This completed week is eligible to be archived as agreed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  archiveWeek(
                    currentWeek.weekId,
                    "Agreed 4-week retention policy"
                  );
                  toast.success(`Archived ${currentWeek.label}`);
                }}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
              >
                <Archive size={12} />
                Archive Week
              </button>
            </div>
          )}

          {currentWeek.status === "archived" && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[11.5px] font-bold text-slate-800">
                  Archived Weekly Record (Read-Only Preview)
                </p>
                <p className="text-[10.5px] text-slate-500 truncate">
                  {currentWeek.archiveReason ?? "Archived under retention policy"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  restoreArchivedWeek(currentWeek.weekId);
                  toast.success(`Restored ${currentWeek.label} to active records`);
                }}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0A192F] px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90"
              >
                <ArchiveRestore size={12} />
                Restore
              </button>
            </div>
          )}

          {/* Weekly KPI Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-2.5">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Weekly Visits
              </p>
              <p className="text-[15px] font-extrabold text-slate-800 mt-0.5">
                {summaryStats.visits}{" "}
                <span className="text-[11px] font-semibold text-slate-400">
                  / {summaryStats.targetVisits}
                </span>
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-2.5">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Distance
              </p>
              <p className="text-[15px] font-extrabold text-slate-800 mt-0.5">
                {summaryStats.distanceKm} km
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-2.5">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Coverage / Eff.
              </p>
              <p className="text-[15px] font-extrabold text-dash-teal mt-0.5">
                {summaryStats.coveragePct}% · {summaryStats.efficiencyPct}%
              </p>
            </div>
          </div>

          {/* 7-Day Interactive Breakdown Strip */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">
                Day-by-Day Activity Breakdown
              </span>
              <button
                type="button"
                onClick={() => setSelectedDayOfWeek("all")}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  selectedDayOfWeek === "all"
                    ? "bg-[#0A192F] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Week ({currentWeek.totalVisits})
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {currentWeek.dailyBreakdown.map((d) => {
                const isSelected = selectedDayOfWeek === d.day;
                const maxVisits = Math.max(
                  1,
                  ...currentWeek.dailyBreakdown.map((x) => x.visits)
                );
                const barHeightPct = Math.max(
                  12,
                  Math.round((d.visits / maxVisits) * 100)
                );

                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() =>
                      setSelectedDayOfWeek(
                        selectedDayOfWeek === d.day ? "all" : d.day
                      )
                    }
                    className={`flex flex-col items-center rounded-xl p-1.5 transition-all border ${
                      isSelected
                        ? "border-[#0A192F] bg-[#0A192F] text-white shadow-xs"
                        : "border-slate-100 bg-slate-50/70 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-[10px] font-bold">{d.day}</span>
                    <span
                      className={`text-[9px] ${
                        isSelected ? "text-slate-300" : "text-slate-400"
                      }`}
                    >
                      {d.dateLabel.split(" ")[1]}
                    </span>
                    <div className="my-1.5 flex h-10 w-full items-end justify-center rounded-md bg-black/5 p-0.5">
                      <div
                        className="w-3 rounded-sm transition-all"
                        style={{
                          height: `${barHeightPct}%`,
                          backgroundColor: isSelected ? "#2AE9C9" : "#0EA5E9",
                        }}
                      />
                    </div>
                    <span className="text-[10.5px] font-extrabold">
                      {d.visits}
                    </span>
                    <span
                      className={`text-[8.5px] ${
                        isSelected ? "text-slate-300" : "text-slate-400"
                      }`}
                    >
                      {d.distanceKm}km
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-Agent Weekly Performance Cards */}
          <div className="space-y-2">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              Territory & Agent Weekly Breakdown
            </p>
            {currentWeek.agentBreakdown.map((agent) => {
              const pct = Math.min(
                100,
                Math.round((agent.visits / Math.max(1, agent.targetVisits)) * 100)
              );
              return (
                <div
                  key={agent.userId}
                  className="rounded-2xl border border-slate-200/80 bg-white p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3.5 w-3.5 rounded-md shrink-0"
                        style={{ backgroundColor: agent.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-bold text-slate-800 truncate">
                          {agent.agentName}
                        </p>
                        <p className="text-[10.5px] text-slate-400 truncate">
                          {agent.territoryName}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAgentId(agent.userId);
                        if (agent.polyline.length > 0) {
                          onFitCoordinates(agent.polyline);
                        }
                      }}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Plot Week Route
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-[10.5px]">
                    <div className="rounded-xl bg-slate-50 py-1.5 px-1">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                        Visits
                      </span>
                      <span className="font-bold text-slate-800">
                        {agent.visits}/{agent.targetVisits}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 py-1.5 px-1">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                        Distance
                      </span>
                      <span className="font-bold text-slate-800">
                        {agent.distanceKm} km
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 py-1.5 px-1">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                        Coverage
                      </span>
                      <span className="font-bold text-slate-800">
                        {agent.coveragePct}%
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 py-1.5 px-1">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                        Efficiency
                      </span>
                      <span className="font-bold text-emerald-600">
                        {agent.efficiencyPct}%
                      </span>
                    </div>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: agent.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: MONTHLY ACTIVITY SUMMARIES */}
      {drawerTab === "monthly" && currentMonth && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Month Selector & CSV Export */}
          <div className="flex items-center justify-between gap-2">
            <select
              value={selectedMonthId}
              onChange={(e) => setSelectedMonthId(e.target.value)}
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-bold text-slate-800 shadow-xs outline-none focus:border-dash-teal"
            >
              {monthlySummaries.map((m) => (
                <option key={m.monthId} value={m.monthId}>
                  {m.label} ({m.totalVisits} visits)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportMonthlyCsv}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#0A192F] px-3.5 py-2 text-[11.5px] font-semibold text-white shadow-xs hover:opacity-95"
              title="Export monthly summary as CSV"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>

          {/* Executive Monthly KPI Cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400">
                <span>Total Monthly Visits</span>
                <TrendingUp size={12} className="text-emerald-500" />
              </div>
              <p className="text-[18px] font-extrabold text-slate-900 mt-1">
                {currentMonth.totalVisits}{" "}
                <span className="text-[11px] font-semibold text-slate-400">
                  / {currentMonth.targetVisits} quota
                </span>
              </p>
              <p className="text-[10.5px] text-emerald-600 font-semibold mt-0.5">
                {currentMonth.uniqueBusinessesVisited} unique businesses visited
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400">
                <span>Fleet Distance & Hours</span>
                <Navigation size={12} className="text-sky-500" />
              </div>
              <p className="text-[18px] font-extrabold text-slate-900 mt-1">
                {currentMonth.totalDistanceKm} km
              </p>
              <p className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                {currentMonth.totalFieldHours}h logged ·{" "}
                {currentMonth.avgVisitsPerAgentDay} visits/day
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400">
                <span>Mean Territory Coverage</span>
                <MapPin size={12} className="text-dash-teal" />
              </div>
              <p className="text-[18px] font-extrabold text-dash-teal mt-1">
                {currentMonth.meanCoveragePct}%
              </p>
              <p className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                Across all 5 Lagos territories
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400">
                <span>Punctuality & Pipeline</span>
                <UserCheck size={12} className="text-violet-500" />
              </div>
              <p className="text-[18px] font-extrabold text-slate-900 mt-1">
                {currentMonth.punctualityRatePct}%{" "}
                <span className="text-[11px] font-bold text-emerald-600">
                  ({formatCurrencyNgn(currentMonth.totalPipelineInfluencedNgn)})
                </span>
              </p>
              <p className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                On-time attendance rate
              </p>
            </div>
          </div>

          {/* Classification Breakdown Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 space-y-2">
            <p className="text-[11px] font-bold text-slate-700">
              Monthly Visits by Classification
            </p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {(
                Object.keys(currentMonth.byClassification) as VisitClassification[]
              ).map((cls) => {
                const count = currentMonth.byClassification[cls];
                const pct = Math.round(
                  (count / Math.max(1, currentMonth.totalVisits)) * 100
                );
                return (
                  <div
                    key={cls}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: CLASSIFICATION_META[cls].color,
                    }}
                    title={`${CLASSIFICATION_META[cls].label}: ${count} (${pct}%)`}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
              {(
                Object.keys(currentMonth.byClassification) as VisitClassification[]
              ).map((cls) => (
                <div
                  key={cls}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1"
                >
                  <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CLASSIFICATION_META[cls].color }}
                    />
                    {CLASSIFICATION_META[cls].label}
                  </span>
                  <span className="font-bold text-slate-800">
                    {currentMonth.byClassification[cls]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent & Territory Monthly Leaderboard */}
          <div className="space-y-2">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              Agent & Territory Monthly Performance
            </p>
            {currentMonth.agentSummaries.map((agent) => {
              const quotaPct = Math.min(
                100,
                Math.round((agent.visits / Math.max(1, agent.quota)) * 100)
              );
              const descriptor = DEMO_AGENT_DESCRIPTORS.find(
                (d) => d.userId === agent.userId
              );
              return (
                <div
                  key={agent.userId}
                  className="rounded-2xl border border-slate-200/80 bg-white p-3 space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-4 w-4 rounded-md shrink-0"
                        style={{ backgroundColor: agent.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-800 truncate">
                          {agent.agentName}
                        </p>
                        <p className="text-[10.5px] text-slate-400 truncate">
                          {agent.territoryName} · Top: {agent.topClientVisited}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAgentId(agent.userId);
                        if (descriptor?.baseRoute.length) {
                          onFitCoordinates(descriptor.baseRoute);
                        }
                      }}
                      className="shrink-0 rounded-full bg-dash-teal/10 px-2.5 py-1 text-[10.5px] font-bold text-dash-teal hover:bg-dash-teal hover:text-white transition-colors"
                    >
                      Focus Territory
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-[10.5px]">
                    <div className="rounded-xl bg-slate-50 py-1.5 px-1">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                        Visits
                      </span>
                      <span className="font-bold text-slate-800">
                        {agent.visits}/{agent.quota} ({quotaPct}%)
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 py-1.5 px-1">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                        Distance
                      </span>
                      <span className="font-bold text-slate-800">
                        {agent.distanceKm} km
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 py-1.5 px-1">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                        Coverage
                      </span>
                      <span className="font-bold text-slate-800">
                        {agent.coveragePct}%
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 py-1.5 px-1">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">
                        Attendance
                      </span>
                      <span className="font-bold text-emerald-700">
                        {agent.onTimeDays}/{agent.totalWorkDays} on-time
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] text-slate-500 pt-0.5">
                    <span>
                      Unique Accounts:{" "}
                      <strong className="text-slate-700">
                        {agent.uniqueClients}
                      </strong>{" "}
                      · Efficiency:{" "}
                      <strong className="text-emerald-600">
                        {agent.travelEfficiencyPct}%
                      </strong>
                    </span>
                    <span className="font-bold text-slate-800">
                      {formatCurrencyNgn(agent.pipelineInfluencedNgn)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: WEEKLY ACTIVITY ARCHIVE VAULT */}
      {drawerTab === "archive" && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {/* Agreed Retention Policy Card */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3.5 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0A192F] text-[#2AE9C9]">
                <ShieldCheck size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-slate-800">
                  Weekly Activity Retention & Archiving Policy
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                  Recent <strong>4 weeks</strong> remain in the active operational
                  window. Older weekly records (&gt;4 weeks) are flagged for
                  archiving and stored in the read-only compliance vault.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Archive Audit Note / Reason
              </label>
              <input
                type="text"
                value={archiveReasonInput}
                onChange={(e) => setArchiveReasonInput(e.target.value)}
                placeholder="Reason for archiving..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] text-slate-700 outline-none focus:border-dash-teal"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] font-semibold text-slate-600">
                <strong>{eligibleWeeksCount}</strong> older week
                {eligibleWeeksCount === 1 ? "" : "s"} eligible for archive
              </span>
              <button
                type="button"
                disabled={eligibleWeeksCount === 0}
                onClick={() => {
                  const count = archiveAllEligibleWeeks(archiveReasonInput);
                  if (count > 0) {
                    toast.success(
                      `Archived ${count} older weekly activity record${count > 1 ? "s" : ""}`
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0A192F] px-3.5 py-1.5 text-[11px] font-bold text-white transition-all hover:opacity-95 disabled:opacity-40"
              >
                <Archive size={12} />
                Archive Eligible (&gt;4 Weeks)
              </button>
            </div>
          </div>

          {/* Sub-filter tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                { id: "all", label: `All Weeks (${weeklyRecords.length})` },
                {
                  id: "eligible",
                  label: `Eligible (${eligibleWeeksCount})`,
                },
                {
                  id: "archived",
                  label: `Archived (${archivedWeeksCount})`,
                },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setArchiveFilter(f.id)}
                className={`rounded-lg py-1.5 text-[11px] font-semibold transition-all ${
                  archiveFilter === f.id
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Weekly Records List */}
          <div className="space-y-2">
            {weeklyRecords
              .filter((w) => {
                if (archiveFilter === "archived") return w.status === "archived";
                if (archiveFilter === "eligible")
                  return w.status === "active" && w.eligibleForArchive;
                return true;
              })
              .map((week) => {
                const isArchived = week.status === "archived";
                return (
                  <div
                    key={week.weekId}
                    className={`rounded-2xl border p-3 space-y-2 transition-all ${
                      isArchived
                        ? "border-slate-200 bg-slate-50/90"
                        : week.eligibleForArchive
                          ? "border-amber-200 bg-amber-50/30"
                          : "border-slate-200/80 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-bold text-slate-800">
                            {week.label}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                              isArchived
                                ? "bg-slate-200 text-slate-700"
                                : week.eligibleForArchive
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {isArchived
                              ? "ARCHIVED"
                              : week.eligibleForArchive
                                ? "ELIGIBLE (>4W)"
                                : "ACTIVE"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          <Calendar size={11} className="inline mr-1" />
                          {week.dateRangeLabel} · {week.weeksAgo} weeks ago
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWeekId(week.weekId);
                            setDrawerTab("weekly");
                          }}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Inspect Map
                        </button>

                        {isArchived ? (
                          <button
                            type="button"
                            onClick={() => {
                              restoreArchivedWeek(week.weekId);
                              toast.success(
                                `Restored ${week.label} to active records`
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-[#0A192F] px-2.5 py-1 text-[10.5px] font-semibold text-white hover:opacity-90"
                          >
                            <ArchiveRestore size={11} />
                            Restore
                          </button>
                        ) : (
                          week.weeksAgo >= 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                archiveWeek(week.weekId, archiveReasonInput);
                                toast.success(`Archived ${week.label}`);
                              }}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-amber-700"
                            >
                              <Archive size={11} />
                              Archive
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-center text-[10.5px]">
                      <div className="rounded-xl bg-white/90 border border-slate-100 py-1 px-1">
                        <span className="block text-[9px] text-slate-400 uppercase">
                          Visits
                        </span>
                        <span className="font-bold text-slate-800">
                          {week.totalVisits}
                        </span>
                      </div>
                      <div className="rounded-xl bg-white/90 border border-slate-100 py-1 px-1">
                        <span className="block text-[9px] text-slate-400 uppercase">
                          Distance
                        </span>
                        <span className="font-bold text-slate-800">
                          {week.totalDistanceKm} km
                        </span>
                      </div>
                      <div className="rounded-xl bg-white/90 border border-slate-100 py-1 px-1">
                        <span className="block text-[9px] text-slate-400 uppercase">
                          Coverage
                        </span>
                        <span className="font-bold text-slate-800">
                          {week.coveragePct}%
                        </span>
                      </div>
                      <div className="rounded-xl bg-white/90 border border-slate-100 py-1 px-1">
                        <span className="block text-[9px] text-slate-400 uppercase">
                          Efficiency
                        </span>
                        <span className="font-bold text-emerald-600">
                          {week.travelEfficiencyPct}%
                        </span>
                      </div>
                    </div>

                    {isArchived && (
                      <div className="rounded-xl bg-slate-200/60 px-2.5 py-1.5 text-[10px] text-slate-600">
                        <strong>Archived by {week.archivedBy ?? "Admin"}</strong>{" "}
                        on{" "}
                        {week.archivedAt
                          ? new Date(week.archivedAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )
                          : "—"}{" "}
                        · {week.archiveReason ?? "Retention policy"}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
