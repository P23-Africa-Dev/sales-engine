"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import Supercluster from "supercluster";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { Crosshair, Move, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  useCreateSavedLocation,
  useDeleteSavedLocation,
  useSavedLocationPermissions,
  useSavedLocationsInViewport,
  useUpdateSavedLocation,
} from "@/hooks/use-saved-locations";
import { useCrmLabels } from "@/hooks/use-crm";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import type { SavedLocation, SavedLocationViewportBounds } from "@/lib/api/saved-locations";
import { ApiRequestError } from "@/lib/api/onboarding";
import {
  createSavedLocationMarkerElement,
  createSavedLocationMarkerGoogleIcon,
} from "@/lib/map/saved-location-marker";
import { getSavedLocationLabel } from "@/lib/map/location-types";
import { reverseGeocodeWithMapbox } from "@/lib/utils/geocoding";
import { SaveLocationModal, type SaveLocationSubmitPayload } from "@/components/map/SaveLocationModal";
import { SavedLocationInfoCard } from "@/components/map/SavedLocationInfoCard";

const LONG_PRESS_MS = 600;

type GoogleNamespaceLike = {
  maps: {
    Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
    Map: unknown;
  };
};

type GoogleMarkerInstance = {
  setMap: (map: unknown) => void;
  setPosition: (point: { lat: number; lng: number }) => void;
  setDraggable: (draggable: boolean) => void;
  getPosition: () => { lat: () => number; lng: () => number } | null;
  addListener: (event: string, handler: (e?: unknown) => void) => void;
};

