"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import Supercluster from "supercluster";
import { format, parseISO } from "date-fns";
import type { AttendanceMapSnapshotItem } from "@/lib/api/attendance";
import {
  createClockInMarkerElement,
  createClockInMarkerGoogleIcon,
} from "@/lib/map/attendance-marker";
import type { GoogleMapBridge } from "@/components/map/SavedLocationsLayer";

type GoogleMarkerInstance = {
  setMap: (map: unknown) => void;
  addListener: (event: string, handler: () => void) => void;
};

export type ClockedInLayerProps = {
  provider: "mapbox" | "google";
  ready: boolean;
  items: AttendanceMapSnapshotItem[];
  selectedUserId: number | null;
  onSelectUserId: (userId: number | null) => void;
  getMapboxMap?: () => mapboxgl.Map | null;
  getGoogleMap?: () => GoogleMapBridge | null;
};

function buildPopupHtml(item: AttendanceMapSnapshotItem): string {
  const clockInLabel = item.clock_in_at
    ? format(parseISO(item.clock_in_at), "h:mm a")
    : "—";
  const statusLabel = item.is_late ? "Late" : "On time";
  const address = item.address ?? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`;

  return `
    <div style="min-width:180px;font-family:system-ui,sans-serif">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a">${item.agent_name}</p>
      <p style="margin:0 0 4px;font-size:12px;color:#64748b">Clocked in ${clockInLabel}</p>
      <p style="margin:0 0 8px;font-size:12px;color:${item.is_late ? "#d97706" : "#16a34a"}">${statusLabel}</p>
      <p style="margin:0;font-size:12px;color:#475569;line-height:1.4">${address}</p>
    </div>
  `;
}

export function ClockedInLayer({
  provider,
  ready,
  items,
  selectedUserId,
  onSelectUserId,
  getMapboxMap,
  getGoogleMap,
}: ClockedInLayerProps) {
  const mapboxMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const googleMarkersRef = useRef<Map<number, GoogleMarkerInstance>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const clusterRef = useRef<Supercluster | null>(null);
  const clusterMarkersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!ready) return;

    if (provider === "mapbox") {
      const map = getMapboxMap?.();
      if (!map) return;

      mapboxMarkersRef.current.forEach((marker) => marker.remove());
      mapboxMarkersRef.current.clear();
      clusterMarkersRef.current.forEach((marker) => marker.remove());
      clusterMarkersRef.current = [];

      const points = items.map((item) => ({
        type: "Feature" as const,
        properties: {
          cluster: false,
          userId: item.user_id,
          item,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [item.longitude, item.latitude] as [number, number],
        },
      }));

      const cluster = new Supercluster({
        radius: 56,
        maxZoom: 15,
      });
      cluster.load(points);
      clusterRef.current = cluster;

      const renderClusters = () => {
        clusterMarkersRef.current.forEach((marker) => marker.remove());
        clusterMarkersRef.current = [];
        mapboxMarkersRef.current.forEach((marker) => marker.remove());
        mapboxMarkersRef.current.clear();

        const bounds = map.getBounds();
        if (!bounds) return;

        const zoom = Math.floor(map.getZoom());
        const clusters = cluster.getClusters(
          [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
          zoom
        );

        clusters.forEach((feature) => {
          const [lng, lat] = feature.geometry.coordinates as [number, number];
          const isCluster = Boolean(feature.properties?.cluster);

          if (isCluster) {
            const count = Number(feature.properties?.point_count ?? 0);
            const el = document.createElement("div");
            el.style.cssText = [
              "width:42px",
              "height:42px",
              "border-radius:9999px",
              "background:#0f766e",
              "color:white",
              "display:flex",
              "align-items:center",
              "justify-content:center",
              "font-size:12px",
              "font-weight:700",
              "border:3px solid white",
              "box-shadow:0 8px 20px rgba(15,23,42,0.18)",
              "cursor:pointer",
            ].join(";");
            el.textContent = String(count);
            el.addEventListener("click", () => {
              const expansionZoom = cluster.getClusterExpansionZoom(Number(feature.id));
              map.easeTo({ center: [lng, lat], zoom: expansionZoom });
            });
            const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
              .setLngLat([lng, lat])
              .addTo(map);
            clusterMarkersRef.current.push(marker);
            return;
          }

          const item = feature.properties?.item as AttendanceMapSnapshotItem | undefined;
          if (!item) return;

          const element = createClockInMarkerElement({
            agentName: item.agent_name,
            avatarUrl: item.avatar_url,
            isLate: item.is_late,
            selected: selectedUserId === item.user_id,
          });

          element.addEventListener("click", () => {
            onSelectUserId(item.user_id);
            if (!popupRef.current) {
              popupRef.current = new mapboxgl.Popup({
                closeButton: true,
                offset: 18,
                maxWidth: "260px",
              });
            }
            popupRef.current
              .setLngLat([item.longitude, item.latitude])
              .setHTML(buildPopupHtml(item))
              .addTo(map);
            map.flyTo({ center: [item.longitude, item.latitude], zoom: Math.max(map.getZoom(), 14), speed: 1.2 });
          });

          const marker = new mapboxgl.Marker({ element, anchor: "bottom" })
            .setLngLat([item.longitude, item.latitude])
            .addTo(map);
          mapboxMarkersRef.current.set(item.user_id, marker);
        });
      };

      renderClusters();
      map.on("moveend", renderClusters);
      map.on("zoomend", renderClusters);

      const mapboxMarkers = mapboxMarkersRef.current;
      const clusterMarkers = clusterMarkersRef.current;

      return () => {
        map.off("moveend", renderClusters);
        map.off("zoomend", renderClusters);
        mapboxMarkers.forEach((marker) => marker.remove());
        mapboxMarkers.clear();
        clusterMarkers.forEach((marker) => marker.remove());
        clusterMarkers.length = 0;
        popupRef.current?.remove();
      };
    }

    const bridge = getGoogleMap?.();
    if (!bridge) return;

    googleMarkersRef.current.forEach((marker) => marker.setMap(null));
    googleMarkersRef.current.clear();

    const googleMarkers = googleMarkersRef.current;
    const googleMap = bridge.map;

    items.forEach((item) => {
      const marker = new bridge.maps.maps.Marker({
        map: googleMap,
        position: { lat: item.latitude, lng: item.longitude },
        icon: createClockInMarkerGoogleIcon(item.is_late),
        title: item.agent_name,
      }) as GoogleMarkerInstance;
      marker.addListener("click", () => {
        onSelectUserId(item.user_id);
        googleMap.panTo({ lat: item.latitude, lng: item.longitude });
        if (googleMap.getZoom() < 14) {
          googleMap.setZoom(14);
        }
      });
      googleMarkers.set(item.user_id, marker);
    });

    return () => {
      googleMarkers.forEach((marker) => marker.setMap(null));
      googleMarkers.clear();
    };
  }, [provider, ready, items, selectedUserId, onSelectUserId, getMapboxMap, getGoogleMap]);

  return null;
}
