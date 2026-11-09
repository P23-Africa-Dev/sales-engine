'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { SavedLocationsLayer, type GoogleMapBridge } from '@/components/map/SavedLocationsLayer';
import { TerritoryLayer } from '@/components/map/TerritoryLayer';
import { ClockedInLayer } from '@/components/map/ClockedInLayer';
import { useAttendanceMapSnapshots } from '@/hooks/use-attendance-map';
import { useAttendanceMapStore } from '@/store/attendance-map';
import { Eye, EyeOff, LocateFixed } from 'lucide-react';
import { MapExploreControls } from '@/components/map/map-explore-controls';
import type { SavedLocation } from '@/lib/api/saved-locations';
import { createUserLocationIndicatorElement } from '@/lib/map/user-location-marker';
import {
    getGoogleMapsPublicApiKey,
    MAPBOX_PUBLIC_TOKEN_ENV,
    createMapboxTransformRequest,
    getMapboxPublicToken,
} from '@/lib/config/public-env';
import { useEffectiveMapProvider, type EffectiveMapProviderState } from '@/hooks/use-effective-map-provider';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { useTrackingStore } from '@/store/tracking';
import { useTrackingWebSocket } from '@/hooks/use-tracking-ws';
import {
    areSamePoint,
    buildTaskTrail,
    createAgentMarkerElement,
    createStaticMarkerElement,
    resolveVisualTaskState,
    sanitizePolyline,
    updateAgentMarkerElement,
    updateAgentMarkerHeading,
} from '@/lib/tracking/map-visualization';
import { fetchDirectionsRoute, clearDirectionsCache } from '@/lib/tracking/directions';
import { resolveHeading } from '@/lib/tracking/dead-reckoning';
import {
    createMarkerMotion,
    enqueueMarkerFix,
    isMarkerMotionComplete,
    sampleMarkerPosition,
    type MarkerMotionState,
} from '@/lib/tracking/marker-motion';
import { useInitialMapViewport } from '@/hooks/use-initial-map-viewport';
import { TrackingConnectionStatus } from '@/components/tracking/TrackingConnectionStatus';
import { loadGoogleMapsApi } from '@/lib/map/google-loader';
import { getMapboxNavigationStyle, resolveMapAppearance } from '@/lib/map/style-mode';
import type { TaskMapFocus } from '@/lib/tasks/map-navigation';
import { GooglePoiMapLayer } from '@/components/map/GooglePoiMapLayer';
import { SearchFocusLayer } from '@/components/map/SearchFocusLayer';
import { PoiDetailCard } from '@/components/map/PoiDetailCard';
import { useGooglePoiViewport } from '@/hooks/use-google-poi-viewport';
import { useMapPoiDisplay } from '@/hooks/use-map-poi-display';
import type { PoiResult } from '@/lib/map/overpass-search';
import type { LocationContext } from '@/lib/map/location-search';
import { resolvePoiForSearchSelection } from '@/lib/map/poi-display';


type GoogleLatLng = { lat: number; lng: number };

type GoogleLatLngBoundsLike = {
    extend: (point: GoogleLatLng) => void;
};

type GoogleMapLike = {
    setCenter: (point: GoogleLatLng) => void;
    setZoom: (zoom: number) => void;
    getZoom: () => number;
    panTo: (point: GoogleLatLng) => void;
    fitBounds: (bounds: GoogleLatLngBoundsLike, padding?: number) => void;
    setTilt?: (tilt: number) => void;
};

type GooglePolylineLike = {
    setMap: (map: GoogleMapLike | null) => void;
    setPath: (path: GoogleLatLng[]) => void;
};

type GoogleMarkerLike = {
    setMap: (map: GoogleMapLike | null) => void;
    setPosition: (point: GoogleLatLng) => void;
    setIcon: (icon: Record<string, unknown>) => void;
};

type GoogleMapsNamespaceLike = {
    maps: {
        Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapLike;
        Marker: new (options: Record<string, unknown>) => GoogleMarkerLike;
        Polyline: new (options: Record<string, unknown>) => GooglePolylineLike;
        LatLngBounds: new () => GoogleLatLngBoundsLike;
        SymbolPath: {
            CIRCLE: unknown;
        };
    };
};

function getDestinationMarkerKind(status: 'in_progress' | 'near_destination' | 'arrived' | 'completed') {
    if (status === 'completed') return 'completed' as const;
    if (status === 'near_destination') return 'near' as const;
    if (status === 'arrived') return 'arrived' as const;
    return 'destination' as const;
}

export type AgentMapViewProps = {
    showSavedLocations?: boolean;
    focusLocation?: SavedLocation | null;
    /** Search-hit pins to always show on the map (global pins). */
    extraLocations?: SavedLocation[];
    /** Default markers: only pins created by the current agent. */
    mineSavedLocations?: boolean;
    taskFocus?: TaskMapFocus | null;
    pinToolbarClassName?: string;
    mapControlsClassName?: string;
    showPinsToggle?: boolean;
    onTogglePins?: () => void;
    pinsToggleLabel?: string;
    showGooglePois?: boolean;
    focusPoiId?: string | null;
    onPoisChange?: (pois: PoiResult[]) => void;
    onPoiBusyChange?: (busy: boolean) => void;
    onPoiZoomTooLowChange?: (zoomTooLow: boolean) => void;
    onGooglePoiSelect?: (poi: PoiResult | null) => void;
    searchFocus?: LocationContext | null;
};

