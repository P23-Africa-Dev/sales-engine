"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { FieldActivityLiveAgent } from "@/store/field-activity-live";
import type { GoogleMapBridge } from "@/components/map/SavedLocationsLayer";
import {
  agentTrailColor,
  animateMarkerMove,
  createLiveAgentGoogleIcon,
  createLiveAgentMarkerElement,
  type LngLat,
} from "@/lib/map/agent-trail";
import { getAgentInitials } from "@/lib/tracking/map-visualization";

type GooglePolyline = {
  setMap: (map: unknown) => void;
  setPath: (path: Array<{ lat: number; lng: number }>) => void;
  setOptions: (options: Record<string, unknown>) => void;
};

type GoogleMarker = {
  setMap: (map: unknown) => void;
  setPosition: (pos: { lat: number; lng: number }) => void;
  setIcon: (icon: unknown) => void;
};

export type FieldActivityLiveLayerProps = {
  provider: "mapbox" | "google";
  ready: boolean;
  agents: FieldActivityLiveAgent[];
  selectedUserId: number | null;
  followAll: boolean;
  getMapboxMap?: () => mapboxgl.Map | null;
  getGoogleMap?: () => GoogleMapBridge | null;
};

const SOURCE_ID = "field-activity-live-routes";
const LINE_LAYER_ID = "field-activity-live-routes-line";
const STOPS_SOURCE_ID = "field-activity-live-stops";
const STOPS_LAYER_ID = "field-activity-live-stops-circle";

/** Glide duration for live position updates (points arrive every ~30-60s). */
const MOVE_ANIMATION_MS = 1800;

type MapboxLiveMarker = {
  marker: mapboxgl.Marker;
  update: (options: {
    agentName: string;
    avatarUrl?: string | null;
    color: string;
    selected?: boolean;
  }) => void;
  position: LngLat;
  cancelAnimation: (() => void) | null;
};

type GoogleLiveMarker = {
  marker: GoogleMarker;
  position: LngLat;
  cancelAnimation: (() => void) | null;
  iconKey: string;
};

function visibleAgents(
  agents: FieldActivityLiveAgent[],
  selectedUserId: number | null,
  followAll: boolean,
): FieldActivityLiveAgent[] {
  if (followAll) return agents;
  if (selectedUserId != null) {
    return agents.filter((a) => a.userId === selectedUserId);
  }
  // Default: show trails for all active field agents when on clocked-in context
  return agents;
}