type GoogleMapInstance = {
  panTo: (point: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  getZoom: () => number;
  addListener: (event: string, handler: (e?: unknown) => void) => { remove: () => void };
  getDiv: () => HTMLElement;
};

export type GoogleMapBridge = { map: GoogleMapInstance; maps: GoogleNamespaceLike };

export type SavedLocationsLayerProps = {
  provider: "mapbox" | "google";
  ready: boolean;
  getMapboxMap?: () => mapboxgl.Map | null;
  getGoogleMap?: () => GoogleMapBridge | null;
  pinMode: boolean;
  onPinModeChange: (value: boolean) => void;
  /** Saved location to focus/select (search integration). */
  focusLocation?: SavedLocation | null;
  /** Extra pins to always merge into the marker set (e.g. search hits). */
  extraLocations?: SavedLocation[];
  /** When true, viewport fetch returns only pins created by the current user. */
  mine?: boolean;
  /** Read-only mode (compact widget): render markers only, no create/edit/move/delete. */
  readOnly?: boolean;
  /** When provided, only markers whose id is in this set are rendered. */
  visibleIds?: Set<number> | null;
  /** Override pin toolbar position (e.g. above a bottom sheet on agent map). */
  pinToolbarClassName?: string;
};

type PendingPin = {
  sessionId: string;
  lng: number;
  lat: number;
  address: string;
  addressLoading: boolean;
};

type ManualMoveRequirement = {
  locationId: number;
  address: string;
};

export function SavedLocationsLayer({
  provider,
  ready,
  getMapboxMap,
  getGoogleMap,
  pinMode,
  onPinModeChange,
  focusLocation,
  extraLocations = [],
  mine = false,
  readOnly = false,
  visibleIds = null,
  pinToolbarClassName = "bottom-32 right-4 md:right-10 z-20",
}: SavedLocationsLayerProps) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const crmApiBasePath = (role ?? "").toLowerCase() === "agent" ? "/agent" : "/admin";
  const { data: crmLabels = [] } = useCrmLabels(companyId ?? undefined, crmApiBasePath);

  const [viewportBounds, setViewportBounds] = useState<SavedLocationViewportBounds | null>(null);
  const boundsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readMapboxBounds = useCallback((): SavedLocationViewportBounds | null => {
    const map = getMapboxMap?.();
    if (!map) return null;
    const b = map.getBounds();
    if (!b) return null;
    // Pad slightly so edge pins stay visible while panning.
    const pad = 0.02;
    return {
      min_lat: b.getSouth() - pad,
      max_lat: b.getNorth() + pad,
      min_lng: b.getWest() - pad,
      max_lng: b.getEast() + pad,
    };
  }, [getMapboxMap]);

  const readGoogleBounds = useCallback((): SavedLocationViewportBounds | null => {
    const bridge = getGoogleMap?.();
    if (!bridge?.map) return null;
    const map = bridge.map as GoogleMapInstance & {
      getBounds?: () => {
        getSouthWest: () => { lat: () => number; lng: () => number };
        getNorthEast: () => { lat: () => number; lng: () => number };
      } | null;
    };
    const b = map.getBounds?.();
    if (!b) return null;
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const pad = 0.02;
    return {
      min_lat: sw.lat() - pad,
      max_lat: ne.lat() + pad,
      min_lng: sw.lng() - pad,
      max_lng: ne.lng() + pad,
    };
  }, [getGoogleMap]);

  const scheduleBoundsUpdate = useCallback(() => {
    if (boundsDebounceRef.current) clearTimeout(boundsDebounceRef.current);
    boundsDebounceRef.current = setTimeout(() => {
      const next = provider === "mapbox" ? readMapboxBounds() : readGoogleBounds();
      setViewportBounds(next);
    }, 250);
  }, [provider, readMapboxBounds, readGoogleBounds]);

  useEffect(() => {
    if (!ready) return;
    scheduleBoundsUpdate();

    if (provider === "mapbox") {
      const map = getMapboxMap?.();
      if (!map) return;
      const handler = () => scheduleBoundsUpdate();
      map.on("moveend", handler);
      map.on("zoomend", handler);
      return () => {
        map.off("moveend", handler);
        map.off("zoomend", handler);
        if (boundsDebounceRef.current) clearTimeout(boundsDebounceRef.current);
      };
    }

    const bridge = getGoogleMap?.();
    if (!bridge?.map) return;
    const listener = bridge.map.addListener("idle", () => scheduleBoundsUpdate());
    return () => {
      listener.remove();
      if (boundsDebounceRef.current) clearTimeout(boundsDebounceRef.current);
    };
  }, [ready, provider, getMapboxMap, getGoogleMap, scheduleBoundsUpdate]);

  const { data: viewportLocations = [] } = useSavedLocationsInViewport(viewportBounds, {
    enabled: ready,
    mine,
  });

  const permissions = useSavedLocationPermissions();
  const createMutation = useCreateSavedLocation();
  const [manualMoveRequirement, setManualMoveRequirement] = useState<ManualMoveRequirement | null>(null);
  const updateMutation = useUpdateSavedLocation({
    onError: () => {
      // Error handling is contextual in this component (edit fallback vs move errors).
    },
  });
  const deleteMutation = useDeleteSavedLocation();

  const [selected, setSelected] = useState<SavedLocation | null>(null);

  const locations = useMemo(() => {
    const byId = new Map<number, SavedLocation>();
    for (const loc of viewportLocations) byId.set(loc.id, loc);
    for (const loc of extraLocations) byId.set(loc.id, loc);
    if (focusLocation) byId.set(focusLocation.id, focusLocation);
    if (selected) byId.set(selected.id, selected);
    return Array.from(byId.values());
  }, [viewportLocations, extraLocations, focusLocation, selected]);

  const visibleIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => { visibleIdsRef.current = visibleIds; }, [visibleIds]);

  const alwaysVisibleIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const ids = new Set<number>();
    if (focusLocation) ids.add(focusLocation.id);
    for (const loc of extraLocations) ids.add(loc.id);
    if (selected) ids.add(selected.id);
    alwaysVisibleIdsRef.current = ids;
  }, [focusLocation, extraLocations, selected]);

  const isLocationVisible = useCallback((locId: number) => {
    if (alwaysVisibleIdsRef.current.has(locId)) return true;
    if (!visibleIdsRef.current) return true;
    return visibleIdsRef.current.has(locId);
  }, []);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [editing, setEditing] = useState<SavedLocation | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SavedLocation | null>(null);

  // Imperative marker stores
  const mbMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const mbMoveMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const mbPendingMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const googleMarkersRef = useRef<GoogleMarkerInstance[]>([]);
  const googleClustererRef = useRef<MarkerClusterer | null>(null);
  const googleMoveMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const googlePendingMarkerRef = useRef<GoogleMarkerInstance | null>(null);

  const locationsRef = useRef<SavedLocation[]>(locations);
  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  const canManageSelected = Boolean(selected?.can_manage && permissions.canEdit);
  const canDeleteSelected = Boolean(
    selected &&
      selected.company_id != null &&
      (permissions.canDelete || (permissions.canEdit && selected.can_manage)),
  );

  const commitMove = useCallback(
    async (location: SavedLocation, lng: number, lat: number) => {
      const forcedManualAddress =
        manualMoveRequirement && manualMoveRequirement.locationId === location.id
          ? manualMoveRequirement.address
          : null;

      const address = await reverseGeocodeWithMapbox(lng, lat);
      updateMutation.mutate(
        {
          locationId: location.id,
          payload: {
            latitude: lat,
            longitude: lng,
            ...(forcedManualAddress
              ? { address: forcedManualAddress }
              : (address ? { address } : {})),
          },
        },
        {
          onSuccess: (res) => {
            if (forcedManualAddress) {
              toast.success(
                res.data.location.linked_to_crm
                  ? "Location updated with manual pin placement and synced to CRM."
                  : "Location updated with manual pin placement."
              );
              setManualMoveRequirement(null);
            } else {
              toast.success("Location moved.");
            }
            setSelected(res.data.location);
            setMoveMode(false);
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to move location.");
          },
        }
      );
    },
    [manualMoveRequirement, updateMutation]
  );

  const clearMapboxMarkers = useCallback(() => {
    mbMarkersRef.current.forEach((m) => m.remove());
    mbMarkersRef.current = [];
  }, []);

  const clearGoogleMarkers = useCallback(() => {
    googleClustererRef.current?.clearMarkers();
    googleMarkersRef.current.forEach((m) => m.setMap(null));
    googleMarkersRef.current = [];
  }, []);

  const openPinAt = useCallback(async (lng: number, lat: number) => {
    if (!permissions.canCreate) return;
    setSelected(null);
    setPendingPin({
      sessionId: crypto.randomUUID(),
      lng,
      lat,
      address: "",
      addressLoading: true,
    });
    const address = await reverseGeocodeWithMapbox(lng, lat);
    setPendingPin((prev) =>
      prev && prev.lng === lng && prev.lat === lat
        ? { ...prev, address: address ?? "", addressLoading: false }
        : prev
    );
  }, [permissions.canCreate]);

  const handlePendingCoordinatesChange = useCallback((lat: number, lng: number) => {
    setPendingPin((prev) => (prev ? { ...prev, lat, lng, addressLoading: false } : prev));

    if (provider === "mapbox") {
      const map = getMapboxMap?.();
      map?.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 14),
        speed: 1.2,
      });
      mbPendingMarkerRef.current?.setLngLat([lng, lat]);
    } else {
      const ctx = getGoogleMap?.();
      ctx?.map.panTo({ lat, lng });
      ctx?.map.setZoom(Math.max(ctx.map.getZoom(), 14));
      googlePendingMarkerRef.current?.setPosition({ lat, lng });
    }
  }, [provider, getMapboxMap, getGoogleMap]);

  // ── Mapbox: render saved-location markers with supercluster ───────────────────
  const renderMapboxClusters = useCallback(() => {
    const map = getMapboxMap?.();
    if (!map) return;

    clearMapboxMarkers();

    const points = locationsRef.current
      .filter((loc) => !(moveMode && selected && loc.id === selected.id))
      .filter((loc) => isLocationVisible(loc.id))
      .map((loc) => ({
        type: "Feature" as const,
        properties: { locationId: loc.id },
        geometry: { type: "Point" as const, coordinates: [loc.longitude, loc.latitude] },
      }));

    const index = new Supercluster({ radius: 50, maxZoom: 16 });
    index.load(points);

    const bounds = map.getBounds();
    if (!bounds) return;
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const zoom = Math.round(map.getZoom());
    const clusters = index.getClusters(bbox, zoom);

    clusters.forEach((cluster) => {
      const [lng, lat] = cluster.geometry.coordinates;
      const props = cluster.properties as { cluster?: boolean; point_count?: number; locationId?: number };

      if (props.cluster) {
        const el = document.createElement("div");
        el.style.cssText = [
          "width:34px",
          "height:34px",
          "border-radius:50%",
          "background:#094B5C",
          "color:#fff",
          "border:2px solid #fff",
          "box-shadow:0 2px 6px rgba(0,0,0,0.3)",
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "font-size:12px",
          "font-weight:700",
          "cursor:pointer",
        ].join(";");
        el.textContent = String(props.point_count ?? "");
        el.addEventListener("click", () => {
          const expansionZoom = Math.min(index.getClusterExpansionZoom(cluster.id as number), 18);
          map.flyTo({ center: [lng, lat], zoom: expansionZoom, speed: 1.2 });
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
        mbMarkersRef.current.push(marker);
        return;
      }

      const loc = locationsRef.current.find((l) => l.id === props.locationId);
      if (!loc) return;
      const el = createSavedLocationMarkerElement({
        name: loc.name,
        type: loc.type,
        selected: selected?.id === loc.id,
      });
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        setPendingPin(null);
        setMoveMode(false);
        setSelected(loc);
        map.flyTo({ center: [loc.longitude, loc.latitude], zoom: Math.max(map.getZoom(), 14), speed: 1.1 });
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([loc.longitude, loc.latitude])
        .addTo(map);
      mbMarkersRef.current.push(marker);
    });
  }, [getMapboxMap, clearMapboxMarkers, moveMode, selected, isLocationVisible]);

  useEffect(() => {
    if (provider !== "mapbox" || !ready) return;
    const map = getMapboxMap?.();
    if (!map) return;

    renderMapboxClusters();
    const handler = () => renderMapboxClusters();
    map.on("moveend", handler);
    map.on("zoomend", handler);

    return () => {
      map.off("moveend", handler);
      map.off("zoomend", handler);
    };
  }, [provider, ready, locations, renderMapboxClusters, getMapboxMap]);

  useEffect(() => {
    return () => {
      clearMapboxMarkers();
      mbMoveMarkerRef.current?.remove();
      mbPendingMarkerRef.current?.remove();
    };
  }, [clearMapboxMarkers]);

  // ── Mapbox: pin-mode click + long-press ──────────────────────────────────────
  useEffect(() => {
    if (provider !== "mapbox" || !ready || readOnly) return;
    const map = getMapboxMap?.();
    if (!map) return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!pinMode) return;
      void openPinAt(e.lngLat.lng, e.lngLat.lat);
      onPinModeChange(false);
    };
    map.on("click", onClick);

    const container = map.getContainer();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startPoint: { x: number; y: number } | null = null;

    const onPointerDown = (ev: PointerEvent) => {
      if (pinMode) return;
      startPoint = { x: ev.clientX, y: ev.clientY };
      timer = setTimeout(() => {
        const rect = container.getBoundingClientRect();
        const lngLat = map.unproject([ev.clientX - rect.left, ev.clientY - rect.top]);
        void openPinAt(lngLat.lng, lngLat.lat);
      }, LONG_PRESS_MS);
    };
    const cancel = (ev?: PointerEvent) => {
      if (timer && startPoint && ev) {
        const moved = Math.hypot(ev.clientX - startPoint.x, ev.clientY - startPoint.y);
        if (moved < 10) {
          // treated as press; allow long-press timer to decide
        }
      }
      if (timer) clearTimeout(timer);
      timer = null;
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", cancel);
    container.addEventListener("pointermove", cancel);
    container.addEventListener("pointercancel", cancel);

    return () => {
      map.off("click", onClick);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", cancel);
      container.removeEventListener("pointermove", cancel);
      container.removeEventListener("pointercancel", cancel);
      if (timer) clearTimeout(timer);
    };
  }, [provider, ready, pinMode, openPinAt, onPinModeChange, getMapboxMap, readOnly]);

  // ── Mapbox: pending pin marker ────────────────────────────────────────────────
  useEffect(() => {
    if (provider !== "mapbox") return;
    const map = getMapboxMap?.();
    mbPendingMarkerRef.current?.remove();
    mbPendingMarkerRef.current = null;
    if (!map || !pendingPin) return;

    const el = document.createElement("div");
    el.innerHTML = "📍";
    el.style.cssText = "font-size:28px;line-height:1;cursor:grab;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));";
    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: true })
      .setLngLat([pendingPin.lng, pendingPin.lat])
      .addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLngLat();
      void openPinAt(pos.lng, pos.lat);
    });
    mbPendingMarkerRef.current = marker;
  }, [provider, pendingPin, getMapboxMap, openPinAt]);

  // ── Mapbox: draggable move marker ─────────────────────────────────────────────
  useEffect(() => {
    if (provider !== "mapbox") return;
    const map = getMapboxMap?.();
    mbMoveMarkerRef.current?.remove();
    mbMoveMarkerRef.current = null;
    if (!map || !moveMode || !selected) return;

    const el = createSavedLocationMarkerElement({
      name: selected.name,
      type: selected.type,
      selected: true,
    });
    el.style.outline = "3px solid #22D3EE";
    el.style.outlineOffset = "2px";
    const marker = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: true })
      .setLngLat([selected.longitude, selected.latitude])
      .addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLngLat();
      void commitMove(selected, pos.lng, pos.lat);
    });
    mbMoveMarkerRef.current = marker;
    renderMapboxClusters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, moveMode, selected, getMapboxMap]);

  // ── Google: markers + clusterer ───────────────────────────────────────────────
  useEffect(() => {
    if (provider !== "google" || !ready) return;
    const ctx = getGoogleMap?.();
    if (!ctx) return;
    const { map, maps } = ctx;

    clearGoogleMarkers();

    const markers = locationsRef.current
      .filter((loc) => !(moveMode && selected && loc.id === selected.id))
      .filter((loc) => isLocationVisible(loc.id))
      .map((loc) => {
        const icon = createSavedLocationMarkerGoogleIcon({
          name: loc.name,
          type: loc.type,
          selected: selected?.id === loc.id,
        });
        const marker = new maps.maps.Marker({
          position: { lat: loc.latitude, lng: loc.longitude },
          title: `${loc.name} · ${getSavedLocationLabel(loc.type)}`,
          icon: {
            url: icon.url,
            scaledSize: new (window as unknown as { google: { maps: { Size: new (w: number, h: number) => unknown } } }).google.maps.Size(
              icon.scaledSize.width,
              icon.scaledSize.height,
            ),
            anchor: new (window as unknown as { google: { maps: { Point: new (x: number, y: number) => unknown } } }).google.maps.Point(
              icon.anchor.x,
              icon.anchor.y,
            ),
          },
        });
        marker.addListener("click", () => {
          setPendingPin(null);
          setMoveMode(false);
          setSelected(loc);
          map.panTo({ lat: loc.latitude, lng: loc.longitude });
          if (map.getZoom() < 14) map.setZoom(14);
        });
        return marker;
      });

    googleMarkersRef.current = markers;

    if (!googleClustererRef.current) {
      googleClustererRef.current = new MarkerClusterer({ map: map as unknown as google.maps.Map, markers: markers as unknown as google.maps.Marker[] });
    } else {
      googleClustererRef.current.clearMarkers();
      googleClustererRef.current.addMarkers(markers as unknown as google.maps.Marker[]);
    }

    return () => {
      clearGoogleMarkers();
    };
  }, [provider, ready, locations, moveMode, selected, getGoogleMap, clearGoogleMarkers, isLocationVisible]);

  // ── Google: pin-mode click + long-press ───────────────────────────────────────
  useEffect(() => {
    if (provider !== "google" || !ready || readOnly) return;
    const ctx = getGoogleMap?.();
    if (!ctx) return;
    const { map } = ctx;

    const clickListener = map.addListener("click", (e?: unknown) => {
      if (!pinMode) return;
      const evt = e as { latLng?: { lat: () => number; lng: () => number } };
      if (!evt?.latLng) return;
      void openPinAt(evt.latLng.lng(), evt.latLng.lat());
      onPinModeChange(false);
    });

    const div = map.getDiv();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onPointerDown = () => {
      if (pinMode) return;
      // Long-press uses map center as a fallback target on touch devices.
      timer = setTimeout(() => {
        // No reliable lat/lng from pointer on Google without projection; use center.
        const center = (map as unknown as { getCenter: () => { lat: () => number; lng: () => number } }).getCenter();
        if (center) void openPinAt(center.lng(), center.lat());
      }, LONG_PRESS_MS);
    };
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    div.addEventListener("pointerdown", onPointerDown);
    div.addEventListener("pointerup", cancel);
    div.addEventListener("pointermove", cancel);

    return () => {
      clickListener.remove();
      div.removeEventListener("pointerdown", onPointerDown);
      div.removeEventListener("pointerup", cancel);
      div.removeEventListener("pointermove", cancel);
      if (timer) clearTimeout(timer);
    };
  }, [provider, ready, pinMode, openPinAt, onPinModeChange, getGoogleMap, readOnly]);

  // ── Google: pending pin + move markers ────────────────────────────────────────
  useEffect(() => {
    if (provider !== "google") return;
    const ctx = getGoogleMap?.();
    googlePendingMarkerRef.current?.setMap(null);
    googlePendingMarkerRef.current = null;
    if (!ctx || !pendingPin) return;
    const { map, maps } = ctx;
    const marker = new maps.maps.Marker({
      position: { lat: pendingPin.lat, lng: pendingPin.lng },
      map: map as unknown,
      draggable: true,
    });
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (pos) void openPinAt(pos.lng(), pos.lat());
    });
    googlePendingMarkerRef.current = marker;
  }, [provider, pendingPin, getGoogleMap, openPinAt]);

  useEffect(() => {
    if (provider !== "google") return;
    const ctx = getGoogleMap?.();
    googleMoveMarkerRef.current?.setMap(null);
    googleMoveMarkerRef.current = null;
    if (!ctx || !moveMode || !selected) return;
    const { map, maps } = ctx;
    const marker = new maps.maps.Marker({
      position: { lat: selected.latitude, lng: selected.longitude },
      map: map as unknown,
      draggable: true,
    });
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (pos) void commitMove(selected, pos.lng(), pos.lat());
    });
    googleMoveMarkerRef.current = marker;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, moveMode, selected, getGoogleMap]);

  // ── Focus from search ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!focusLocation) return;
    if (provider === "mapbox") {
      getMapboxMap?.()?.flyTo({ center: [focusLocation.longitude, focusLocation.latitude], zoom: 15, speed: 1.2 });
    } else {
      const ctx = getGoogleMap?.();
      ctx?.map.panTo({ lat: focusLocation.latitude, lng: focusLocation.longitude });
      ctx?.map.setZoom(15);
    }
    // Defer selection so it lands after marker render and avoids a cascading render.
    const id = window.setTimeout(() => setSelected(focusLocation), 0);
    return () => window.clearTimeout(id);
  }, [focusLocation, provider, getMapboxMap, getGoogleMap]);

  const handleCreateSubmit = (payload: SaveLocationSubmitPayload) => {
    createMutation.mutate(
      {
        name: payload.name,
        type: payload.type,
        description: payload.description || null,
        address: payload.address || null,
        contact_number: payload.contact_number || null,
        email: payload.email || null,
        latitude: payload.latitude,
        longitude: payload.longitude,
        save_to_crm: payload.save_to_crm ?? false,
        ...(payload.save_to_crm && payload.crm_status ? { crm_status: payload.crm_status } : {}),
      },
      {
        onSuccess: (res) => {
          toast.success(
            res.data.location.linked_to_crm
              ? "Location saved to map and Map Leads pipeline."
              : "Location saved."
          );
          setPendingPin(null);
          setSelected(res.data.location);
        },
      }
    );
  };

  const handleEditSubmit = (payload: SaveLocationSubmitPayload) => {
    if (!editing) return;
    updateMutation.mutate(
      {
        locationId: editing.id,
        payload: {
          name: payload.name,
          type: payload.type,
          description: payload.description || null,
          address: payload.address || null,
          contact_number: payload.contact_number || null,
          email: payload.email || null,
          latitude: payload.latitude,
          longitude: payload.longitude,
        },
      },
      {
        onSuccess: (res) => {
          toast.success(
            res.data.location.linked_to_crm
              ? "Location and linked CRM lead updated."
              : "Location updated."
          );
          setManualMoveRequirement(null);
          setEditing(null);
          setSelected(res.data.location);
        },
        onError: (err) => {
          const apiErr = err instanceof ApiRequestError ? err : null;
          const geocodeMessage = apiErr?.errors?.address?.[0] ?? "";
          const requiresManualMove = geocodeMessage.toLowerCase().includes("unable to geocode this address");

          if (requiresManualMove && editing) {
            const editedAddress = payload.address.trim();
            if (!editedAddress) {
              toast.error("Address cannot be empty.");
              return;
            }

            setManualMoveRequirement({
              locationId: editing.id,
              address: editedAddress,
            });
            setEditing(null);
            setSelected({ ...editing, address: editedAddress });
            setMoveMode(true);
            toast.warning("Address could not be pinned automatically. Drag the pin to the correct spot to finish saving.");
            return;
          }

          toast.error(err instanceof Error ? err.message : "Failed to update location.");
        },
      }
    );
  };

  const handleSaveCurrentLocation = () => {
    if (!permissions.canCreate) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not available.");
      return;
    }
    toast.info("Getting your current location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (provider === "mapbox") {
          getMapboxMap?.()?.flyTo({ center: [longitude, latitude], zoom: 15, speed: 1.2 });
        } else {
          getGoogleMap?.()?.map.panTo({ lat: latitude, lng: longitude });
        }
        void openPinAt(longitude, latitude);
      },
      () => toast.error("Unable to access your location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <>
      {permissions.canCreate && !readOnly && (
        <div className={`absolute flex flex-col items-end gap-3 ${pinToolbarClassName}`}>
          <button
            onClick={handleSaveCurrentLocation}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0B1215] shadow-xl hover:bg-gray-50"
          >
            <Crosshair size={15} className="text-[#094B5C]" />
            Save current location
          </button>
          {/* <button
            onClick={() => onPinModeChange(!pinMode)}
            className={`px-8 py-3.5 rounded-full font-bold text-[14px] shadow-xl shadow-purple-500/30 transition-all flex items-center gap-2 text-white ${pinMode
              ? "bg-gradient-to-r from-[#0A7E8C] to-[#094B5C]"
              : "bg-gradient-to-r from-[#D946EF] to-[#9333EA] hover:from-[#C026D3] hover:to-[#7E22CE]"
              }`}
          >
            {pinMode ? "Cancel Pin" : "Location Pinning"}
          </button> */}
          {pinMode && (
            <span className="rounded-full bg-[#094B5C] px-4 py-2 text-[12px] font-semibold text-white shadow-lg animate-pulse">
              Tap the map to drop a pin
            </span>
          )}
        </div>
      )}

      {/* Details panel */}
      {selected && !editing && (
        <SavedLocationInfoCard
          location={selected}
          onClose={() => {
            setSelected(null);
            setMoveMode(false);
            setManualMoveRequirement(null);
          }}
          moveMode={moveMode}
          moveHint={manualMoveRequirement
            ? "Address could not be pinned automatically. Drag this pin to the exact location, then release to finish saving."
            : null}
          footer={
            ((canManageSelected || canDeleteSelected) && !readOnly) ? (
              <div className="flex items-center gap-2 px-5 py-3">
                {canManageSelected && (
                  <>
                    <button
                      disabled={!!manualMoveRequirement}
                      onClick={() => setEditing(selected)}
                      className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      disabled={!!manualMoveRequirement && moveMode}
                      onClick={() => setMoveMode((v) => !v)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold ${moveMode ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Move size={13} /> {moveMode ? "Moving…" : "Move"}
                    </button>
                  </>
                )}
                {canDeleteSelected && (
                  <button
                    onClick={() => setConfirmDelete(selected)}
                    className="ml-auto flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            ) : undefined
          }
        />
      )}

      {/* Create modal */}
      {pendingPin && (
        <SaveLocationModal
          key={`create-${pendingPin.sessionId}`}
          open
          mode="create"
          latitude={pendingPin.lat}
          longitude={pendingPin.lng}
          address={pendingPin.address}
          addressLoading={pendingPin.addressLoading}
          busy={createMutation.isPending}
          crmLabels={crmLabels}
          onSubmit={handleCreateSubmit}
          onCoordinatesChange={handlePendingCoordinatesChange}
          onClose={() => setPendingPin(null)}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <SaveLocationModal
          key={`edit-${editing.id}`}
          open
          mode="edit"
          latitude={editing.latitude}
          longitude={editing.longitude}
          address={editing.address ?? ""}
          initial={editing}
          busy={updateMutation.isPending}
          onSubmit={handleEditSubmit}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <DeleteConfirm
          name={confirmDelete.name}
          busy={deleteMutation.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() =>
            deleteMutation.mutate(confirmDelete.id, {
              onSuccess: () => {
                toast.success("Location deleted.");
                setConfirmDelete(null);
                setSelected(null);
              },
            })
          }
        />
      )}
    </>
  );
}

function DeleteConfirm({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (typeof document === "undefined") return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-[16px] font-bold text-[#0B1215]">Delete location</h3>
        <p className="mt-2 text-[13px] text-slate-500">
          Are you sure you want to delete <span className="font-semibold text-slate-700">{name}</span>? This cannot be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
