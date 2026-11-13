"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import {
  Eye,
  EyeOff,
  Hexagon,
  History,
  Layers,
  Maximize2,
  Palette,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";

import {
  useAgentTerritory,
  useCoveragePoints,
  useResetTerritory,
  useTerritories,
  useTerritoryPermissions,
  useUpsertTerritory,
} from "@/hooks/use-territories";
import type { AgentTerritory } from "@/lib/api/territories";
import {
  buildCoveragePolygon,
  buildTerritoryFeature,
  territoryLabelPoint,
  type TerritoryFeature,
} from "@/lib/map/territory-geometry";
import {
  COVERAGE_HEALTH_META,
  getTerritoryCoverageMetrics,
  type TerritoryCoverageMetrics,
} from "@/lib/map/map-analytics-data";
import { useMapAnalyticsStore } from "@/store/map-analytics";
import { getAgentInitials } from "@/lib/tracking/map-visualization";

const SOURCE_ID = "agent-territories";
const FILL_LAYER_ID = "territory-fill";
const BORDER_LAYER_ID = "territory-border";
const LABEL_LAYER_ID = "territory-label";

const COMPARE_OUTLINE_SOURCE_ID = "agent-territories-assigned-outline";
const COMPARE_OUTLINE_LAYER_ID = "territory-assigned-outline-line";

const BENEATH_LAYER_CANDIDATES = [
  "field-activity-heatmap",
  "live-routes",
  "agent-route",
  "forward-routes",
  "poi-circles",
];

type GooglePolygonInstance = {
  setMap: (map: unknown) => void;
  setOptions: (options: Record<string, unknown>) => void;
};

type GoogleNamespace = {
  maps: {
    Polygon: new (options: Record<string, unknown>) => GooglePolygonInstance;
  };
};

export type TerritoryLayerProps = {
  provider: "mapbox" | "google";
  ready: boolean;
  getMapboxMap?: () => mapboxgl.Map | null;
  getGoogleMap?: () => { map: unknown } | null;
  variant: "admin" | "agent";
  toggleClassName?: string;
};

type EditorState = {
  territory: AgentTerritory;
  draw: unknown | null;
};

