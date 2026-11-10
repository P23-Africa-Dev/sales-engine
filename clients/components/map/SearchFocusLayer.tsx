"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { LocationContext } from "@/lib/map/location-search";
import { buildSearchFocusPinSvg, GOOGLE_SEARCH_PIN_COLOR } from "@/lib/map/poi-display";

const SEARCH_PIN_ID = "search-focus-pin";
const SEARCH_LAYER_ID = "search-focus-marker";
const SEARCH_LABEL_LAYER_ID = "search-focus-label";

function loadSearchPinImage(map: mapboxgl.Map): Promise<void> {
  if (map.hasImage(SEARCH_PIN_ID)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image(32, 42);
    img.onload = () => {
      if (!map.hasImage(SEARCH_PIN_ID)) map.addImage(SEARCH_PIN_ID, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSearchFocusPinSvg())}`;
  });
}

type Props = {
  map: mapboxgl.Map | null;
  mapReady: boolean;
  focus: LocationContext | null;
};

export function SearchFocusLayer({ map, mapReady, focus }: Props) {
  const pulseMarkerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    const cleanupLayers = () => {
      if (!map) return;
      try {
        if (map.getLayer(SEARCH_LABEL_LAYER_ID)) map.removeLayer(SEARCH_LABEL_LAYER_ID);
        if (map.getLayer(SEARCH_LAYER_ID)) map.removeLayer(SEARCH_LAYER_ID);
        if (map.getSource("search-focus-data")) map.removeSource("search-focus-data");
      } catch {
        /* map may have been destroyed */
      }
      pulseMarkerRef.current?.remove();
      pulseMarkerRef.current = null;
    };

    cleanupLayers();

    if (!map || !mapReady || !focus) {
      return cleanupLayers;
    }

    let active = true;

    (async () => {
      await loadSearchPinImage(map);
      if (!active) return;

      map.addSource("search-focus-data", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: focus.center },
              properties: { name: focus.name },
            },
          ],
        },
      });

      map.addLayer({
        id: SEARCH_LAYER_ID,
        type: "symbol",
        source: "search-focus-data",
        minzoom: 1,
        layout: {
          "icon-image": SEARCH_PIN_ID,
          "icon-size": 1,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      map.addLayer({
        id: SEARCH_LABEL_LAYER_ID,
        type: "symbol",
        source: "search-focus-data",
        minzoom: 12,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 13,
          "text-offset": [0, -2.8],
          "text-anchor": "bottom",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-max-width": 14,
        },
        paint: {
          "text-color": "#111827",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      const el = document.createElement("div");
      el.className = "search-focus-pulse";
      el.style.cssText = [
        "width:28px",
        "height:28px",
        "border-radius:50%",
        `border:2px solid ${GOOGLE_SEARCH_PIN_COLOR}`,
        "opacity:0.45",
        "animation:searchFocusPulse 2s ease-out infinite",
        "pointer-events:none",
        "transform:translate(-50%, -50%)",
      ].join(";");
      pulseMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(focus.center)
        .addTo(map);
    })();

    return () => {
      active = false;
      cleanupLayers();
    };
  }, [map, mapReady, focus]);

  return null;
}
