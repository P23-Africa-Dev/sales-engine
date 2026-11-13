"use client";

import { create } from "zustand";
import {
  getInitialWeeklyActivityRecords,
  type DayOfWeekShort,
  type VisitClassification,
  type WeeklyActivityRecord,
} from "@/lib/map/map-analytics-data";

export type MapSurfaceViewMode = "operational" | "analytical";
export type AnalyticsDrawerTab = "visits" | "weekly" | "monthly" | "archive";
export type HeatmapWeightMetric = "visits" | "duration" | "pipeline";
export type HeatmapTimeWindow = "today" | "weekly" | "monthly";
export type TerritoryVisualMode = "boundaries" | "coverage" | "compare";
export type TerritoryColorScheme = "agent" | "health";

const ARCHIVE_STORAGE_KEY = "salesengine:map:weekly-archive-state:v1";

type PersistedArchiveMeta = Record<
  string,
  {
    status: "active" | "archived";
    archivedAt: string | null;
    archivedBy: string | null;
    archiveReason: string | null;
  }
>;

function loadPersistedWeeklyRecords(): WeeklyActivityRecord[] {
  const base = getInitialWeeklyActivityRecords();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return base;
    const overrides = JSON.parse(raw) as PersistedArchiveMeta;
    return base.map((record) => {
      const ov = overrides[record.weekId];
      if (!ov) return record;
      return {
        ...record,
        status: ov.status,
        archivedAt: ov.archivedAt,
        archivedBy: ov.archivedBy,
        archiveReason: ov.archiveReason,
      };
    });
  } catch {
    return base;
  }
}

