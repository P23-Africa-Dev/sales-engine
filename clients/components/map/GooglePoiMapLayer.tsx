"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { PoiResult } from "@/lib/map/overpass-search";
import { buildCategoryDotSvg } from "@/lib/map/poi-display";

const POI_DOT_PREFIX = "poi-dot-";
const POI_LAYER_ID = "poi-markers";

function loadDotImage(map: mapboxgl.Map, color: string): Promise<void> {
  const id = `${POI_DOT_PREFIX}${color.replace("#", "")}`;
  if (map.hasImage(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image(12, 12);
    img.onload = () => {
      if (!map.hasImage(id)) map.addImage(id, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildCategoryDotSvg(color))}`;
  });
}

type Props = {
  map: mapboxgl.Map | null;
  mapReady: boolean;
  pois: PoiResult[];
  visible: boolean;
  selectedPoiId?: string | null;
  excludePlaceId?: string | null;
  onPoiClick: (poi: PoiResult) => void;
};

export function GooglePoiMapLayer({
  map,
  mapReady,
  pois,
  visible,
  selectedPoiId,
  excludePlaceId,
  onPoiClick,
}: Props) {
  const poiByIdRef = useRef<Map<string, PoiResult>>(new Map());
  const tooltipRef = useRef<mapboxgl.Popup | null>(null);

  const visiblePois = useMemo(
    () => pois.filter((poi) => poi.id !== excludePlaceId),
    [pois, excludePlaceId],
  );

  useEffect(() => {
    poiByIdRef.current = new Map(visiblePois.map((poi) => [poi.id, poi]));
  }, [visiblePois]);

  const handleEnter = useCallback(
    (e: mapboxgl.MapLayerMouseEvent) => {
      if (!map) return;
      map.getCanvas().style.cursor = "pointer";
      const feat = e.features?.[0];
      if (!feat) return;
      const coords = (feat.geometry as { type: string; coordinates: number[] })
        .coordinates as [number, number];
      const p = feat.properties as Record<string, string>;
      tooltipRef.current?.remove();

      const lines = [
        p.category ? `<p style="font-size:11px;color:${p.color ?? "#64748b"};margin:0;font-weight:600">${p.category}</p>` : "",
        p.address ? `<p style="font-size:11px;color:#64748b;margin:4px 0 0;line-height:1.4">${p.address}</p>` : "",
        p.phone ? `<p style="font-size:10px;color:#94a3b8;margin:3px 0 0">${p.phone}</p>` : "",
      ].filter(Boolean);

      if (lines.length === 0) return;

      tooltipRef.current = new mapboxgl.Popup({
        offset: [0, -8],
        closeButton: false,
        closeOnClick: false,
        anchor: "bottom",
        className: "poi-tooltip",
      })
        .setLngLat(coords)
        .setHTML(
          `<div style="padding:8px 10px;min-width:120px;max-width:220px;font-family:ui-sans-serif,system-ui,sans-serif">${lines.join("")}</div>`,
        )
        .addTo(map);
    },
    [map],
  );

  const handleLeave = useCallback(() => {
    if (map) map.getCanvas().style.cursor = "";
    tooltipRef.current?.remove();
    tooltipRef.current = null;
  }, [map]);

  const handleClick = useCallback(
    (e: mapboxgl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const id = (feat.properties as { id?: string }).id;
      if (!id) return;
      const poi = poiByIdRef.current.get(id);
      if (poi) onPoiClick(poi);
    },
    [onPoiClick],
  );

  useEffect(() => {
    let active = true;

    const cleanup = () => {
      tooltipRef.current?.remove();
      tooltipRef.current = null;
      if (!map) return;
      try {
        map.off("mouseenter", POI_LAYER_ID, handleEnter);
        map.off("mouseleave", POI_LAYER_ID, handleLeave);
        map.off("click", POI_LAYER_ID, handleClick);
        if (map.getLayer(POI_LAYER_ID)) map.removeLayer(POI_LAYER_ID);
        if (map.getSource("poi-data")) map.removeSource("poi-data");
      } catch {
        /* map may have been destroyed */
      }
    };

    cleanup();

    if (!map || !mapReady || !visible || visiblePois.length === 0) {
      return cleanup;
    }

    (async () => {
      const uniqueColors = [...new Set(visiblePois.map((p) => p.categoryColor))];
      await Promise.all(uniqueColors.map((c) => loadDotImage(map, c)));
      if (!active) return;

      map.addSource("poi-data", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: visiblePois.map((poi) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [poi.lng, poi.lat] },
            properties: {
              id: poi.id,
              name: poi.name,
              category: poi.categoryLabel,
              color: poi.categoryColor,
              address: poi.address ?? "",
              phone: poi.phone ?? "",
              selected: selectedPoiId === poi.id ? "1" : "0",
            },
          })),
        },
      });

      map.addLayer({
        id: POI_LAYER_ID,
        type: "symbol",
        source: "poi-data",
        minzoom: 12,
        layout: {
          "icon-image": ["concat", POI_DOT_PREFIX, ["slice", ["get", "color"], 1]],
          "icon-size": [
            "case",
            ["==", ["get", "selected"], "1"],
            1.15,
            1,
          ],
          "icon-anchor": "center",
          "icon-allow-overlap": false,
          "icon-ignore-placement": false,
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12,
            0,
            14,
            11,
            16,
            12,
          ],
          "text-offset": [0.9, 0],
          "text-anchor": "left",
          "text-optional": true,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-max-width": 10,
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      map.on("mouseenter", POI_LAYER_ID, handleEnter);
      map.on("mouseleave", POI_LAYER_ID, handleLeave);
      map.on("click", POI_LAYER_ID, handleClick);
    })();

    return () => {
      active = false;
      cleanup();
    };
  }, [
    map,
    mapReady,
    visible,
    visiblePois,
    selectedPoiId,
    handleEnter,
    handleLeave,
    handleClick,
  ]);

  return null;
}