function MapboxAgentMapView({
    providerState,
    showSavedLocations = true,
    focusLocation = null,
    extraLocations = [],
    mineSavedLocations = true,
    taskFocus = null,
    pinToolbarClassName,
    mapControlsClassName,
    showPinsToggle = false,
    onTogglePins,
    pinsToggleLabel = "Hide Pins",
    showGooglePois: showGooglePoisProp = true,
    focusPoiId = null,
    onPoisChange,
    onPoiBusyChange,
    onPoiZoomTooLowChange,
    onGooglePoiSelect,
    searchFocus = null,
}: AgentMapViewProps & { providerState: EffectiveMapProviderState }) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const mapLoadedRef = useRef(false);
    const agentMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const markerAnimationRef = useRef<number | null>(null);
    const markerPositionRef = useRef<[number, number] | null>(null);
    const markerMotionRef = useRef<MarkerMotionState | null>(null);
    const queuedTargetRef = useRef<string | null>(null);
    const forwardRouteCoordsRef = useRef<[number, number][] | null>(null);
    const hasInitialFitRef = useRef(false);
    const lastFitTaskIdRef = useRef<number | null>(null);
    const userLocationMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const locateMePinRef = useRef<mapboxgl.Marker | null>(null);
    const taskFocusMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const { activeTaskId } = useActiveTracking();
    const activeTask = useTrackingStore((s) =>
        activeTaskId ? s.liveTasks[activeTaskId] ?? null : null
    );
    const preferUserLocation = !taskFocus;
    const {
        viewport: initialViewport,
        isResolving: isResolvingInitialViewport,
        isUserLocation: initialViewportIsUserLocation,
    } = useInitialMapViewport({ preferUserLocation, taskFocus });
    const token = getMapboxPublicToken();
    const [mapReady, setMapReady] = useState(false);
    const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
    const [pinMode, setPinMode] = useState(false);
    const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');
    const [locating, setLocating] = useState(false);
    const [showGooglePois, setShowGooglePois] = useState(showGooglePoisProp);

    // Super-admin master toggle (per-org override) for Google business pins.
    const { enabled: poiDisplayAllowed } = useMapPoiDisplay();
    const {
        pois: viewportPois,
        busy: poiBusy,
        zoomTooLow: poiZoomTooLow,
        selectedPoi,
        setSelectedPoi,
    } = useGooglePoiViewport(mapInstance, mapReady, showGooglePois && !activeTask && poiDisplayAllowed);

    const handlePoiSelect = useCallback((poi: PoiResult) => {
        setSelectedPoi(poi);
        onGooglePoiSelect?.(poi);
        mapRef.current?.flyTo({
            center: [poi.lng, poi.lat],
            zoom: Math.max(mapRef.current?.getZoom() ?? 15, 16),
            speed: 1.2,
        });
    }, [onGooglePoiSelect, setSelectedPoi]);

    useEffect(() => {
        onPoisChange?.(viewportPois);
    }, [onPoisChange, viewportPois]);

    useEffect(() => {
        onPoiBusyChange?.(poiBusy);
    }, [onPoiBusyChange, poiBusy]);

    useEffect(() => {
        onPoiZoomTooLowChange?.(poiZoomTooLow);
    }, [onPoiZoomTooLowChange, poiZoomTooLow]);

    useEffect(() => {
        if (!focusPoiId) return;
        const poi = viewportPois.find((item) => item.id === focusPoiId);
        if (poi) setSelectedPoi(poi);
    }, [focusPoiId, viewportPois, setSelectedPoi]);

    useEffect(() => {
        if (!searchFocus?.isBusiness) {
            if (searchFocus && !searchFocus.isBusiness) {
                setSelectedPoi(null);
            }
            return;
        }
        const poi = resolvePoiForSearchSelection(searchFocus, viewportPois);
        if (poi) setSelectedPoi(poi);
    }, [searchFocus, viewportPois, setSelectedPoi]);

    useEffect(() => {
        if (!searchFocus) return;

        const map = mapRef.current;
        if (!map) return;
        if (searchFocus.bbox) {
            map.fitBounds(
                [[searchFocus.bbox[0], searchFocus.bbox[1]], [searchFocus.bbox[2], searchFocus.bbox[3]]],
                { padding: 60, duration: 1200 },
            );
        } else {
            map.flyTo({
                center: searchFocus.center,
                zoom: Math.max(map.getZoom(), 15),
                speed: 1.2,
            });
        }
    }, [searchFocus]);

    useTrackingWebSocket();
    useAttendanceMapSnapshots({}, { scope: 'agent' });
    const clockedInItemMap = useAttendanceMapStore((s) => s.items);
    const clockedInItems = useMemo(() => Object.values(clockedInItemMap), [clockedInItemMap]);
    const ownClockIn = clockedInItems[0] ?? null;

    const clearUserLocationMarkers = useCallback(() => {
        userLocationMarkerRef.current?.remove();
        userLocationMarkerRef.current = null;
        locateMePinRef.current?.remove();
        locateMePinRef.current = null;
    }, []);

    const handleLocateMe = useCallback(() => {
        if (!navigator.geolocation || locating) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                const { latitude: lat, longitude: lng } = pos.coords;
                mapRef.current?.flyTo({
                    center: [lng, lat],
                    zoom: 15,
                    duration: 1400,
                });
                clearUserLocationMarkers();
                if (mapRef.current) {
                    locateMePinRef.current = new mapboxgl.Marker({ color: '#EF4444' })
                        .setLngLat([lng, lat])
                        .addTo(mapRef.current);
                }
            },
            () => setLocating(false),
            { timeout: 10000, enableHighAccuracy: true },
        );
    }, [clearUserLocationMarkers, locating]);

    const handleMapModeChange = useCallback((mode: '2d' | '3d') => {
        if (mode === mapMode) return;
        setMapMode(mode);
        if (mode === '2d') {
            mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 800 });
            return;
        }
        mapRef.current?.easeTo({ pitch: 55, bearing: -20, duration: 800 });
    }, [mapMode]);

    const animateAgentMarker = useCallback((
        marker: mapboxgl.Marker,
        target: [number, number],
        recordedAtMs?: number,
    ) => {
        const key = `${target[0].toFixed(6)},${target[1].toFixed(6)}`;
        if (queuedTargetRef.current === key) return;
        queuedTargetRef.current = key;

        const now = performance.now();
        const from = markerPositionRef.current ?? [marker.getLngLat().lng, marker.getLngLat().lat] as [number, number];
        const base = markerMotionRef.current ?? createMarkerMotion(from, now);
        markerMotionRef.current = enqueueMarkerFix(base, target, now, recordedAtMs);

        if (markerAnimationRef.current) {
            cancelAnimationFrame(markerAnimationRef.current);
            markerAnimationRef.current = null;
        }

        const step = (frameNow: number) => {
            const state = markerMotionRef.current;
            if (!state) return;
            const pos = sampleMarkerPosition(state, frameNow);
            marker.setLngLat(pos);
            markerPositionRef.current = pos;
            if (!isMarkerMotionComplete(state, frameNow)) {
                markerAnimationRef.current = requestAnimationFrame(step);
                return;
            }
            markerAnimationRef.current = null;
        };

        markerAnimationRef.current = requestAnimationFrame(step);
    }, []);

    useEffect(() => {
        if (!mapContainer.current || mapRef.current || !token || !initialViewport) return;
        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
            container: mapContainer.current,
            style: getMapboxNavigationStyle(resolveMapAppearance()),
            center: initialViewport.center,
            zoom: initialViewport.zoom,
            attributionControl: false,
            transformRequest: createMapboxTransformRequest(),
        });
        mapRef.current = map;

        map.on('load', () => {
            map.addSource('agent-route', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: 'agent-route-casing',
                type: 'line',
                source: 'agent-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#0095FF',
                    'line-width': 12,
                    'line-opacity': 0.3,
                },
            });
            map.addLayer({
                id: 'agent-route-line',
                type: 'line',
                source: 'agent-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#0095FF',
                    'line-width': 8,
                    'line-opacity': 1,
                },
            });

            // Forward route layer: road-following path from agent → destination
            map.addSource('forward-routes', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: 'forward-route-casing',
                type: 'line',
                source: 'forward-routes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#0095FF',
                    'line-width': 12,
                    'line-opacity': 0.25,
                },
            });
            map.addLayer({
                id: 'forward-route-main',
                type: 'line',
                source: 'forward-routes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#0095FF',
                    'line-width': 8,
                    'line-opacity': 0.9,
                },
            });

            if (initialViewportIsUserLocation) {
                userLocationMarkerRef.current = new mapboxgl.Marker({
                    element: createUserLocationIndicatorElement(),
                    anchor: 'center',
                })
                    .setLngLat(initialViewport.center)
                    .addTo(map);
            }

            mapLoadedRef.current = true;
            setMapReady(true);
            setMapInstance(map);

        });

        return () => {
            mapLoadedRef.current = false;
            setMapReady(false);
            if (markerAnimationRef.current) {
                cancelAnimationFrame(markerAnimationRef.current);
                markerAnimationRef.current = null;
            }
            agentMarkerRef.current?.remove();
            originMarkerRef.current?.remove();
            destinationMarkerRef.current?.remove();
            taskFocusMarkerRef.current?.remove();
            taskFocusMarkerRef.current = null;
            clearUserLocationMarkers();
            map.remove();
            mapRef.current = null;
            setMapInstance(null);
            agentMarkerRef.current = null;
            originMarkerRef.current = null;
            destinationMarkerRef.current = null;
            markerPositionRef.current = null;
            forwardRouteCoordsRef.current = null;
            hasInitialFitRef.current = false;
            lastFitTaskIdRef.current = null;
            clearDirectionsCache();
        };
    }, [token, clearUserLocationMarkers, initialViewport, initialViewportIsUserLocation]);

    useEffect(() => {
        if (activeTask) {
            clearUserLocationMarkers();
        }
    }, [activeTask, clearUserLocationMarkers]);

    // ── Task focus: pin + fly to a task destination passed via URL ──────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current) return;

        // Live tracking view takes precedence over the static focus pin.
        if (!taskFocus || activeTask) {
            taskFocusMarkerRef.current?.remove();
            taskFocusMarkerRef.current = null;
            return;
        }

        const lngLat: [number, number] = [taskFocus.lng, taskFocus.lat];

        if (!taskFocusMarkerRef.current) {
            const marker = new mapboxgl.Marker({
                element: createStaticMarkerElement('destination'),
                anchor: 'center',
            }).setLngLat(lngLat);

            if (taskFocus.title || taskFocus.address) {
                const popup = new mapboxgl.Popup({ offset: 18, closeButton: false });
                const title = taskFocus.title ?? 'Task destination';
                const address = taskFocus.address
                    ? `<p style="font-size:11px;color:#64748b;margin:3px 0 0;">${taskFocus.address}</p>`
                    : '';
                popup.setHTML(
                    `<div style="padding:6px 8px;font-family:ui-sans-serif,system-ui,sans-serif">` +
                    `<p style="font-weight:700;font-size:12px;color:#0f172a;margin:0;">${title}</p>${address}</div>`
                );
                marker.setPopup(popup);
            }

            marker.addTo(map);
            marker.togglePopup();
            taskFocusMarkerRef.current = marker;
        } else {
            taskFocusMarkerRef.current.setLngLat(lngLat);
        }

        map.flyTo({ center: lngLat, zoom: 15.5, duration: 1200 });
    }, [taskFocus, activeTask, mapReady]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current) return;

        const routeSource = map.getSource('agent-route') as mapboxgl.GeoJSONSource | undefined;
        const forwardSource = map.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;

        if (!activeTask) {
            routeSource?.setData({ type: 'FeatureCollection', features: [] });
            forwardSource?.setData({ type: 'FeatureCollection', features: [] });
            agentMarkerRef.current?.remove();
            originMarkerRef.current?.remove();
            destinationMarkerRef.current?.remove();
            agentMarkerRef.current = null;
            originMarkerRef.current = null;
            destinationMarkerRef.current = null;
            markerPositionRef.current = null;
            hasInitialFitRef.current = false;
            lastFitTaskIdRef.current = null;
            return;
        }

        // Reset fit flag when a different task becomes active
        if (lastFitTaskIdRef.current !== null && lastFitTaskIdRef.current !== activeTask.taskId) {
            hasInitialFitRef.current = false;
        }
        lastFitTaskIdRef.current = activeTask.taskId;

        const trail = sanitizePolyline(buildTaskTrail(activeTask));
        const visualState = resolveVisualTaskState(activeTask.status, false);
        const originPoint = trail[0] ?? activeTask.lastPosition;

        routeSource?.setData({
            type: 'FeatureCollection',
            features:
                trail.length >= 2
                    ? [
                        {
                            type: 'Feature',
                            geometry: { type: 'LineString', coordinates: trail },
                            properties: { status: visualState },
                        },
                    ]
                    : [],
        });

        // Render forward routes if available
        forwardSource?.setData({
            type: 'FeatureCollection',
            features:
                forwardRouteCoordsRef.current && forwardRouteCoordsRef.current.length >= 2
                    ? [
                        {
                            type: 'Feature',
                            geometry: { type: 'LineString', coordinates: forwardRouteCoordsRef.current },
                            properties: { status: visualState },
                        },
                    ]
                    : [],
        });

        if (!originMarkerRef.current) {
            originMarkerRef.current = new mapboxgl.Marker({
                element: createStaticMarkerElement('origin'),
                anchor: 'center',
            })
                .setLngLat(originPoint)
                .addTo(map);
        } else {
            originMarkerRef.current.setLngLat(originPoint);
        }

        const agentHeading = resolveHeading(activeTask.headingDegrees ?? null, trail);
        if (!agentMarkerRef.current) {
            const agentElement = createAgentMarkerElement({
                name: activeTask.agentName,
                avatarUrl: activeTask.agentAvatarUrl,
                visualState,
                stale: false,
            });
            agentMarkerRef.current = new mapboxgl.Marker({ element: agentElement, anchor: 'center' })
                .setLngLat(activeTask.lastPosition)
                .addTo(map);
            markerPositionRef.current = activeTask.lastPosition;
            markerMotionRef.current = createMarkerMotion(activeTask.lastPosition, performance.now());
            queuedTargetRef.current = `${activeTask.lastPosition[0].toFixed(6)},${activeTask.lastPosition[1].toFixed(6)}`;
            updateAgentMarkerHeading(agentElement, agentHeading);
        } else {
            updateAgentMarkerElement(agentMarkerRef.current.getElement(), {
                name: activeTask.agentName,
                avatarUrl: activeTask.agentAvatarUrl,
                visualState,
                stale: false,
            });
            updateAgentMarkerHeading(agentMarkerRef.current.getElement(), agentHeading);
            animateAgentMarker(
                agentMarkerRef.current,
                activeTask.lastPosition,
                new Date(activeTask.lastEventAt).getTime(),
            );
        }

        if (activeTask.destination) {
            const destinationLngLat: [number, number] = [
                activeTask.destination.lng,
                activeTask.destination.lat,
            ];
            const markerKind = getDestinationMarkerKind(activeTask.status);

            if (!destinationMarkerRef.current) {
                const el = createStaticMarkerElement(markerKind);
                el.dataset.kind = markerKind;
                destinationMarkerRef.current = new mapboxgl.Marker({
                    element: el,
                    anchor: 'center',
                })
                    .setLngLat(destinationLngLat)
                    .addTo(map);
            } else {
                if (destinationMarkerRef.current.getElement().dataset.kind !== markerKind) {
                    destinationMarkerRef.current.remove();
                    const el = createStaticMarkerElement(markerKind);
                    el.dataset.kind = markerKind;
                    destinationMarkerRef.current = new mapboxgl.Marker({
                        element: el,
                        anchor: 'center',
                    })
                        .setLngLat(destinationLngLat)
                        .addTo(map);
                } else {
                    destinationMarkerRef.current.setLngLat(destinationLngLat);
                }
            }
        } else if (destinationMarkerRef.current) {
            destinationMarkerRef.current.remove();
            destinationMarkerRef.current = null;
        }

        if (!hasInitialFitRef.current) {
            // First time showing this task: fit the camera to frame agent + destination + trail
            hasInitialFitRef.current = true;
            if (activeTask.destination) {
                const bounds = new mapboxgl.LngLatBounds();
                bounds.extend(activeTask.lastPosition);
                bounds.extend([activeTask.destination.lng, activeTask.destination.lat]);
                // Include recent trail so the path is visible inside the frame
                for (const pt of trail.slice(-40)) bounds.extend(pt);
                map.fitBounds(bounds, {
                    padding: { top: 120, bottom: 80, left: 60, right: 60 },
                    maxZoom: 17,
                    duration: 900,
                });
            } else {
                map.easeTo({ center: activeTask.lastPosition, zoom: 16, duration: 900 });
            }
        } else if (markerPositionRef.current && !areSamePoint(markerPositionRef.current, activeTask.lastPosition)) {
            // Subsequent position updates: follow the agent smoothly
            map.easeTo({ center: activeTask.lastPosition, duration: 700 });
        }
    }, [activeTask, animateAgentMarker]);

    // ── Fetch Mapbox Directions route ────────────────────────────────────────────
    useEffect(() => {
        if (!token || !mapLoadedRef.current || !activeTask?.destination) return;

        let cancelled = false;
        const origin = activeTask.lastPosition;
        const dest: [number, number] = [activeTask.destination.lng, activeTask.destination.lat];

        if (areSamePoint(origin, dest) || activeTask.status === 'completed') {
            forwardRouteCoordsRef.current = null;
            const src = mapRef.current?.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;
            src?.setData({ type: 'FeatureCollection', features: [] });
            return;
        }

        fetchDirectionsRoute(origin, dest, token).then(result => {
            if (cancelled) return;
            if (result && result.coords.length >= 2) {
                forwardRouteCoordsRef.current = result.coords;
                const src = mapRef.current?.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;
                src?.setData({
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: result.coords },
                        properties: {}
                    }]
                });
            }
        });

        return () => { cancelled = true; };
    }, [activeTask?.destination, activeTask?.lastPosition, activeTask?.status, token]);

    if (!token) {
        return (
            <div className="flex items-center justify-center bg-dash-bg" style={{ height: 'calc(100vh - 64px)' }}>
                <div className="bg-white rounded-3xl p-10 shadow-lg max-w-md text-center space-y-4">
                    <h2 className="text-xl font-bold text-dash-dark">Mapbox Token Required</h2>
                    <div className="bg-gray-900 text-green-400 text-sm font-mono rounded-xl p-4 text-left">
                        {MAPBOX_PUBLIC_TOKEN_ENV}=...
                    </div>
                    <p className="text-xs text-gray-400">Add it to your Next.js environment and restart the dev server.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full" style={{ height: 'calc(100vh - 64px)' }}>
            <div ref={mapContainer} className="w-full h-full" />
            <TrackingConnectionStatus />
            {isResolvingInitialViewport && (
                <div
                    className="absolute inset-0 z-10 flex items-center justify-center bg-[#e8ecef]"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="text-center space-y-3">
                        <LocateFixed className="mx-auto text-slate-400 animate-pulse" size={28} />
                        <p className="text-sm font-medium text-slate-500">Finding your location...</p>
                    </div>
                </div>
            )}

            {showSavedLocations && (
                <SavedLocationsLayer
                    provider="mapbox"
                    ready={mapReady}
                    getMapboxMap={() => mapRef.current}
                    pinMode={pinMode}
                    onPinModeChange={setPinMode}
                    focusLocation={focusLocation}
                    extraLocations={extraLocations}
                    mine={mineSavedLocations}
                    pinToolbarClassName={pinToolbarClassName}
                />
            )}

            <TerritoryLayer
                variant="agent"
                provider="mapbox"
                ready={mapReady}
                getMapboxMap={() => mapRef.current}
                toggleClassName="absolute bottom-6 left-4 z-30 flex flex-col-reverse items-start gap-2"
            />

            {!activeTask && ownClockIn && (
                <ClockedInLayer
                    provider="mapbox"
                    ready={mapReady}
                    items={[ownClockIn]}
                    selectedUserId={ownClockIn.user_id}
                    onSelectUserId={() => {}}
                    getMapboxMap={() => mapRef.current}
                />
            )}

            {!activeTask && ownClockIn && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded-full bg-white/95 px-4 py-2 shadow-lg text-[12px] font-medium text-dash-dark">
                  You clocked in at {ownClockIn.address ?? `${ownClockIn.latitude.toFixed(4)}, ${ownClockIn.longitude.toFixed(4)}`}
                </div>
            )}

            {!activeTask && (
                <>
                    <GooglePoiMapLayer
                        map={mapInstance}
                        mapReady={mapReady}
                        pois={viewportPois}
                        visible={showGooglePois && poiDisplayAllowed}
                        selectedPoiId={selectedPoi?.id ?? null}
                        excludePlaceId={searchFocus?.placeId ?? null}
                        onPoiClick={handlePoiSelect}
                    />

                    <SearchFocusLayer
                        map={mapInstance}
                        mapReady={mapReady}
                        focus={searchFocus}
                    />

                    <PoiDetailCard
                        poi={selectedPoi}
                        onClose={() => {
                            setSelectedPoi(null);
                            onGooglePoiSelect?.(null);
                        }}
                        onCenter={(poi) => {
                            mapRef.current?.flyTo({ center: [poi.lng, poi.lat], zoom: 17, speed: 1.2 });
                        }}
                        className="absolute bottom-24 left-4 z-30 w-[min(92vw,320px)] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-2xl overflow-hidden"
                    />
                </>
            )}

            {!activeTask && (
                <div className={`${mapControlsClassName ?? 'absolute bottom-6 left-1/2 -translate-x-1/2 z-30'} flex items-center gap-2`}>
                    {poiDisplayAllowed && (
                        <button
                            type="button"
                            onClick={() => setShowGooglePois((visible) => !visible)}
                            title={showGooglePois ? 'Hide Google Places' : 'Show Google Places'}
                            className="h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 px-4 flex items-center gap-2 text-[12px] font-semibold text-dash-dark hover:bg-slate-50 active:scale-95 transition-all"
                        >
                            {showGooglePois ? <EyeOff size={16} /> : <Eye size={16} />}
                            {showGooglePois ? 'Hide Places' : 'Show Places'}
                        </button>
                    )}

                    <MapExploreControls
                        locating={locating}
                        mapMode={mapMode}
                        onLocateMe={handleLocateMe}
                        onMapModeChange={handleMapModeChange}
                        className="flex items-center gap-2"
                        showPinsToggle={showPinsToggle}
                        onTogglePins={onTogglePins}
                        pinsToggleLabel={pinsToggleLabel}
                    />
                </div>
            )}

            {providerState.fallbackReason === 'missing_google_api_key' && providerState.requestedProvider === 'google' && (
                <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/75 px-2.5 py-1.5 text-[10px] font-medium text-white">
                    Google map is selected by admin, but NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Showing Mapbox fallback.
                </div>
            )}
        </div>
    );
}

