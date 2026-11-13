"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { Flame, X } from "lucide-react";
import seed from "@/data/data.json";
import {
  CLASSIFICATION_META,
  type EnrichedVisitStop,
  type VisitClassification,
} from "@/lib/map/map-analytics-data";
import {
  useMapAnalyticsStore,
  type HeatmapTimeWindow,
  type HeatmapWeightMetric,
} from "@/store/map-analytics";
import type { AgentCoverage } from "@/lib/api/territories";

const SOURCE_ID = "field-activity-heatmap-source";
const HEATMAP_LAYER_ID = "field-activity-heatmap";
const POINTS_LAYER_ID = "field-activity-heatmap-points";

type GoogleCircleInstance = {
  setMap: (map: unknown) => void;
};

type GoogleNamespace = {
  maps: {
    Circle: new (options: Record<string, unknown>) => GoogleCircleInstance;
  };
};

export type FieldHeatmapLayerProps = {
  provider: "mapbox" | "google";
  ready: boolean;
  getMapboxMap?: () => mapboxgl.Map | null;
  getGoogleMap?: () => { map: unknown } | null;
};

export function FieldHeatmapLayer({
  provider,
  ready,
  getMapboxMap,
  getGoogleMap,
}: FieldHeatmapLayerProps) {
  const heatmapEnabled = useMapAnalyticsStore((s) => s.heatmapEnabled);
  const setHeatmapEnabled = useMapAnalyticsStore((s) => s.setHeatmapEnabled);
  const heatmapWeight = useMapAnalyticsStore((s) => s.heatmapWeight);
  const setHeatmapWeight = useMapAnalyticsStore((s) => s.setHeatmapWeight);
  const heatmapClassification = useMapAnalyticsStore(
    (s) => s.heatmapClassification
  );
  const setHeatmapClassification = useMapAnalyticsStore(
    (s) => s.setHeatmapClassification
  );
  const heatmapTimeWindow = useMapAnalyticsStore((s) => s.heatmapTimeWindow);
  const setHeatmapTimeWindow = useMapAnalyticsStore(
    (s) => s.setHeatmapTimeWindow
  );
  const selectedAgentId = useMapAnalyticsStore((s) => s.selectedAgentId);
  const selectedWeekId = useMapAnalyticsStore((s) => s.selectedWeekId);
  const selectedMonthId = useMapAnalyticsStore((s) => s.selectedMonthId);
  const weeklyRecords = useMapAnalyticsStore((s) => s.weeklyRecords);

  const googleCirclesRef = useRef<GoogleCircleInstance[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const heatmapStops: EnrichedVisitStop[] = useMemo(() => {
    if (!heatmapEnabled) return [];

    let sourceWeeks = weeklyRecords.filter((w) => w.status === "active");
    if (heatmapTimeWindow === "today") {
      const current = weeklyRecords[0];
      sourceWeeks = current ? [current] : [];
    } else if (heatmapTimeWindow === "weekly") {
      const match = weeklyRecords.find((w) => w.weekId === selectedWeekId);
      sourceWeeks = match ? [match] : weeklyRecords.slice(0, 1);
    } else if (heatmapTimeWindow === "monthly") {
      const monthMatches = weeklyRecords.filter(
        (w) => w.monthId === selectedMonthId
      );
      sourceWeeks =
        monthMatches.length > 0 ? monthMatches : weeklyRecords.slice(0, 4);
    }

    let stops = sourceWeeks.flatMap((w) =>
      w.agentBreakdown.flatMap((a) => a.stops)
    );

    if (heatmapTimeWindow === "today") {
      stops = stops.filter((s) => s.dayOfWeek === "Mon" || s.dayOfWeek === "Tue");
    }

    if (selectedAgentId != null) {
      stops = stops.filter((s) => s.userId === selectedAgentId);
    }

    if (heatmapClassification !== "all") {
      stops = stops.filter((s) => s.classification === heatmapClassification);
    }

    return stops;
  }, [
    heatmapEnabled,
    weeklyRecords,
    heatmapTimeWindow,
    selectedWeekId,
    selectedMonthId,
    selectedAgentId,
    heatmapClassification,
  ]);

  const featureCollection = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = heatmapStops.map(
      (stop) => {
        let weight = 0.75;
        if (heatmapWeight === "duration") {
          weight = Math.min(1, Math.max(0.25, stop.durationSeconds / 2400));
        } else if (heatmapWeight === "pipeline") {
          weight = Math.min(1, Math.max(0.25, stop.dealValueNgn / 22000000));
        } else {
          weight = 0.85;
        }

        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [stop.longitude, stop.latitude],
          },
          properties: {
            id: stop.id,
            weight,
            businessName: stop.businessName,
            agentName: stop.agentName,
            territoryName: stop.territoryName,
            classification: stop.classification,
            classificationLabel:
              CLASSIFICATION_META[stop.classification]?.label ?? "Client Visit",
            color:
              CLASSIFICATION_META[stop.classification]?.color ?? "#0EA5E9",
            durationMins: Math.round(stop.durationSeconds / 60),
            dealValueM: (stop.dealValueNgn / 1_000_000).toFixed(1),
            outcome: stop.outcome,
          },
        };
      }
    );

    // Supplement with trail density points when viewing "all" classifications
    if (heatmapEnabled && heatmapClassification === "all") {
      const coverageList =
        ((seed as unknown as { map?: { coverage?: AgentCoverage[] } }).map
          ?.coverage ?? []);
      coverageList
        .filter((c) => selectedAgentId == null || c.user_id === selectedAgentId)
        .forEach((cov) => {
          cov.trail_points.forEach((pt, idx) => {
            features.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [pt.longitude, pt.latitude],
              },
              properties: {
                id: `trail-${cov.user_id}-${idx}`,
                weight: 0.35,
                businessName: "Field Route Activity",
                agentName: `Agent #${cov.user_id}`,
                territoryName: "Active Corridor",
                classification: "client_visit",
                classificationLabel: "Field Corridor",
                color: "#2AE9C9",
                durationMins: 15,
                dealValueM: "4.5",
                outcome: "Active GPS Corridor",
              },
            });
          });
        });
    }

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [heatmapStops, heatmapWeight, heatmapEnabled, heatmapClassification, selectedAgentId]);

  const syncMapboxHeatmap = useCallback(() => {
    if (provider !== "mapbox") return;
    const map = getMapboxMap?.();
    if (!map || !map.isStyleLoaded()) return;

    if (!heatmapEnabled) {
      if (map.getLayer(POINTS_LAYER_ID)) map.removeLayer(POINTS_LAYER_ID);
      if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      popupRef.current?.remove();
      return;
    }

    const existing = map.getSource(SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;

    if (!existing) {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: featureCollection,
      });

      map.addLayer({
        id: HEATMAP_LAYER_ID,
        type: "heatmap",
        source: SOURCE_ID,
        maxzoom: 16,
        paint: {
          "heatmap-weight": [
            "interpolate",
            ["linear"],
            ["get", "weight"],
            0,
            0,
            1,
            1,
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1.1,
            15,
            2.8,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(14, 165, 233, 0)",
            0.18,
            "rgba(42, 233, 201, 0.52)",
            0.4,
            "rgba(14, 165, 233, 0.74)",
            0.65,
            "rgba(245, 158, 11, 0.88)",
            0.85,
            "rgba(239, 68, 68, 0.94)",
            1,
            "rgba(190, 18, 60, 0.98)",
          ],
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            22,
            13,
            34,
            16,
            46,
          ],
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.88,
            15.5,
            0.62,
          ],
        },
      });

      map.addLayer({
        id: POINTS_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        minzoom: 12.5,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12.5,
            4,
            16,
            9,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1.8,
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12.5,
            0.4,
            14,
            0.9,
          ],
        },
      });
    } else {
      existing.setData(featureCollection);
    }
  }, [provider, getMapboxMap, heatmapEnabled, featureCollection]);

  useEffect(() => {
    if (provider !== "mapbox" || !ready) return;
    const map = getMapboxMap?.();
    if (!map) return;

    syncMapboxHeatmap();
    const handleStyleData = () => syncMapboxHeatmap();
    map.on("styledata", handleStyleData);

    const handlePointClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== "Point") return;
      const coords = feat.geometry.coordinates as [number, number];
      const props = feat.properties ?? {};

      popupRef.current?.remove();
      popupRef.current = new mapboxgl.Popup({
        closeButton: true,
        offset: 12,
        maxWidth: "260px",
      })
        .setLngLat(coords)
        .setHTML(
          `<div style="font-family:Inter,system-ui,sans-serif;padding:4px 2px;">
            <div style="font-size:12.5px;font-weight:700;color:#0f172a;">${props.businessName ?? "Client Visit"}</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">${props.agentName ?? ""} · ${props.territoryName ?? ""}</div>
            <div style="display:flex;gap:8px;margin-top:6px;font-size:10.5px;font-weight:600;color:#0284c7;">
              <span>${props.classificationLabel ?? "Visit"}</span>
              <span>• ${props.durationMins ?? 25} mins</span>
              <span>• ₦${props.dealValueM ?? "8.0"}M</span>
            </div>
            <div style="font-size:10.5px;color:#64748b;margin-top:4px;">${props.outcome ?? ""}</div>
          </div>`
        )
        .addTo(map);
    };

    map.on("click", POINTS_LAYER_ID, handlePointClick);

    return () => {
      map.off("styledata", handleStyleData);
      map.off("click", POINTS_LAYER_ID, handlePointClick);
    };
  }, [provider, ready, getMapboxMap, syncMapboxHeatmap]);

  // Google Maps fallback rendering
  useEffect(() => {
    if (provider !== "google" || !ready) return;
    const bridge = getGoogleMap?.();
    const googleNs = (window as unknown as { google?: GoogleNamespace }).google;
    if (!bridge?.map || !googleNs?.maps?.Circle) return;

    googleCirclesRef.current.forEach((c) => c.setMap(null));
    googleCirclesRef.current = [];

    if (!heatmapEnabled) return;

    heatmapStops.forEach((stop) => {
      const circle = new googleNs.maps.Circle({
        map: bridge.map,
        center: { lat: stop.latitude, lng: stop.longitude },
        radius: 380,
        fillColor: "#F59E0B",
        fillOpacity: 0.35,
        strokeColor: "#EF4444",
        strokeOpacity: 0.6,
        strokeWeight: 1,
      });
      googleCirclesRef.current.push(circle);
    });

    return () => {
      googleCirclesRef.current.forEach((c) => c.setMap(null));
      googleCirclesRef.current = [];
    };
  }, [provider, ready, getGoogleMap, heatmapEnabled, heatmapStops]);

  if (!heatmapEnabled) return null;

  return (
    <div className="absolute bottom-20 right-4 z-30 w-[min(92vw,310px)] rounded-3xl border border-slate-200/80 bg-white/95 p-3.5 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
            <Flame size={15} />
          </span>
          <div>
            <p className="text-[12.5px] font-bold text-slate-800 leading-tight">
              Activity Heat Map
            </p>
            <p className="text-[10.5px] text-slate-400">
              {heatmapStops.length} weighted visit hotspots
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setHeatmapEnabled(false)}
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Hide heatmap"
        >
          <X size={14} />
        </button>
      </div>

      {/* Weight metric selector */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Intensity Weight
        </p>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              { id: "visits", label: "Visit Count" },
              { id: "duration", label: "Dwell Time" },
              { id: "pipeline", label: "Deal Value" },
            ] as { id: HeatmapWeightMetric; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setHeatmapWeight(item.id)}
              className={`rounded-lg py-1 text-[10.5px] font-semibold transition-all ${
                heatmapWeight === item.id
                  ? "bg-[#0A192F] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity classification filter */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Activity Type
        </p>
        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: "all", label: "All" },
              { id: "client_visit", label: "Client Visits" },
              { id: "merchant_onboarding", label: "Onboarding" },
              { id: "follow_up", label: "Follow-Up" },
              { id: "prospecting", label: "Prospecting" },
            ] as { id: "all" | VisitClassification; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setHeatmapClassification(item.id)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
                heatmapClassification === item.id
                  ? "bg-dash-teal text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time window */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Time Scope
        </span>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
          {(
            [
              { id: "today", label: "Today" },
              { id: "weekly", label: "Weekly" },
              { id: "monthly", label: "Monthly" },
            ] as { id: HeatmapTimeWindow; label: string }[]
          ).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setHeatmapTimeWindow(w.id)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all ${
                heatmapTimeWindow === w.id
                  ? "bg-white text-slate-800 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Thermal Gradient Bar */}
      <div className="pt-1">
        <div
          className="h-2 w-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(42,233,201,0.55) 0%, #0EA5E9 35%, #F59E0B 70%, #BE123C 100%)",
          }}
        />
        <div className="mt-1 flex justify-between text-[9.5px] font-semibold text-slate-400">
          <span>Low Activity</span>
          <span>Moderate</span>
          <span>Peak Concentration</span>
        </div>
      </div>
    </div>
  );
}