export function FieldActivityLiveLayer({
  provider,
  ready,
  agents,
  selectedUserId,
  followAll,
  getMapboxMap,
  getGoogleMap,
}: FieldActivityLiveLayerProps) {
  const googlePolylinesRef = useRef<Map<number, GooglePolyline>>(new Map());
  const googleStopMarkersRef = useRef<Map<string, GoogleMarker>>(new Map());
  const mapboxLiveMarkersRef = useRef<Map<number, MapboxLiveMarker>>(new Map());
  const googleLiveMarkersRef = useRef<Map<number, GoogleLiveMarker>>(new Map());

  useEffect(() => {
    if (!ready) return;
    const visible = visibleAgents(agents, selectedUserId, followAll);

    if (provider === "mapbox") {
      const map = getMapboxMap?.();
      if (!map) return;

      const routeFeatures = visible
        .filter((a) => a.polyline.length >= 2)
        .map((a) => ({
          type: "Feature" as const,
          properties: {
            userId: a.userId,
            selected: selectedUserId === a.userId,
            color: agentTrailColor(a.userId),
          },
          geometry: {
            type: "LineString" as const,
            coordinates: a.polyline,
          },
        }));

      const stopFeatures = visible.flatMap((a) =>
        a.stops.map((stop) => ({
          type: "Feature" as const,
          properties: {
            userId: a.userId,
            stopId: stop.id,
            classification: stop.classification ?? "pending",
            label: stop.address ?? "Stop",
          },
          geometry: {
            type: "Point" as const,
            coordinates: [stop.longitude, stop.latitude] as [number, number],
          },
        })),
      );

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: routeFeatures },
        });
        map.addLayer({
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            // Each agent's trail uses their unique color (matches their moving avatar).
            "line-color": ["get", "color"],
            "line-width": [
              "case",
              ["==", ["get", "selected"], true],
              5,
              3.5,
            ],
            "line-opacity": [
              "case",
              ["==", ["get", "selected"], true],
              0.95,
              0.75,
            ],
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      } else {
        const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
        source.setData({ type: "FeatureCollection", features: routeFeatures });
      }

      if (!map.getSource(STOPS_SOURCE_ID)) {
        map.addSource(STOPS_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: stopFeatures },
        });
        map.addLayer({
          id: STOPS_LAYER_ID,
          type: "circle",
          source: STOPS_SOURCE_ID,
          paint: {
            "circle-radius": 7,
            "circle-color": "#F59E0B",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      } else {
        const source = map.getSource(STOPS_SOURCE_ID) as mapboxgl.GeoJSONSource;
        source.setData({ type: "FeatureCollection", features: stopFeatures });
      }

      // Moving live-position avatars — one per agent, animated between updates.
      const keepLive = new Set<number>();
      for (const agent of visible) {
        if (!agent.lastPosition) continue;
        keepLive.add(agent.userId);

        const color = agentTrailColor(agent.userId);
        const target = agent.lastPosition;
        let entry = mapboxLiveMarkersRef.current.get(agent.userId);

        if (!entry) {
          const { element, update } = createLiveAgentMarkerElement({
            agentName: agent.name,
            avatarUrl: agent.avatarUrl,
            color,
            selected: selectedUserId === agent.userId,
          });
          const marker = new mapboxgl.Marker({ element, anchor: "center" })
            .setLngLat(target)
            .addTo(map);
          entry = { marker, update, position: target, cancelAnimation: null };
          mapboxLiveMarkersRef.current.set(agent.userId, entry);
        } else {
          entry.update({
            agentName: agent.name,
            avatarUrl: agent.avatarUrl,
            color,
            selected: selectedUserId === agent.userId,
          });
          if (
            entry.position[0] !== target[0] ||
            entry.position[1] !== target[1]
          ) {
            entry.cancelAnimation?.();
            const from = entry.position;
            const current = entry;
            current.cancelAnimation = animateMarkerMove(
              from,
              target,
              MOVE_ANIMATION_MS,
              (pos) => {
                current.marker.setLngLat(pos);
                current.position = pos;
              },
            );
          }
        }
      }
      mapboxLiveMarkersRef.current.forEach((entry, userId) => {
        if (!keepLive.has(userId)) {
          entry.cancelAnimation?.();
          entry.marker.remove();
          mapboxLiveMarkersRef.current.delete(userId);
        }
      });

      return;
    }

    const gmap = getGoogleMap?.();
    if (!gmap || typeof window === "undefined" || !(window as unknown as { google?: typeof google }).google) {
      return;
    }
    const googleMaps = (window as unknown as { google: typeof google }).google.maps;

    const keepPolyline = new Set<number>();
    for (const agent of visible) {
      if (agent.polyline.length < 2) continue;
      keepPolyline.add(agent.userId);
      const color = agentTrailColor(agent.userId);
      const isSelected = selectedUserId === agent.userId;
      const path = agent.polyline.map(([lng, lat]) => ({ lat, lng }));
      let line = googlePolylinesRef.current.get(agent.userId);
      if (!line) {
        line = new googleMaps.Polyline({
          path,
          geodesic: true,
          strokeColor: color,
          strokeOpacity: isSelected ? 0.95 : 0.75,
          strokeWeight: isSelected ? 5 : 3.5,
          map: gmap as unknown as google.maps.Map,
        }) as unknown as GooglePolyline;
        googlePolylinesRef.current.set(agent.userId, line);
      } else {
        line.setPath(path);
        line.setOptions({
          strokeColor: color,
          strokeOpacity: isSelected ? 0.95 : 0.75,
          strokeWeight: isSelected ? 5 : 3.5,
        });
        line.setMap(gmap);
      }
    }
    googlePolylinesRef.current.forEach((line, userId) => {
      if (!keepPolyline.has(userId)) {
        line.setMap(null);
        googlePolylinesRef.current.delete(userId);
      }
    });

    // Moving live-position markers (classic Marker API — SVG icon per color).
    const keepLive = new Set<number>();
    for (const agent of visible) {
      if (!agent.lastPosition) continue;
      keepLive.add(agent.userId);

      const color = agentTrailColor(agent.userId);
      const isSelected = selectedUserId === agent.userId;
      const initials = getAgentInitials(agent.name) ?? "•";
      const iconKey = `${color}:${initials}:${isSelected ? 1 : 0}`;
      const target = agent.lastPosition;
      let entry = googleLiveMarkersRef.current.get(agent.userId);

      if (!entry) {
        const marker = new googleMaps.Marker({
          position: { lat: target[1], lng: target[0] },
          map: gmap as unknown as google.maps.Map,
          title: agent.name,
          icon: createLiveAgentGoogleIcon(
            color,
            initials,
            isSelected,
          ) as unknown as google.maps.Icon,
          zIndex: isSelected ? 40 : 20,
        }) as unknown as GoogleMarker;
        entry = { marker, position: target, cancelAnimation: null, iconKey };
        googleLiveMarkersRef.current.set(agent.userId, entry);
      } else {
        if (entry.iconKey !== iconKey) {
          entry.marker.setIcon(
            createLiveAgentGoogleIcon(color, initials, isSelected),
          );
          entry.iconKey = iconKey;
        }
        entry.marker.setMap(gmap);
        if (
          entry.position[0] !== target[0] ||
          entry.position[1] !== target[1]
        ) {
          entry.cancelAnimation?.();
          const from = entry.position;
          const current = entry;
          current.cancelAnimation = animateMarkerMove(
            from,
            target,
            MOVE_ANIMATION_MS,
            (pos) => {
              current.marker.setPosition({ lat: pos[1], lng: pos[0] });
              current.position = pos;
            },
          );
        }
      }
    }
    googleLiveMarkersRef.current.forEach((entry, userId) => {
      if (!keepLive.has(userId)) {
        entry.cancelAnimation?.();
        entry.marker.setMap(null);
        googleLiveMarkersRef.current.delete(userId);
      }
    });

    const keepStops = new Set<string>();
    for (const agent of visible) {
      for (const stop of agent.stops) {
        const key = `${agent.userId}:${stop.id}`;
        keepStops.add(key);
        let marker = googleStopMarkersRef.current.get(key);
        const position = { lat: stop.latitude, lng: stop.longitude };
        if (!marker) {
          marker = new googleMaps.Marker({
            position,
            map: gmap as unknown as google.maps.Map,
            title: stop.address ?? "Stop",
            icon: {
              path: googleMaps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#F59E0B",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          }) as unknown as GoogleMarker;
          googleStopMarkersRef.current.set(key, marker);
        } else {
          marker.setPosition(position);
          marker.setMap(gmap);
        }
      }
    }
    googleStopMarkersRef.current.forEach((marker, key) => {
      if (!keepStops.has(key)) {
        marker.setMap(null);
        googleStopMarkersRef.current.delete(key);
      }
    });
  }, [provider, ready, agents, selectedUserId, followAll, getMapboxMap, getGoogleMap]);

  useEffect(() => {
    return () => {
      googlePolylinesRef.current.forEach((line) => line.setMap(null));
      googlePolylinesRef.current.clear();
      googleStopMarkersRef.current.forEach((marker) => marker.setMap(null));
      googleStopMarkersRef.current.clear();
      googleLiveMarkersRef.current.forEach((entry) => {
        entry.cancelAnimation?.();
        entry.marker.setMap(null);
      });
      googleLiveMarkersRef.current.clear();
      mapboxLiveMarkersRef.current.forEach((entry) => {
        entry.cancelAnimation?.();
        entry.marker.remove();
      });
      mapboxLiveMarkersRef.current.clear();

      const map = getMapboxMap?.();
      if (map) {
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getLayer(STOPS_LAYER_ID)) map.removeLayer(STOPS_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        if (map.getSource(STOPS_SOURCE_ID)) map.removeSource(STOPS_SOURCE_ID);
      }
    };
  }, [getMapboxMap]);

  return null;
}