function GoogleAgentMapView({
    providerState,
    showSavedLocations = true,
    focusLocation = null,
    extraLocations = [],
    mineSavedLocations = true,
    taskFocus = null,
    pinToolbarClassName,
    mapControlsClassName,
    showPinsToggle = false,
    onTogglePins,
    pinsToggleLabel = "Hide Pins",
    searchFocus = null,
}: AgentMapViewProps & { providerState: EffectiveMapProviderState }) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const googleRef = useRef<GoogleMapsNamespaceLike | null>(null);
    const mapRef = useRef<GoogleMapLike | null>(null);
    const routeLineRef = useRef<GooglePolylineLike | null>(null);
    const connectorLineRef = useRef<GooglePolylineLike | null>(null);
    const agentMarkerRef = useRef<GoogleMarkerLike | null>(null);
    const originMarkerRef = useRef<GoogleMarkerLike | null>(null);
    const destinationMarkerRef = useRef<GoogleMarkerLike | null>(null);
    const hasInitialFitRef = useRef(false);
    const lastFitTaskIdRef = useRef<number | null>(null);
    const userLocationMarkerRef = useRef<GoogleMarkerLike | null>(null);
    const locateMePinRef = useRef<GoogleMarkerLike | null>(null);
    const taskFocusMarkerRef = useRef<GoogleMarkerLike | null>(null);
    const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);
    const [mapReady, setMapReady] = useState(false);
    const [pinMode, setPinMode] = useState(false);
    const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');
    const [locating, setLocating] = useState(false);
    const { activeTaskId } = useActiveTracking();
    const activeTask = useTrackingStore((s) =>
        activeTaskId ? s.liveTasks[activeTaskId] ?? null : null
    );
    const preferUserLocation = !taskFocus;
    const {
        viewport: initialViewport,
        isResolving: isResolvingInitialViewport,
        isUserLocation: initialViewportIsUserLocation,
    } = useInitialMapViewport({ preferUserLocation, taskFocus });

    useEffect(() => {
        if (!searchFocus || !mapRef.current) return;
        const [lng, lat] = searchFocus.center;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        mapRef.current.panTo({ lat, lng });
        mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 13, 15));
    }, [searchFocus]);

    useTrackingWebSocket();
    useAttendanceMapSnapshots({}, { scope: 'agent' });
    const clockedInItemMap = useAttendanceMapStore((s) => s.items);
    const clockedInItems = useMemo(() => Object.values(clockedInItemMap), [clockedInItemMap]);
    const ownClockIn = clockedInItems[0] ?? null;

    const clearUserLocationMarkers = useCallback(() => {
        userLocationMarkerRef.current?.setMap(null);
        userLocationMarkerRef.current = null;
        locateMePinRef.current?.setMap(null);
        locateMePinRef.current = null;
    }, []);

    const handleLocateMe = useCallback(() => {
        if (!navigator.geolocation || locating) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                const { latitude: lat, longitude: lng } = pos.coords;
                if (mapRef.current) {
                    mapRef.current.panTo({ lat, lng });
                    mapRef.current.setZoom(15);
                }
                clearUserLocationMarkers();
                if (mapRef.current && googleRef.current) {
                    locateMePinRef.current = new googleRef.current.maps.Marker({
                        map: mapRef.current,
                        position: { lat, lng },
                        title: 'Your current location',
                    });
                }
            },
            () => setLocating(false),
            { timeout: 10000, enableHighAccuracy: true },
        );
    }, [clearUserLocationMarkers, locating]);

    const handleMapModeChange = useCallback((mode: '2d' | '3d') => {
        if (mode === mapMode) return;
        setMapMode(mode);
        mapRef.current?.setTilt?.(mode === '3d' ? 45 : 0);
    }, [mapMode]);

    const clearOverlays = useCallback(() => {
        routeLineRef.current?.setMap(null);
        connectorLineRef.current?.setMap(null);
        agentMarkerRef.current?.setMap(null);
        originMarkerRef.current?.setMap(null);
        destinationMarkerRef.current?.setMap(null);

        routeLineRef.current = null;
        connectorLineRef.current = null;
        agentMarkerRef.current = null;
        originMarkerRef.current = null;
        destinationMarkerRef.current = null;
    }, []);

    useEffect(() => {
        if (!mapContainer.current || mapRef.current || !googleApiKey || !initialViewport) return;

        let cancelled = false;

        loadGoogleMapsApi(googleApiKey)
            .then((google) => {
                const googleMaps = google as unknown as GoogleMapsNamespaceLike;

                if (cancelled || !mapContainer.current) return;

                googleRef.current = googleMaps;

                mapRef.current = new googleMaps.maps.Map(mapContainer.current, {
                    center: { lat: initialViewport.center[1], lng: initialViewport.center[0] },
                    zoom: initialViewport.zoom,
                    disableDefaultUI: false,
                    fullscreenControl: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                });

                if (initialViewportIsUserLocation) {
                    userLocationMarkerRef.current = new googleMaps.maps.Marker({
                        map: mapRef.current,
                        position: { lat: initialViewport.center[1], lng: initialViewport.center[0] },
                        title: 'Your current location',
                        icon: {
                            path: googleMaps.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: '#2563EB',
                            fillOpacity: 1,
                            strokeColor: '#FFFFFF',
                            strokeWeight: 3,
                        },
                    });
                }

                setMapReady(true);
            })
            .catch(() => {
                // Key/network failures surface through fallback UI.
            });

        return () => {
            cancelled = true;
            clearOverlays();
            clearUserLocationMarkers();
            taskFocusMarkerRef.current?.setMap(null);
            taskFocusMarkerRef.current = null;
            mapRef.current = null;
            googleRef.current = null;
            setMapReady(false);
            hasInitialFitRef.current = false;
            lastFitTaskIdRef.current = null;
        };
    }, [clearOverlays, clearUserLocationMarkers, googleApiKey, initialViewport, initialViewportIsUserLocation]);

    useEffect(() => {
        if (activeTask) {
            clearUserLocationMarkers();
        }
    }, [activeTask, clearUserLocationMarkers]);

    // ── Task focus: pin + pan to a task destination passed via URL ──────────────
    useEffect(() => {
        const map = mapRef.current;
        const google = googleRef.current;
        if (!map || !google || !mapReady) return;

        if (!taskFocus || activeTask) {
            taskFocusMarkerRef.current?.setMap(null);
            taskFocusMarkerRef.current = null;
            return;
        }

        const position = { lat: taskFocus.lat, lng: taskFocus.lng };

        if (!taskFocusMarkerRef.current) {
            taskFocusMarkerRef.current = new google.maps.Marker({
                map,
                position,
                title: taskFocus.title ?? 'Task destination',
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: '#DC2626',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 3,
                },
            });
        } else {
            taskFocusMarkerRef.current.setPosition(position);
        }

        map.panTo(position);
        map.setZoom(15);
    }, [taskFocus, activeTask, mapReady]);

    useEffect(() => {
        const map = mapRef.current;
        const google = googleRef.current;

        if (!map || !google) return;

        if (!activeTask) {
            clearOverlays();
            hasInitialFitRef.current = false;
            lastFitTaskIdRef.current = null;
            return;
        }

        if (lastFitTaskIdRef.current !== null && lastFitTaskIdRef.current !== activeTask.taskId) {
            hasInitialFitRef.current = false;
        }
        lastFitTaskIdRef.current = activeTask.taskId;

        const trail = sanitizePolyline(buildTaskTrail(activeTask));
        const originPoint = trail[0] ?? activeTask.lastPosition;
        const markerKind = getDestinationMarkerKind(activeTask.status);

        if (!routeLineRef.current) {
            routeLineRef.current = new google.maps.Polyline({
                map,
                geodesic: true,
                strokeColor: '#0095FF',
                strokeOpacity: 0.92,
                strokeWeight: 4,
            });
        }

        routeLineRef.current.setPath(trail.map((point: [number, number]) => ({ lat: point[1], lng: point[0] })));

        if (activeTask.destination && !areSamePoint(activeTask.lastPosition, [activeTask.destination.lng, activeTask.destination.lat])) {
            if (!connectorLineRef.current) {
                connectorLineRef.current = new google.maps.Polyline({
                    map,
                    geodesic: true,
                    strokeColor: '#0EA5E9',
                    strokeOpacity: 0.75,
                    strokeWeight: 3,
                    icons: [{
                        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                        offset: '0',
                        repeat: '12px',
                    }],
                });
            }

            connectorLineRef.current.setPath([
                { lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] },
                { lat: activeTask.destination.lat, lng: activeTask.destination.lng },
            ]);
        } else if (connectorLineRef.current) {
            connectorLineRef.current.setMap(null);
            connectorLineRef.current = null;
        }

        if (!originMarkerRef.current) {
            originMarkerRef.current = new google.maps.Marker({
                map,
                position: { lat: originPoint[1], lng: originPoint[0] },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: '#2563EB',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2,
                },
            });
        } else {
            originMarkerRef.current.setPosition({ lat: originPoint[1], lng: originPoint[0] });
        }

        if (!agentMarkerRef.current) {
            agentMarkerRef.current = new google.maps.Marker({
                map,
                position: { lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] },
                title: activeTask.agentName,
                label: {
                    text: (activeTask.agentName || 'A').slice(0, 1).toUpperCase(),
                    color: '#FFFFFF',
                    fontWeight: '700',
                },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 12,
                    fillColor: '#0F172A',
                    fillOpacity: 0.93,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2,
                },
            });
        } else {
            agentMarkerRef.current.setPosition({ lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] });
        }

        if (activeTask.destination) {
            const destinationColor =
                markerKind === 'completed'
                    ? '#334155'
                    : markerKind === 'arrived'
                        ? '#16A34A'
                        : markerKind === 'near'
                            ? '#D97706'
                            : '#DC2626';

            if (!destinationMarkerRef.current) {
                destinationMarkerRef.current = new google.maps.Marker({
                    map,
                    position: { lat: activeTask.destination.lat, lng: activeTask.destination.lng },
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: destinationColor,
                        fillOpacity: 1,
                        strokeColor: '#FFFFFF',
                        strokeWeight: 3,
                    },
                });
            } else {
                destinationMarkerRef.current.setPosition({ lat: activeTask.destination.lat, lng: activeTask.destination.lng });
                destinationMarkerRef.current.setIcon({
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: destinationColor,
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 3,
                });
            }
        } else if (destinationMarkerRef.current) {
            destinationMarkerRef.current.setMap(null);
            destinationMarkerRef.current = null;
        }

        if (!hasInitialFitRef.current && activeTask.destination) {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] });
            bounds.extend({ lat: activeTask.destination.lat, lng: activeTask.destination.lng });
            trail.slice(-40).forEach((point) => bounds.extend({ lat: point[1], lng: point[0] }));
            map.fitBounds(bounds, 80);
            hasInitialFitRef.current = true;
            return;
        }

        hasInitialFitRef.current = true;
        map.panTo({ lat: activeTask.lastPosition[1], lng: activeTask.lastPosition[0] });
    }, [activeTask, clearOverlays]);

    if (!googleApiKey) {
        return (
            <div className="flex items-center justify-center bg-dash-bg" style={{ height: 'calc(100vh - 64px)' }}>
                <div className="bg-white rounded-3xl p-10 shadow-lg max-w-md text-center space-y-4">
                    <h2 className="text-xl font-bold text-dash-dark">Google Maps API Key Required</h2>
                    <div className="bg-gray-900 text-green-400 text-sm font-mono rounded-xl p-4 text-left">
                        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
                    </div>
                    <p className="text-xs text-gray-400">Add it to your Next.js environment and restart the dev server.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full" style={{ height: 'calc(100vh - 64px)' }}>
            <div ref={mapContainer} className="w-full h-full" />
            <TrackingConnectionStatus />
            {isResolvingInitialViewport && (
                <div
                    className="absolute inset-0 z-10 flex items-center justify-center bg-[#e8ecef]"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="text-center space-y-3">
                        <LocateFixed className="mx-auto text-slate-400 animate-pulse" size={28} />
                        <p className="text-sm font-medium text-slate-500">Finding your location...</p>
                    </div>
                </div>
            )}

            {showSavedLocations && (
                <SavedLocationsLayer
                    provider="google"
                    ready={mapReady}
                    getGoogleMap={() =>
                        mapRef.current && googleRef.current
                            ? ({ map: mapRef.current, maps: googleRef.current } as unknown as GoogleMapBridge)
                            : null
                    }
                    pinMode={pinMode}
                    onPinModeChange={setPinMode}
                    focusLocation={focusLocation}
                    extraLocations={extraLocations}
                    mine={mineSavedLocations}
                    pinToolbarClassName={pinToolbarClassName}
                />
            )}

            <TerritoryLayer
                variant="agent"
                provider="google"
                ready={mapReady}
                getGoogleMap={() => (mapRef.current ? { map: mapRef.current } : null)}
                toggleClassName="absolute bottom-6 left-4 z-30 flex flex-col-reverse items-start gap-2"
            />

            {!activeTask && ownClockIn && (
                <ClockedInLayer
                    provider="google"
                    ready={mapReady}
                    items={[ownClockIn]}
                    selectedUserId={ownClockIn.user_id}
                    onSelectUserId={() => {}}
                    getGoogleMap={() =>
                        mapRef.current && googleRef.current
                            ? ({ map: mapRef.current, maps: googleRef.current } as unknown as GoogleMapBridge)
                            : null
                    }
                />
            )}

            {!activeTask && ownClockIn && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded-full bg-white/95 px-4 py-2 shadow-lg text-[12px] font-medium text-dash-dark">
                  You clocked in at {ownClockIn.address ?? `${ownClockIn.latitude.toFixed(4)}, ${ownClockIn.longitude.toFixed(4)}`}
                </div>
            )}

            {!activeTask && (
                <MapExploreControls
                    locating={locating}
                    mapMode={mapMode}
                    onLocateMe={handleLocateMe}
                    onMapModeChange={handleMapModeChange}
                    className={mapControlsClassName}
                    showPinsToggle={showPinsToggle}
                    onTogglePins={onTogglePins}
                    pinsToggleLabel={pinsToggleLabel}
                />
            )}

            {providerState.fallbackReason === 'missing_mapbox_token' && providerState.requestedProvider === 'mapbox' && (
                <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/75 px-3 py-2 text-[11px] font-medium text-white">
                    Mapbox is selected by admin, but NEXT_PUBLIC_MAPBOX_TOKEN is missing. Showing Google fallback.
                </div>
            )}
        </div>
    );
}

