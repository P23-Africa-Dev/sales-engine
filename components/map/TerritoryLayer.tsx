"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Eye, EyeOff, Hexagon, Pencil, RotateCcw, X } from "lucide-react";

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
  buildTerritoryFeature,
  territoryLabelPoint,
  type TerritoryFeature,
} from "@/lib/map/territory-geometry";
import { getAgentInitials } from "@/lib/tracking/map-visualization";

const SOURCE_ID = "agent-territories";
const FILL_LAYER_ID = "territory-fill";
const BORDER_LAYER_ID = "territory-border";
const LABEL_LAYER_ID = "territory-label";
const MASTER_TOGGLE_STORAGE_KEY = "territory-layer-visible";

/** Layers we want territories to render beneath, when present. */
const BENEATH_LAYER_CANDIDATES = ["live-routes", "agent-route", "forward-routes", "poi-circles"];

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
  /** Admin surface shows every agent + legend; agent surface shows own zone only. */
  variant: "admin" | "agent";
  /** Extra classes for the toggle pill (e.g. reposition above bottom sheets). */
  toggleClassName?: string;
};

type EditorState = {
  territory: AgentTerritory;
  draw: unknown | null;
};

function readMasterToggle(variant: "admin" | "agent"): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(`${MASTER_TOGGLE_STORAGE_KEY}:${variant}`);
  return raw == null ? true : raw === "1";
}

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

  const [layerEnabled, setLayerEnabled] = useState<boolean>(() => readMasterToggle(variant));
  const [legendOpen, setLegendOpen] = useState(false);
  const [hiddenAgentIds, setHiddenAgentIds] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<AgentTerritory | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const territoriesQuery = useTerritories(isAdminVariant && layerEnabled);
  const coverageQuery = useCoveragePoints(isAdminVariant && layerEnabled);
  const agentQuery = useAgentTerritory(!isAdminVariant && layerEnabled);

  const upsertMutation = useUpsertTerritory();
  const resetMutation = useResetTerritory();

  const googlePolygonsRef = useRef<GooglePolygonInstance[]>([]);
  const drawRef = useRef<{ instance: unknown; cleanup: () => void } | null>(null);

  const territories: AgentTerritory[] = useMemo(() => {
    if (isAdminVariant) return territoriesQuery.data ?? [];
    return agentQuery.data?.territory ? [agentQuery.data.territory] : [];
  }, [isAdminVariant, territoriesQuery.data, agentQuery.data]);

  const coverageByUser = useMemo(() => {
    const map = new Map<number, { task_points: { latitude: number; longitude: number; weight: number }[]; trail_points: { latitude: number; longitude: number; weight: number }[] }>();
    if (isAdminVariant) {
      (coverageQuery.data ?? []).forEach((item) => map.set(item.user_id, item));
    } else if (agentQuery.data?.coverage) {
      map.set(agentQuery.data.coverage.user_id, agentQuery.data.coverage);
    }
    return map;
  }, [isAdminVariant, coverageQuery.data, agentQuery.data]);

  const features: TerritoryFeature[] = useMemo(() => {
    if (!layerEnabled) return [];
    return territories
      .filter((territory) => !hiddenAgentIds.has(territory.user_id) && territory.is_visible)
      .map((territory) =>
        buildTerritoryFeature({
          userId: territory.user_id,
          name: territory.name ?? territory.agent?.name ?? "Agent",
          color: territory.color,
          mode: territory.mode,
          manualPolygon: territory.geojson,
          coverage: coverageByUser.get(territory.user_id) ?? null,
        })
      )
      .filter((feature): feature is TerritoryFeature => feature !== null);
  }, [layerEnabled, territories, hiddenAgentIds, coverageByUser]);

  const featureCollection = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features,
      }) as GeoJSON.FeatureCollection,
    [features]
  );

  const persistMasterToggle = useCallback(
    (value: boolean) => {
      setLayerEnabled(value);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`${MASTER_TOGGLE_STORAGE_KEY}:${variant}`, value ? "1" : "0");
      }
      if (!value) {
        setLegendOpen(false);
        setSelected(null);
      }
    },
    [variant]
  );

  // ── Mapbox rendering ────────────────────────────────────────────────────────

  const syncMapboxLayers = useCallback(() => {
    if (provider !== "mapbox") return;
    const map = getMapboxMap?.();
    if (!map || !map.isStyleLoaded()) return;

    const existingSource = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;

    if (!existingSource) {
      map.addSource(SOURCE_ID, { type: "geojson", data: featureCollection, promoteId: "userId" });

      const beforeId = BENEATH_LAYER_CANDIDATES.find((id) => map.getLayer(id) != null);

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
              0.5,
              0.32,
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
            "line-width": 2,
            "line-opacity": 0.9,
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
          "text-size": 13,
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "rgba(15, 23, 42, 0.65)",
          "text-halo-width": 1.4,
        },
      });
    } else {
      existingSource.setData(featureCollection);
    }
  }, [provider, getMapboxMap, featureCollection]);

  useEffect(() => {
    if (provider !== "mapbox" || !ready) return;
    const map = getMapboxMap?.();
    if (!map) return;

    syncMapboxLayers();

    // Styles wipe custom layers — re-add after style changes.
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
          fillOpacity: 0.32,
          strokeColor: feature.properties.color,
          strokeOpacity: 0.9,
          strokeWeight: 2,
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

      // Seed with the current shape (manual polygon, or the auto hull as a starting shape).
      const existingFeature = features.find((f) => f.properties.userId === territory.user_id);
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

  // ── UI ───────────────────────────────────────────────────────────────────────

  const focusTerritory = useCallback(
    (territory: AgentTerritory) => {
      const feature = features.find((f) => f.properties.userId === territory.user_id);
      if (!feature) return;
      const anchor = territoryLabelPoint(feature);
      if (!anchor) return;

      if (provider === "mapbox") {
        getMapboxMap?.()?.flyTo({ center: anchor, zoom: 12.5, speed: 1.2 });
      } else {
        const bridge = getGoogleMap?.() as { map?: { panTo: (p: { lat: number; lng: number }) => void; setZoom: (z: number) => void } } | null;
        bridge?.map?.panTo({ lat: anchor[1], lng: anchor[0] });
        bridge?.map?.setZoom(12);
      }
    },
    [features, provider, getMapboxMap, getGoogleMap]
  );

  const isLoading =
    (isAdminVariant && (territoriesQuery.isLoading || coverageQuery.isLoading)) ||
    (!isAdminVariant && agentQuery.isLoading);

  if (!permissions.canView) return null;

  return (
    <>
      {/* Toggle pill */}
      <div
        className={
          toggleClassName ??
          "absolute top-20 left-4 z-30 flex flex-col items-start gap-2"
        }
      >
        <button
          onClick={() => {
            if (!layerEnabled) {
              persistMasterToggle(true);
              if (isAdminVariant) setLegendOpen(true);
            } else if (isAdminVariant && !legendOpen) {
              setLegendOpen(true);
            } else {
              persistMasterToggle(false);
            }
          }}
          title={layerEnabled ? "Territories shown — click to manage" : "Show agent territories"}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold shadow-lg backdrop-blur transition-all active:scale-95 ${
            layerEnabled
              ? "border-slate-200 bg-[#0A192F] text-white"
              : "border-slate-200 bg-white/95 text-slate-600 hover:text-slate-900"
          }`}
        >
          <Hexagon size={14} className={layerEnabled ? "text-emerald-300" : "text-slate-400"} />
          {isAdminVariant ? "Territories" : "My coverage"}
        </button>

        {/* Legend panel (admin only) */}
        {isAdminVariant && layerEnabled && legendOpen && (
          <div className="w-[min(88vw,300px)] rounded-3xl border border-slate-200/70 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[13px] font-bold text-slate-800">Agent territories</p>
                <p className="text-[11px] text-slate-400">
                  {features.length} of {territories.length} zones on map
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => persistMasterToggle(false)}
                  title="Hide all territories"
                  className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <EyeOff size={14} />
                </button>
                <button
                  onClick={() => setLegendOpen(false)}
                  title="Close"
                  className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="max-h-[42vh] overflow-y-auto px-2 py-2">
              {isLoading && (
                <p className="px-3 py-4 text-center text-[12px] text-slate-400">
                  Loading coverage…
                </p>
              )}

              {!isLoading && territories.length === 0 && (
                <p className="px-3 py-4 text-center text-[12px] text-slate-400">
                  No agents with coverage yet.
                </p>
              )}

              {territories.map((territory) => {
                const hidden = hiddenAgentIds.has(territory.user_id) || !territory.is_visible;
                const hasShape = features.some((f) => f.properties.userId === territory.user_id);
                const displayName = territory.name ?? territory.agent?.name ?? "Agent";

                return (
                  <div
                    key={territory.user_id}
                    className="group flex items-center gap-2.5 rounded-2xl px-3 py-2 transition-colors hover:bg-slate-50"
                  >
                    <button
                      onClick={() => focusTerritory(territory)}
                      disabled={!hasShape || hidden}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
                      title={hasShape ? "Focus on map" : "No coverage data yet"}
                    >
                      <span
                        className="h-3.5 w-3.5 flex-none rounded-[5px] border border-black/10"
                        style={{ backgroundColor: territory.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-slate-700">
                          {displayName}
                        </span>
                        <span className="block text-[10.5px] text-slate-400">
                          {territory.mode === "manual" ? "Manual zone" : hasShape ? "Auto coverage" : "No coverage data yet"}
                        </span>
                      </span>
                    </button>

                    {permissions.canEdit && provider === "mapbox" && (
                      <button
                        onClick={() => startEditing(territory)}
                        title="Edit territory"
                        className="rounded-full p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-200/70 hover:text-slate-700 group-hover:opacity-100"
                      >
                        <Pencil size={13} />
                      </button>
                    )}

                    <button
                      onClick={() =>
                        setHiddenAgentIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(territory.user_id)) next.delete(territory.user_id);
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

      {/* Selected territory info card */}
      {selected && !editor && (
        <div className="absolute bottom-24 left-4 z-30 w-[min(90vw,320px)] rounded-3xl border border-slate-200/70 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[13px] font-extrabold text-white"
              style={{ backgroundColor: selected.color }}
            >
              {getAgentInitials(selected.agent?.name ?? selected.name ?? "A") ?? "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-slate-800">
                {selected.name ?? selected.agent?.name ?? "Agent"}
              </p>
              <p className="truncate text-[11px] text-slate-400">
                {selected.mode === "manual" ? "Manually assigned zone" : "Auto coverage from tasks & routes"}
                {selected.agent?.assigned_zone ? ` · ${selected.agent.assigned_zone}` : ""}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          </div>

          {permissions.canEdit && provider === "mapbox" && isAdminVariant && (
            <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
              <button
                onClick={() => startEditing(selected)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0A192F] px-3 py-2 text-[12px] font-semibold text-white transition-all active:scale-95"
              >
                <Pencil size={12} />
                Edit zone
              </button>
              {selected.mode === "manual" && (
                <button
                  onClick={() => {
                    resetMutation.mutate(selected.user_id);
                    setSelected(null);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-200 px-3 py-2 text-[12px] font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
                >
                  <RotateCcw size={12} />
                  Reset to auto
                </button>
              )}
            </div>
          )}
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
            Drawing zone for {editor.territory.name ?? editor.territory.agent?.name ?? "agent"}
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
