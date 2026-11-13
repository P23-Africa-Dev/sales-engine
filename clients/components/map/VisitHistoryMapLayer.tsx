"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import {
  CLASSIFICATION_META,
  type EnrichedVisitStop,
} from "@/lib/map/map-analytics-data";
import { useMapAnalyticsStore } from "@/store/map-analytics";

const ROUTE_SOURCE_ID = "analytics-history-routes-source";
const ROUTE_LAYER_ID = "analytics-history-routes-line";
const STOPS_SOURCE_ID = "analytics-history-stops-source";
const STOPS_CIRCLE_LAYER_ID = "analytics-history-stops-circle";
const STOPS_LABEL_LAYER_ID = "analytics-history-stops-label";

export type VisitHistoryMapLayerProps = {
  provider: "mapbox" | "google";
  ready: boolean;
  getMapboxMap?: () => mapboxgl.Map | null;
};

export function VisitHistoryMapLayer({
  provider,
  ready,
  getMapboxMap,
}: VisitHistoryMapLayerProps) {
  const viewMode = useMapAnalyticsStore((s) => s.viewMode);
  const drawerOpen = useMapAnalyticsStore((s) => s.drawerOpen);
  const drawerTab = useMapAnalyticsStore((s) => s.drawerTab);
  const selectedAgentId = useMapAnalyticsStore((s) => s.selectedAgentId);
  const selectedWeekId = useMapAnalyticsStore((s) => s.selectedWeekId);
  const selectedDayOfWeek = useMapAnalyticsStore((s) => s.selectedDayOfWeek);
  const weeklyRecords = useMapAnalyticsStore((s) => s.weeklyRecords);
  const playbackIndex = useMapAnalyticsStore((s) => s.playbackIndex);

  const playbackMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const shouldRender =
    drawerOpen || viewMode === "analytical";

  const activeWeek = useMemo(
    () =>
      weeklyRecords.find((w) => w.weekId === selectedWeekId) ??
      weeklyRecords[0] ??
      null,
    [weeklyRecords, selectedWeekId]
  );

  const { visibleStops, routeFeatures, activePlaybackPolyline } = useMemo(() => {
    if (!shouldRender || !activeWeek) {
      return {
        visibleStops: [] as EnrichedVisitStop[],
        routeFeatures: [] as GeoJSON.Feature<GeoJSON.LineString>[],
        activePlaybackPolyline: [] as [number, number][],
      };
    }

    const agents =
      selectedAgentId != null
        ? activeWeek.agentBreakdown.filter((a) => a.userId === selectedAgentId)
        : activeWeek.agentBreakdown;

    let stops = agents.flatMap((a) => a.stops);
    if (drawerTab === "weekly" && selectedDayOfWeek !== "all") {
      stops = stops.filter((s) => s.dayOfWeek === selectedDayOfWeek);
    }

    const resequenced = stops.map((s, idx) => ({
      ...s,
      sequence: idx + 1,
    }));

    const rFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = agents.map((a) => ({
      type: "Feature",
      properties: {
        userId: a.userId,
        agentName: a.agentName,
        color: a.color,
      },
      geometry: {
        type: "LineString",
        coordinates: a.polyline,
      },
    }));

    const playbackCoords =
      selectedAgentId != null
        ? agents[0]?.polyline ?? []
        : agents.flatMap((a) => a.polyline);

    return {
      visibleStops: resequenced,
      routeFeatures: rFeatures,
      activePlaybackPolyline: playbackCoords,
    };
  }, [
    shouldRender,
    activeWeek,
    selectedAgentId,
    drawerTab,
    selectedDayOfWeek,
  ]);

  const stopsFeatureCollection = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features: visibleStops.map((stop) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [stop.longitude, stop.latitude],
          },
          properties: {
            id: stop.id,
            sequence: String(stop.sequence),
            businessName: stop.businessName,
            address: stop.address,
            agentName: stop.agentName,
            territoryName: stop.territoryName,
            color:
              CLASSIFICATION_META[stop.classification]?.color ??
              stop.territoryColor,
            classificationLabel:
              CLASSIFICATION_META[stop.classification]?.label ?? "Client Visit",
            durationMins: Math.round(stop.durationSeconds / 60),
            arrivedTime: new Date(stop.arrivedAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            departedTime: new Date(stop.departedAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            outcome: stop.outcome,
            dayOfWeek: stop.dayOfWeek,
          },
        })),
      }) as GeoJSON.FeatureCollection,
    [visibleStops]
  );

  const routesFeatureCollection = useMemo(
    () =>
      ({
        type: "FeatureCollection",
        features: routeFeatures,
      }) as GeoJSON.FeatureCollection,
    [routeFeatures]
  );

  useEffect(() => {
    if (provider !== "mapbox" || !ready) return;
    const map = getMapboxMap?.();
    if (!map || !map.isStyleLoaded()) return;

    if (!shouldRender) {
      if (map.getLayer(STOPS_LABEL_LAYER_ID))
        map.removeLayer(STOPS_LABEL_LAYER_ID);
      if (map.getLayer(STOPS_CIRCLE_LAYER_ID))
        map.removeLayer(STOPS_CIRCLE_LAYER_ID);
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(STOPS_SOURCE_ID)) map.removeSource(STOPS_SOURCE_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
      playbackMarkerRef.current?.remove();
      playbackMarkerRef.current = null;
      popupRef.current?.remove();
      return;
    }

    const existingRouteSource = map.getSource(ROUTE_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;

    if (!existingRouteSource) {
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: routesFeatureCollection,
      });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3.5,
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.85,
        },
      });
    } else {
      existingRouteSource.setData(routesFeatureCollection);
    }

    const existingStopsSource = map.getSource(STOPS_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;

    if (!existingStopsSource) {
      map.addSource(STOPS_SOURCE_ID, {
        type: "geojson",
        data: stopsFeatureCollection,
      });

      map.addLayer({
        id: STOPS_CIRCLE_LAYER_ID,
        type: "circle",
        source: STOPS_SOURCE_ID,
        paint: {
          "circle-radius": 11,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 2.5,
        },
      });

      map.addLayer({
        id: STOPS_LABEL_LAYER_ID,
        type: "symbol",
        source: STOPS_SOURCE_ID,
        layout: {
          "text-field": ["get", "sequence"],
          "text-size": 10.5,
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#FFFFFF",
        },
      });
    } else {
      existingStopsSource.setData(stopsFeatureCollection);
    }

    const handleStopClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== "Point") return;
      const coords = feat.geometry.coordinates as [number, number];
      const p = feat.properties ?? {};

      popupRef.current?.remove();
      popupRef.current = new mapboxgl.Popup({
        closeButton: true,
        offset: 14,
        maxWidth: "280px",
      })
        .setLngLat(coords)
        .setHTML(
          `<div style="font-family:Inter,system-ui,sans-serif;padding:4px 2px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="background:${p.color ?? "#0EA5E9"};color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;">#${p.sequence}</span>
              <span style="font-size:12.5px;font-weight:700;color:#0f172a;">${p.businessName ?? "Visit"}</span>
            </div>
            <div style="font-size:11px;color:#64748b;margin-top:3px;">${p.address ?? ""}</div>
            <div style="font-size:11px;font-weight:600;color:#334155;margin-top:5px;">
              ${p.agentName ?? ""} · ${p.dayOfWeek ?? ""} (${p.arrivedTime ?? ""} – ${p.departedTime ?? ""})
            </div>
            <div style="font-size:10.5px;font-weight:600;color:#0284c7;margin-top:3px;">
              ${p.classificationLabel ?? ""} • Dwell: ${p.durationMins ?? 25} mins
            </div>
            <div style="font-size:10.5px;color:#059669;font-weight:600;margin-top:3px;">
              ✓ ${p.outcome ?? "Verified On-Site"}
            </div>
          </div>`
        )
        .addTo(map);
    };

    map.on("click", STOPS_CIRCLE_LAYER_ID, handleStopClick);

    return () => {
      map.off("click", STOPS_CIRCLE_LAYER_ID, handleStopClick);
    };
  }, [
    provider,
    ready,
    getMapboxMap,
    shouldRender,
    routesFeatureCollection,
    stopsFeatureCollection,
  ]);

  // Playback cursor marker along the active historical route
  useEffect(() => {
    if (provider !== "mapbox" || !ready) return;
    const map = getMapboxMap?.();
    if (!map) return;

    if (!shouldRender || activePlaybackPolyline.length === 0) {
      playbackMarkerRef.current?.remove();
      playbackMarkerRef.current = null;
      return;
    }

    const idx = Math.min(
      Math.max(0, playbackIndex),
      activePlaybackPolyline.length - 1
    );
    const point = activePlaybackPolyline[idx];
    if (!point) return;

    if (!playbackMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:18px;height:18px;border-radius:9999px;background:#0EA5E9;border:3px solid #FFFFFF;box-shadow:0 0 0 4px rgba(14,165,233,0.32),0 4px 10px rgba(15,23,42,0.35);transition:transform 0.2s ease;";
      playbackMarkerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat(point)
        .addTo(map);
    } else {
      playbackMarkerRef.current.setLngLat(point);
    }
  }, [
    provider,
    ready,
    getMapboxMap,
    shouldRender,
    activePlaybackPolyline,
    playbackIndex,
  ]);

  return null;
}