export function AgentMapView({
    showSavedLocations = true,
    focusLocation = null,
    extraLocations = [],
    mineSavedLocations = true,
    taskFocus = null,
    pinToolbarClassName = "bottom-32 right-4 md:right-10 z-20",
    mapControlsClassName = "absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2",
    showPinsToggle = false,
    onTogglePins,
    pinsToggleLabel = "Hide Pins",
    showGooglePois = true,
    focusPoiId = null,
    onPoisChange,
    onPoiBusyChange,
    onPoiZoomTooLowChange,
    onGooglePoiSelect,
    searchFocus = null,
}: AgentMapViewProps = {}) {
    const providerState = useEffectiveMapProvider();

    if (providerState.effectiveProvider === 'google') {
        return (
            <GoogleAgentMapView
                providerState={providerState}
                showSavedLocations={showSavedLocations}
                focusLocation={focusLocation}
                extraLocations={extraLocations}
                mineSavedLocations={mineSavedLocations}
                taskFocus={taskFocus}
                pinToolbarClassName={pinToolbarClassName}
                mapControlsClassName={mapControlsClassName}
                showPinsToggle={showPinsToggle}
                onTogglePins={onTogglePins}
                pinsToggleLabel={pinsToggleLabel}
                searchFocus={searchFocus}
            />
        );
    }

    return (
        <MapboxAgentMapView
            providerState={providerState}
            showSavedLocations={showSavedLocations}
            focusLocation={focusLocation}
            extraLocations={extraLocations}
            mineSavedLocations={mineSavedLocations}
            taskFocus={taskFocus}
            pinToolbarClassName={pinToolbarClassName}
            mapControlsClassName={mapControlsClassName}
            showPinsToggle={showPinsToggle}
            onTogglePins={onTogglePins}
            pinsToggleLabel={pinsToggleLabel}
            showGooglePois={showGooglePois}
            focusPoiId={focusPoiId}
            onPoisChange={onPoisChange}
            onPoiBusyChange={onPoiBusyChange}
            onPoiZoomTooLowChange={onPoiZoomTooLowChange}
            onGooglePoiSelect={onGooglePoiSelect}
            searchFocus={searchFocus}
        />
    );
}