export function TerritoryLayer({
  provider,
  ready,
  getMapboxMap,
  getGoogleMap,
  variant,
  toggleClassName,
}: TerritoryLayerProps) {
  const permissions = useTerritoryPermissions();
  const isAdminVariant = variant === "admin";

  const layerEnabled = useMapAnalyticsStore((s) => s.territoryLayerEnabled);
  const setLayerEnabled = useMapAnalyticsStore((s) => s.setTerritoryLayerEnabled);
  const legendOpen = useMapAnalyticsStore((s) => s.territoryLegendOpen);
  const setLegendOpen = useMapAnalyticsStore((s) => s.setTerritoryLegendOpen);
  const visualMode = useMapAnalyticsStore((s) => s.territoryVisualMode);
  const setVisualMode = useMapAnalyticsStore((s) => s.setTerritoryVisualMode);
  const colorScheme = useMapAnalyticsStore((s) => s.territoryColorScheme);
  const setColorScheme = useMapAnalyticsStore((s) => s.setTerritoryColorScheme);
  const openDrawerToTab = useMapAnalyticsStore((s) => s.openDrawerToTab);

  const [hiddenAgentIds, setHiddenAgentIds] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<AgentTerritory | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const territoriesQuery = useTerritories(isAdminVariant);
  const coverageQuery = useCoveragePoints(isAdminVariant);
  const agentQuery = useAgentTerritory(!isAdminVariant);

  const upsertMutation = useUpsertTerritory();
  const resetMutation = useResetTerritory();

  const googlePolygonsRef = useRef<GooglePolygonInstance[]>([]);
  const drawRef = useRef<{ instance: unknown; cleanup: () => void } | null>(null);

  const coverageMetricsMap = useMemo(() => {
    const map = new Map<number, TerritoryCoverageMetrics>();
    getTerritoryCoverageMetrics().forEach((m) => map.set(m.userId, m));
    return map;
  }, []);

  const territories: AgentTerritory[] = useMemo(() => {
    if (isAdminVariant) return territoriesQuery.data ?? [];
    return agentQuery.data?.territory ? [agentQuery.data.territory] : [];
  }, [isAdminVariant, territoriesQuery.data, agentQuery.data]);

  const coverageByUser = useMemo(() => {
    const map = new Map<
      number,
      {
        task_points: { latitude: number; longitude: number; weight: number }[];
        trail_points: { latitude: number; longitude: number; weight: number }[];
      }
    >();
    if (isAdminVariant) {
      (coverageQuery.data ?? []).forEach((item) => map.set(item.user_id, item));
    } else if (agentQuery.data?.coverage) {
      map.set(agentQuery.data.coverage.user_id, agentQuery.data.coverage);
    }
    return map;
  }, [isAdminVariant, coverageQuery.data, agentQuery.data]);

  const resolveTerritoryDisplayColor = useCallback(
    (territory: AgentTerritory): string => {
      if (colorScheme === "health") {
        const metrics = coverageMetricsMap.get(territory.user_id);
        if (metrics) return metrics.healthColor;
      }
      return territory.color;
    },
    [colorScheme, coverageMetricsMap]
  );

  const features: TerritoryFeature[] = useMemo(() => {
    if (!layerEnabled) return [];
    return territories
      .filter(
        (territory) => !hiddenAgentIds.has(territory.user_id) && territory.is_visible
      )
      .map((territory) => {
        const coverage = coverageByUser.get(territory.user_id) ?? null;
        const metrics = coverageMetricsMap.get(territory.user_id);
        const displayColor = resolveTerritoryDisplayColor(territory);
        const effectiveMode: "auto" | "manual" =
          visualMode === "coverage" || visualMode === "compare"
            ? "auto"
            : territory.mode;

        const baseName = territory.name ?? territory.agent?.name ?? "Agent";
        const labelText = metrics
          ? `${baseName}\n${territory.agent?.name ?? ""} · ${metrics.coveragePct}% covered`
          : baseName;

        const built = buildTerritoryFeature({
          userId: territory.user_id,
          name: labelText,
          color: displayColor,
          mode: effectiveMode,
          manualPolygon: territory.geojson,
          coverage,
        });

        // Fallback if coverage hull is empty: use manual polygon
        if (!built && territory.geojson) {
          return buildTerritoryFeature({
            userId: territory.user_id,
            name: labelText,
            color: displayColor,
            mode: "manual",
            manualPolygon: territory.geojson,
            coverage: null,
          });
        }
        return built;
      })
      .filter((feature): feature is TerritoryFeature => feature !== null);
  }, [
    layerEnabled,
    territories,
    hiddenAgentIds,
    coverageByUser,
    coverageMetricsMap,
    resolveTerritoryDisplayColor,
    visualMode,
  ]);

  // Assigned boundary outlines when in "compare" mode (shows assigned boundary vs covered footprint)
  const assignedOutlineFeatures: TerritoryFeature[] = useMemo(() => {
    if (!layerEnabled || visualMode !== "compare") return [];
    return territories
      .filter(
        (territory) =>
          !hiddenAgentIds.has(territory.user_id) &&
          territory.is_visible &&
          territory.geojson != null
      )
      .map((territory) =>
        buildTerritoryFeature({
          userId: territory.user_id,
          name: territory.name ?? "Assigned Zone",
          color: territory.color,
          mode: "manual",
          manualPolygon: territory.geojson,
          coverage: null,
        })
      )
      .filter((f): f is TerritoryFeature => f !== null);
  }, [layerEnabled, visualMode, territories, hiddenAgentIds]);

  const featureCollection = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features,
      }) as GeoJSON.FeatureCollection,
    [features]
  );

  const compareOutlineCollection = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features: assignedOutlineFeatures,
      }) as GeoJSON.FeatureCollection,
    [assignedOutlineFeatures]
  );

  const persistMasterToggle = useCallback(
    (value: boolean) => {
      setLayerEnabled(value);
      if (!value) {
        setLegendOpen(false);
        setSelected(null);
      }
    },
    [setLayerEnabled, setLegendOpen]
  );

  // ── Mapbox rendering ────────────────────────────────────────────────────────

  const syncMapboxLayers = useCallback(() => {
    if (provider !== "mapbox") return;
    const map = getMapboxMap?.();
    if (!map || !map.isStyleLoaded()) return;

    const beforeId = BENEATH_LAYER_CANDIDATES.find((id) => map.getLayer(id) != null);

    // 1. Primary territory / coverage fill + border + label
    const existingSource = map.getSource(SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;

    if (!existingSource) {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: featureCollection,
        promoteId: "userId",
      });

      map.addLayer(
        {
          id: FILL_LAYER_ID,
          type: "fill",
          source: SOURCE_ID,
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.52,
              visualMode === "coverage" ? 0.38 : 0.3,
            ],
          },
        },
        beforeId
      );

      map.addLayer(
        {
          id: BORDER_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2.5,
            "line-opacity": 0.95,
          },
        },
        beforeId
      );

      map.addLayer({
        id: LABEL_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "rgba(15, 23, 42, 0.78)",
          "text-halo-width": 1.6,
        },
      });
    } else {
      existingSource.setData(featureCollection);
    }

    // 2. Compare mode dashed outer boundary layer
    const existingCompareSource = map.getSource(COMPARE_OUTLINE_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;

    if (!existingCompareSource) {
      map.addSource(COMPARE_OUTLINE_SOURCE_ID, {
        type: "geojson",
        data: compareOutlineCollection,
      });
      map.addLayer(
        {
          id: COMPARE_OUTLINE_LAYER_ID,
          type: "line",
          source: COMPARE_OUTLINE_SOURCE_ID,
          paint: {
            "line-color": ["get", "color"],
            "line-width": 2.2,
            "line-dasharray": [3, 2],
            "line-opacity": 0.85,
          },
        },
        beforeId
      );
    } else {
      existingCompareSource.setData(compareOutlineCollection);
    }
  }, [
    provider,
    getMapboxMap,
    featureCollection,
    compareOutlineCollection,
    visualMode,
  ]);

  useEffect(() => {
    if (provider !== "mapbox" || !ready) return;
    const map = getMapboxMap?.();
    if (!map) return;

    syncMapboxLayers();

    const handleStyleData = () => syncMapboxLayers();
    map.on("styledata", handleStyleData);

    return () => {
      map.off("styledata", handleStyleData);
    };
  }, [provider, ready, getMapboxMap, syncMapboxLayers]);

  // Hover + click interactions (Mapbox only).
  useEffect(() => {
    if (provider !== "mapbox" || !ready) return;
    const map = getMapboxMap?.();
    if (!map) return;

    let hoveredId: number | string | null = null;

    const clearHover = () => {
      if (hoveredId != null && map.getSource(SOURCE_ID)) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
      }
      hoveredId = null;
    };

    const handleMove = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      if (hoveredId !== feature.id) {
        clearHover();
        hoveredId = feature.id ?? null;
        if (hoveredId != null) {
          map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: true });
        }
      }
      map.getCanvas().style.cursor = "pointer";
    };

    const handleLeave = () => {
      clearHover();
      map.getCanvas().style.cursor = "";
    };

    const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const userId = Number(feature.properties?.userId);
      const territory = territories.find((t) => t.user_id === userId) ?? null;
      setSelected(territory);
    };

    map.on("mousemove", FILL_LAYER_ID, handleMove);
    map.on("mouseleave", FILL_LAYER_ID, handleLeave);
    map.on("click", FILL_LAYER_ID, handleClick);

    return () => {
      map.off("mousemove", FILL_LAYER_ID, handleMove);
      map.off("mouseleave", FILL_LAYER_ID, handleLeave);
      map.off("click", FILL_LAYER_ID, handleClick);
      clearHover();
    };
  }, [provider, ready, getMapboxMap, territories]);

  // ── Google rendering ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (provider !== "google" || !ready) return;

    const bridge = getGoogleMap?.();
    const googleNs = (window as unknown as { google?: GoogleNamespace }).google;
    if (!bridge?.map || !googleNs?.maps?.Polygon) return;

    googlePolygonsRef.current.forEach((polygon) => polygon.setMap(null));
    googlePolygonsRef.current = [];

    features.forEach((feature) => {
      const geometry = feature.geometry;
      const rings =
        geometry.type === "Polygon"
          ? [geometry.coordinates]
          : geometry.coordinates;

      rings.forEach((polygonRings) => {
        const paths = polygonRings.map((ring) =>
          ring.map(([lng, lat]) => ({ lat, lng }))
        );

        const polygon = new googleNs.maps.Polygon({
          paths,
          map: bridge.map,
          fillColor: feature.properties.color,
          fillOpacity: 0.34,
          strokeColor: feature.properties.color,
          strokeOpacity: 0.92,
          strokeWeight: 2.5,
          clickable: false,
        });

        googlePolygonsRef.current.push(polygon);
      });
    });

    return () => {
      googlePolygonsRef.current.forEach((polygon) => polygon.setMap(null));
      googlePolygonsRef.current = [];
    };
  }, [provider, ready, getGoogleMap, features]);

  // ── Manual editing (Mapbox + owner/admin only) ───────────────────────────────

  const stopEditing = useCallback(() => {
    drawRef.current?.cleanup();
    drawRef.current = null;
    setEditor(null);
  }, []);

  const startEditing = useCallback(
    async (territory: AgentTerritory) => {
      if (provider !== "mapbox" || !permissions.canEdit) return;
      const map = getMapboxMap?.();
      if (!map) return;

      const [{ default: MapboxDraw }] = await Promise.all([
        import("@mapbox/mapbox-gl-draw"),
        import("@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"),
      ]);

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        defaultMode: "draw_polygon",
      });

      map.addControl(draw, "top-left");

      const existingFeature = features.find(
        (f) => f.properties.userId === territory.user_id
      );
      if (existingFeature && existingFeature.geometry.type === "Polygon") {
        draw.set({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: existingFeature.geometry,
              properties: {},
            },
          ],
        });
        draw.changeMode("simple_select");
      }

      drawRef.current = {
        instance: draw,
        cleanup: () => {
          try {
            map.removeControl(draw);
          } catch {
            // map may already be destroyed
          }
        },
      };

      setSelected(null);
      setEditor({ territory, draw });
    },
    [provider, permissions.canEdit, getMapboxMap, features]
  );

  const saveEditing = useCallback(() => {
    if (!editor || !drawRef.current) return;
    const draw = drawRef.current.instance as {
      getAll: () => GeoJSON.FeatureCollection;
    };

    const drawn = draw
      .getAll()
      .features.find((feature) => feature.geometry.type === "Polygon");

    if (!drawn) {
      stopEditing();
      return;
    }

    upsertMutation.mutate(
      {
        userId: editor.territory.user_id,
        payload: { geojson: drawn.geometry as GeoJSON.Polygon },
      },
      { onSettled: stopEditing }
    );
  }, [editor, upsertMutation, stopEditing]);

  useEffect(() => stopEditing, [stopEditing]);

  // ── Camera focus helpers ─────────────────────────────────────────────────────

  const focusTerritory = useCallback(
    (territory: AgentTerritory) => {
      const feature = features.find(
        (f) => f.properties.userId === territory.user_id
      );
      if (!feature) return;
      const anchor = territoryLabelPoint(feature);
      if (!anchor) return;

      setSelected(territory);
      if (provider === "mapbox") {
        getMapboxMap?.()?.flyTo({ center: anchor, zoom: 13.2, speed: 1.25 });
      } else {
        const bridge = getGoogleMap?.() as {
          map?: {
            panTo: (p: { lat: number; lng: number }) => void;
            setZoom: (z: number) => void;
          };
        } | null;
        bridge?.map?.panTo({ lat: anchor[1], lng: anchor[0] });
        bridge?.map?.setZoom(13);
      }
    },
    [features, provider, getMapboxMap, getGoogleMap]
  );

  const fitAllTerritories = useCallback(() => {
    if (features.length === 0) return;
    if (provider === "mapbox") {
      const map = getMapboxMap?.();
      if (!map) return;
      const bounds = new mapboxgl.LngLatBounds();
      features.forEach((f) => {
        const coords =
          f.geometry.type === "Polygon"
            ? f.geometry.coordinates[0]
            : f.geometry.coordinates[0]?.[0] ?? [];
        coords.forEach(([lng, lat]) => bounds.extend([lng, lat]));
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 1100 });
      }
    }
  }, [features, provider, getMapboxMap]);

  // Compute live coverage polygon check for selected territory
  const selectedMetrics = selected
    ? coverageMetricsMap.get(selected.user_id) ?? null
    : null;
  const selectedHasCoverageHull = useMemo(() => {
    if (!selected) return false;
    const cov = coverageByUser.get(selected.user_id);
    return cov ? buildCoveragePolygon(cov) !== null : false;
  }, [selected, coverageByUser]);

  if (!permissions.canView) return null;

  return (
    <>
      {/* Master Territory & Coverage Toggle + Legend Panel */}
      <div
        className={
          toggleClassName ??
          "absolute bottom-6 left-4 z-30 flex flex-col-reverse items-start gap-2"
        }
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!layerEnabled) {
                persistMasterToggle(true);
                if (isAdminVariant) setLegendOpen(true);
              } else if (isAdminVariant && !legendOpen) {
                setLegendOpen(true);
              } else {
                setLegendOpen(false);
              }
            }}
            title={
              layerEnabled
                ? "Manage territories & colour-coded coverage areas"
                : "Show agent territories & coverage areas"
            }
            className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12px] font-semibold shadow-lg backdrop-blur transition-all active:scale-95 ${
              layerEnabled
                ? "border-slate-800 bg-[#0A192F] text-white"
                : "border-slate-200 bg-white/95 text-slate-700 hover:text-slate-900"
            }`}
          >
            <Hexagon
              size={15}
              className={layerEnabled ? "text-[#2AE9C9]" : "text-slate-400"}
            />
            <span>
              {isAdminVariant
                ? visualMode === "coverage"
                  ? `Coverage Areas (${features.length})`
                  : visualMode === "compare"
                    ? `Zone vs Coverage (${features.length})`
                    : `Territories (${features.length})`
                : "My Coverage"}
            </span>
          </button>

          {layerEnabled && (
            <button
              onClick={() => persistMasterToggle(false)}
              title="Hide territory overlays"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-md backdrop-blur hover:bg-slate-50 hover:text-slate-800"
            >
              <EyeOff size={14} />
            </button>
          )}
        </div>

        {/* Expanded Territory & Coverage Manager Panel (admin) */}
        {isAdminVariant && layerEnabled && legendOpen && (
          <div className="w-[min(92vw,340px)] rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[13px] font-bold text-slate-800">
                  Territories & Coverage Areas
                </p>
                <p className="text-[11px] text-slate-400">
                  {features.length} of {territories.length} active Lagos zones
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={fitAllTerritories}
                  title="Fit all territories on map"
                  className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  onClick={() =>
                    setHiddenAgentIds(
                      hiddenAgentIds.size > 0
                        ? new Set()
                        : new Set(territories.map((t) => t.user_id))
                    )
                  }
                  title={
                    hiddenAgentIds.size > 0
                      ? "Show all territories"
                      : "Mute all territories"
                  }
                  className="rounded-full px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  {hiddenAgentIds.size > 0 ? "Show all" : "Hide all"}
                </button>
                <button
                  onClick={() => setLegendOpen(false)}
                  title="Close panel"
                  className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 3-Way Visualization Mode Switcher */}
            <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Layers size={11} />
                  Polygon Mode
                </span>
                <span className="text-[10px] font-medium text-slate-400">
                  {visualMode === "boundaries"
                    ? "Assigned Zones"
                    : visualMode === "coverage"
                      ? "Computed Hulls"
                      : "Boundary + Hull"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
                {(
                  [
                    { id: "boundaries", label: "Territories" },
                    { id: "coverage", label: "Coverage" },
                    { id: "compare", label: "Compare" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setVisualMode(opt.id)}
                    className={`rounded-lg py-1.5 text-[11px] font-semibold transition-all ${
                      visualMode === opt.id
                        ? "bg-[#0A192F] text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* 2-Way Colour-Coding Scheme */}
              <div className="flex items-center justify-between pt-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Palette size={11} />
                  Colour Coding
                </span>
                <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5">
                  <button
                    type="button"
                    onClick={() => setColorScheme("agent")}
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-all ${
                      colorScheme === "agent"
                        ? "bg-white text-slate-800 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Agent Palette
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorScheme("health")}
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-all ${
                      colorScheme === "health"
                        ? "bg-white text-slate-800 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Coverage RAG
                  </button>
                </div>
              </div>

              {colorScheme === "health" && (
                <div className="flex items-center justify-between gap-1 rounded-xl bg-white px-2.5 py-1.5 text-[10px] border border-slate-100">
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    ≥75% High
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    50–74% Mod
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    &lt;50% Low
                  </span>
                </div>
              )}
            </div>

            {/* Territory List */}
            <div className="max-h-[38vh] overflow-y-auto px-2 py-2 space-y-1">
              {territories.map((territory) => {
                const hidden =
                  hiddenAgentIds.has(territory.user_id) || !territory.is_visible;
                const hasShape = features.some(
                  (f) => f.properties.userId === territory.user_id
                );
                const displayName =
                  territory.name ?? territory.agent?.name ?? "Agent";
                const metrics = coverageMetricsMap.get(territory.user_id);
                const swatchColor = resolveTerritoryDisplayColor(territory);

                return (
                  <div
                    key={territory.user_id}
                    className={`group flex items-center gap-2.5 rounded-2xl px-3 py-2 transition-colors ${
                      selected?.user_id === territory.user_id
                        ? "bg-slate-100"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <button
                      onClick={() => focusTerritory(territory)}
                      disabled={!hasShape || hidden}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-50"
                      title="Focus territory on map"
                    >
                      <span
                        className="h-4 w-4 flex-none rounded-[6px] border border-black/10 shadow-xs"
                        style={{ backgroundColor: swatchColor }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-bold text-slate-800">
                            {displayName}
                          </span>
                        </span>
                        <span className="block text-[10.5px] text-slate-500 truncate">
                          {territory.agent?.name ?? "Assigned Agent"}
                          {metrics
                            ? ` · ${metrics.coveragePct}% covered (${metrics.coveredAreaKm2} km²)`
                            : ""}
                        </span>
                      </span>
                    </button>

                    {metrics && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          COVERAGE_HEALTH_META[metrics.healthTier].badgeClass
                        }`}
                      >
                        {metrics.coveragePct}%
                      </span>
                    )}

                    {permissions.canEdit && provider === "mapbox" && (
                      <button
                        onClick={() => startEditing(territory)}
                        title="Edit territory polygon"
                        className="rounded-full p-1.5 text-slate-400 opacity-0 transition-all hover:bg-slate-200/70 hover:text-slate-700 group-hover:opacity-100"
                      >
                        <Pencil size={13} />
                      </button>
                    )}

                    <button
                      onClick={() =>
                        setHiddenAgentIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(territory.user_id))
                            next.delete(territory.user_id);
                          else next.add(territory.user_id);
                          return next;
                        })
                      }
                      title={hidden ? "Show territory" : "Hide territory"}
                      className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
                    >
                      {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected Territory & Coverage Inspection Card */}
      {selected && !editor && (
        <div className="absolute bottom-20 left-4 md:left-[370px] z-30 w-[min(92vw,350px)] rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
            <div
              className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-[13px] font-extrabold text-white shadow-sm"
              style={{ backgroundColor: resolveTerritoryDisplayColor(selected) }}
            >
              {getAgentInitials(selected.agent?.name ?? selected.name ?? "A") ??
                "A"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[13.5px] font-bold text-slate-800">
                  {selected.name ?? selected.agent?.name ?? "Territory"}
                </p>
              </div>
              <p className="truncate text-[11px] text-slate-500">
                Agent: <span className="font-semibold text-slate-700">{selected.agent?.name ?? "Assigned"}</span>
                {selected.agent?.assigned_zone
                  ? ` · ${selected.agent.assigned_zone}`
                  : ""}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          </div>

          {selectedMetrics && (
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500">
                  Coverage Health Status
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${
                    COVERAGE_HEALTH_META[selectedMetrics.healthTier].badgeClass
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: selectedMetrics.healthColor }}
                  />
                  {selectedMetrics.healthLabel}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-2xl bg-slate-50 px-3 py-2 border border-slate-100">
                  <p className="text-slate-400 text-[10px] font-semibold uppercase">
                    Assigned Area
                  </p>
                  <p className="font-bold text-slate-800 text-[13px] mt-0.5">
                    {selectedMetrics.assignedAreaKm2} km²
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 border border-slate-100">
                  <p className="text-slate-400 text-[10px] font-semibold uppercase">
                    Covered Footprint
                  </p>
                  <p className="font-bold text-slate-800 text-[13px] mt-0.5">
                    {selectedMetrics.coveredAreaKm2} km² ({selectedMetrics.coveragePct}%)
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 border border-slate-100">
                  <p className="text-slate-400 text-[10px] font-semibold uppercase">
                    Weekly Visits
                  </p>
                  <p className="font-bold text-slate-800 text-[13px] mt-0.5">
                    {selectedMetrics.visitsThisWeek} / {selectedMetrics.targetVisits} visits
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2 border border-slate-100">
                  <p className="text-slate-400 text-[10px] font-semibold uppercase">
                    Zone Accounts
                  </p>
                  <p className="font-bold text-slate-800 text-[13px] mt-0.5">
                    {selectedMetrics.visitedBusinessesInZone} /{" "}
                    {selectedMetrics.totalBusinessesInZone} visited
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50/90 border border-slate-100 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">Spatial Insight: </span>
                {selectedMetrics.uncoveredGapHint}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 bg-slate-50/50">
            <button
              type="button"
              onClick={() => {
                openDrawerToTab("visits", selected.user_id);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-dash-teal px-3 py-2 text-[11.5px] font-semibold text-white transition-all hover:opacity-95 active:scale-95"
            >
              <History size={13} />
              Visit History
            </button>

            {permissions.canEdit && provider === "mapbox" && isAdminVariant && (
              <>
                <button
                  type="button"
                  onClick={() => startEditing(selected)}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-[#0A192F] px-3 py-2 text-[11.5px] font-semibold text-white transition-all active:scale-95"
                >
                  <Pencil size={12} />
                  Edit Zone
                </button>
                {selected.mode === "manual" && selectedHasCoverageHull && (
                  <button
                    type="button"
                    onClick={() => {
                      resetMutation.mutate(selected.user_id);
                      setSelected(null);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
                  >
                    <RotateCcw size={12} />
                    Auto Hull
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Draw editor toolbar */}
      {editor && (
        <div className="absolute bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200/70 bg-white/95 px-4 py-2.5 shadow-[0_18px_48px_rgba(15,23,42,0.2)] backdrop-blur-xl">
          <span
            className="h-3 w-3 flex-none rounded-full"
            style={{ backgroundColor: editor.territory.color }}
          />
          <span className="max-w-[38vw] truncate text-[12px] font-semibold text-slate-700">
            Drawing zone for{" "}
            {editor.territory.name ?? editor.territory.agent?.name ?? "agent"}
          </span>
          <button
            onClick={saveEditing}
            disabled={upsertMutation.isPending}
            className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-[12px] font-bold text-white transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-60"
          >
            {upsertMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={stopEditing}
            className="rounded-full border border-slate-200 px-3.5 py-1.5 text-[12px] font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