function savePersistedWeeklyRecords(records: WeeklyActivityRecord[]) {
  if (typeof window === "undefined") return;
  try {
    const map: PersistedArchiveMeta = {};
    for (const r of records) {
      map[r.weekId] = {
        status: r.status,
        archivedAt: r.archivedAt,
        archivedBy: r.archivedBy,
        archiveReason: r.archiveReason,
      };
    }
    window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

interface MapAnalyticsStore {
  viewMode: MapSurfaceViewMode;
  drawerOpen: boolean;
  drawerTab: AnalyticsDrawerTab;
  selectedAgentId: number | null;
  selectedWeekId: string;
  selectedDayOfWeek: DayOfWeekShort | "all";
  selectedMonthId: string;
  playbackIndex: number;
  isPlayingRoute: boolean;

  heatmapEnabled: boolean;
  heatmapWeight: HeatmapWeightMetric;
  heatmapClassification: "all" | VisitClassification;
  heatmapTimeWindow: HeatmapTimeWindow;

  territoryVisualMode: TerritoryVisualMode;
  territoryColorScheme: TerritoryColorScheme;
  territoryLayerEnabled: boolean;
  territoryLegendOpen: boolean;

  weeklyRecords: WeeklyActivityRecord[];
  retentionWeeksThreshold: number;

  setViewMode: (mode: MapSurfaceViewMode) => void;
  setDrawerOpen: (open: boolean) => void;
  openDrawerToTab: (tab: AnalyticsDrawerTab, agentId?: number | null) => void;
  setDrawerTab: (tab: AnalyticsDrawerTab) => void;
  setSelectedAgentId: (userId: number | null) => void;
  setSelectedWeekId: (weekId: string) => void;
  setSelectedDayOfWeek: (day: DayOfWeekShort | "all") => void;
  setSelectedMonthId: (monthId: string) => void;
  setPlaybackIndex: (index: number) => void;
  setIsPlayingRoute: (playing: boolean) => void;

  setHeatmapEnabled: (enabled: boolean) => void;
  setHeatmapWeight: (weight: HeatmapWeightMetric) => void;
  setHeatmapClassification: (classification: "all" | VisitClassification) => void;
  setHeatmapTimeWindow: (window: HeatmapTimeWindow) => void;

  setTerritoryVisualMode: (mode: TerritoryVisualMode) => void;
  setTerritoryColorScheme: (scheme: TerritoryColorScheme) => void;
  setTerritoryLayerEnabled: (enabled: boolean) => void;
  setTerritoryLegendOpen: (open: boolean) => void;

  archiveWeek: (weekId: string, reason?: string, archivedBy?: string) => void;
  archiveAllEligibleWeeks: (reason?: string, archivedBy?: string) => number;
  restoreArchivedWeek: (weekId: string) => void;
  hydrateWeeklyRecordsFromStorage: () => void;
}

export const useMapAnalyticsStore = create<MapAnalyticsStore>((set, get) => ({
  viewMode: "operational",
  drawerOpen: false,
  drawerTab: "visits",
  selectedAgentId: null,
  selectedWeekId: "2026-W46",
  selectedDayOfWeek: "all",
  selectedMonthId: "2026-11",
  playbackIndex: 0,
  isPlayingRoute: false,

  heatmapEnabled: false,
  heatmapWeight: "visits",
  heatmapClassification: "all",
  heatmapTimeWindow: "weekly",

  territoryVisualMode: "boundaries",
  territoryColorScheme: "agent",
  territoryLayerEnabled: true,
  territoryLegendOpen: false,

  weeklyRecords: getInitialWeeklyActivityRecords(),
  retentionWeeksThreshold: 4,

  setViewMode: (mode) =>
    set((state) => ({
      viewMode: mode,
      territoryLayerEnabled: mode === "analytical" ? true : state.territoryLayerEnabled,
      drawerOpen: mode === "analytical" ? true : state.drawerOpen,
    })),

  setDrawerOpen: (open) => set({ drawerOpen: open }),

  openDrawerToTab: (tab, agentId) =>
    set((state) => ({
      drawerOpen: true,
      drawerTab: tab,
      selectedAgentId: agentId !== undefined ? agentId : state.selectedAgentId,
      playbackIndex: 0,
      isPlayingRoute: false,
    })),

  setDrawerTab: (tab) =>
    set({
      drawerTab: tab,
      playbackIndex: 0,
      isPlayingRoute: false,
    }),

  setSelectedAgentId: (userId) =>
    set({
      selectedAgentId: userId,
      playbackIndex: 0,
      isPlayingRoute: false,
    }),

  setSelectedWeekId: (weekId) =>
    set({
      selectedWeekId: weekId,
      selectedDayOfWeek: "all",
      playbackIndex: 0,
      isPlayingRoute: false,
    }),

  setSelectedDayOfWeek: (day) =>
    set({
      selectedDayOfWeek: day,
      playbackIndex: 0,
      isPlayingRoute: false,
    }),

  setSelectedMonthId: (monthId) => set({ selectedMonthId: monthId }),

  setPlaybackIndex: (index) => set({ playbackIndex: index }),

  setIsPlayingRoute: (playing) => set({ isPlayingRoute: playing }),

  setHeatmapEnabled: (enabled) => set({ heatmapEnabled: enabled }),

  setHeatmapWeight: (weight) => set({ heatmapWeight: weight }),

  setHeatmapClassification: (classification) =>
    set({ heatmapClassification: classification }),

  setHeatmapTimeWindow: (window) => set({ heatmapTimeWindow: window }),

  setTerritoryVisualMode: (mode) =>
    set({
      territoryVisualMode: mode,
      territoryLayerEnabled: true,
    }),

  setTerritoryColorScheme: (scheme) =>
    set({
      territoryColorScheme: scheme,
      territoryLayerEnabled: true,
    }),

  setTerritoryLayerEnabled: (enabled) => set({ territoryLayerEnabled: enabled }),

  setTerritoryLegendOpen: (open) => set({ territoryLegendOpen: open }),

  archiveWeek: (weekId, reason, archivedBy = "Elijah Obominuru") => {
    const nowIso = new Date().toISOString();
    const next = get().weeklyRecords.map((record) =>
      record.weekId === weekId
        ? {
            ...record,
            status: "archived" as const,
            archivedAt: nowIso,
            archivedBy,
            archiveReason: reason?.trim() || "Manual admin archive",
          }
        : record
    );
    savePersistedWeeklyRecords(next);
    set({ weeklyRecords: next });
  },

  archiveAllEligibleWeeks: (reason, archivedBy = "Elijah Obominuru") => {
    const nowIso = new Date().toISOString();
    let count = 0;
    const next = get().weeklyRecords.map((record) => {
      if (record.status === "active" && record.eligibleForArchive) {
        count += 1;
        return {
          ...record,
          status: "archived" as const,
          archivedAt: nowIso,
          archivedBy,
          archiveReason:
            reason?.trim() || "Agreed 4-week retention policy (> 4 weeks old)",
        };
      }
      return record;
    });
    savePersistedWeeklyRecords(next);
    set({ weeklyRecords: next });
    return count;
  },

  restoreArchivedWeek: (weekId) => {
    const next = get().weeklyRecords.map((record) =>
      record.weekId === weekId
        ? {
            ...record,
            status: "active" as const,
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
          }
        : record
    );
    savePersistedWeeklyRecords(next);
    set({ weeklyRecords: next });
  },

  hydrateWeeklyRecordsFromStorage: () => {
    set({ weeklyRecords: loadPersistedWeeklyRecords() });
  },
}));
