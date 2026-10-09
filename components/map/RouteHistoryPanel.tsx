'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { X, MapPin, Route, CheckCircle2, Navigation } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import {
  createMapboxTransformRequest,
  getGoogleMapsPublicApiKey,
  getMapboxPublicToken,
} from '@/lib/config/public-env';
import { getCountryFallbackViewport } from '@/lib/map/default-viewport';
import { useTaskRoute } from '@/hooks/use-tracking';
import { useEffectiveMapProvider } from '@/hooks/use-effective-map-provider';
import { loadGoogleMapsApi } from '@/lib/map/google-loader';
import { RoutePlaybackControls } from '@/components/operations/route-playback-controls';

type RouteGoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
      fitBounds: (bounds: unknown, padding?: unknown) => void;
      [key: string]: unknown;
    };
    Polyline: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
    Marker: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
    LatLngBounds: new () => { extend: (pt: unknown) => void };
    SymbolPath: { CIRCLE: number };
  };
};

function RouteMap({
  polyline,
  start,
  near,
  arrival,
  end,
  destination,
  playbackIndex = 0,
}: {
  polyline: [number, number][];
  start: { lat: number; lng: number } | null;
  near: { lat: number; lng: number } | null;
  arrival: { lat: number; lng: number } | null;
  end: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  playbackIndex?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const playbackMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const googleMapRef = useRef<unknown | null>(null);
  const googleOverlaysRef = useRef<Array<{ setMap: (map: unknown | null) => void }>>([]);
  const mapboxToken = useMemo(() => getMapboxPublicToken(), []);
  const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);
  const { effectiveProvider, hasGoogleMapsApiKey, hasMapboxToken } = useEffectiveMapProvider();

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const disposeGoogle = () => {
      googleOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
      googleOverlaysRef.current = [];
      googleMapRef.current = null;
    };

    const disposeMapbox = () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };

    if (effectiveProvider === 'google') {
      disposeMapbox();
      containerRef.current.innerHTML = '';

      if (!googleApiKey) {
        return () => {
          cancelled = true;
          disposeGoogle();
        };
      }

      loadGoogleMapsApi(googleApiKey)
        .then((raw) => {
          if (cancelled || !containerRef.current || !raw) {
            return;
          }
          const google = raw as RouteGoogleMaps;

          const center =
            polyline.length > 0
              ? { lat: polyline[Math.floor(polyline.length / 2)][1], lng: polyline[Math.floor(polyline.length / 2)][0] }
              : start
                ? { lat: start.lat, lng: start.lng }
                : { lat: getCountryFallbackViewport().center[1], lng: getCountryFallbackViewport().center[0] };

          const map = new google.maps.Map(containerRef.current, {
            center,
            zoom: 13,
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
          });

          googleMapRef.current = map;

          const overlays: Array<{ setMap: (map: unknown | null) => void }> = [];

          if (polyline.length >= 2) {
            const trail = new google.maps.Polyline({
              map,
              path: polyline.map((point) => ({ lat: point[1], lng: point[0] })),
              geodesic: true,
              strokeColor: '#3B82F6',
              strokeOpacity: 0.85,
              strokeWeight: 4,
            });
            overlays.push(trail);

            const bounds = new google.maps.LatLngBounds();
            polyline.forEach((point) => bounds.extend({ lat: point[1], lng: point[0] }));
            map.fitBounds(bounds, 40);
          }

          const addPoint = (
            point: { lat: number; lng: number } | null,
            fillColor: string,
            scale = 7,
          ) => {
            if (!point) return;
            const marker = new google.maps.Marker({
              map,
              position: point,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale,
                fillColor,
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2.5,
              },
            });
            overlays.push(marker);
          };

          addPoint(start, '#2563EB');
          addPoint(near, '#D97706');
          addPoint(arrival, '#16A34A');
          addPoint(end, '#334155');
          addPoint(destination, '#DC2626', 8);

          googleOverlaysRef.current = overlays;
        })
        .catch(() => {
          // Render fallback state in JSX when API key is missing/invalid.
        });

      return () => {
        cancelled = true;
        disposeGoogle();
      };
    }

    if (!mapboxToken) {
      return () => {
        cancelled = true;
        disposeMapbox();
      };
    }

    disposeGoogle();

    mapboxgl.accessToken = mapboxToken;

    const center: [number, number] =
      polyline.length > 0
        ? polyline[Math.floor(polyline.length / 2)]
        : start
          ? [start.lng, start.lat]
          : getCountryFallbackViewport().center;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center,
      zoom: 13,
      attributionControl: false,
      transformRequest: createMapboxTransformRequest(),
    });
    mapRef.current = map;

    map.on('load', () => {
      // Route polyline
      if (polyline.length >= 2) {
        map.addSource('route-history', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: polyline },
            properties: {},
          },
        });
        map.addLayer({
          id: 'route-history-line',
          type: 'line',
          source: 'route-history',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3B82F6', 'line-width': 3, 'line-opacity': 0.8 },
        });

        // Fit map to route bounds
        const bounds = polyline.reduce(
          (b, pt) => b.extend(pt as mapboxgl.LngLatLike),
          new mapboxgl.LngLatBounds(polyline[0], polyline[0])
        );
        map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      }

      // Start marker (origin)
      if (start) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:14px;height:14px;border-radius:50%;background:#2563EB;border:2.5px solid white;box-shadow:0 2px 6px rgba(37,99,235,0.5);';
        new mapboxgl.Marker({ element: el }).setLngLat([start.lng, start.lat]).addTo(map);
      }

      // Arrival marker
      if (arrival) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:14px;height:14px;border-radius:50%;background:#16A34A;border:2.5px solid white;box-shadow:0 2px 6px rgba(22,163,74,0.5);';
        new mapboxgl.Marker({ element: el }).setLngLat([arrival.lng, arrival.lat]).addTo(map);
      }

      // Near marker
      if (near) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:14px;height:14px;border-radius:50%;background:#D97706;border:2.5px solid white;box-shadow:0 2px 6px rgba(217,119,6,0.45);';
        new mapboxgl.Marker({ element: el }).setLngLat([near.lng, near.lat]).addTo(map);
      }

      // Completion marker
      if (end) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:14px;height:14px;border-radius:50%;background:#334155;border:2.5px solid white;box-shadow:0 2px 6px rgba(51,65,85,0.5);';
        new mapboxgl.Marker({ element: el }).setLngLat([end.lng, end.lat]).addTo(map);
      }

      // Destination marker
      if (destination) {
        const el = document.createElement('div');
        el.style.cssText =
          'width:16px;height:16px;border-radius:50%;background:#DC2626;border:3px solid white;box-shadow:0 2px 8px rgba(220,38,38,0.4);';
        new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([destination.lng, destination.lat])
          .addTo(map);
      }
    });

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      playbackMarkerRef.current = null;
    };
  }, [arrival, destination, effectiveProvider, end, googleApiKey, mapboxToken, near, polyline, start]);

  useEffect(() => {
    if (polyline.length === 0) return;
    const idx = Math.min(Math.max(playbackIndex, 0), polyline.length - 1);
    const point = polyline[idx];

    if (effectiveProvider === 'google') {
      const map = googleMapRef.current as { maps?: unknown } | null;
      void map;
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    if (!playbackMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:16px;height:16px;border-radius:50%;background:#0EA5E9;border:2.5px solid white;box-shadow:0 2px 6px rgba(14,165,233,0.5);';
      playbackMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(point)
        .addTo(map);
    } else {
      playbackMarkerRef.current.setLngLat(point);
    }
  }, [effectiveProvider, playbackIndex, polyline]);

  if (effectiveProvider === 'google' && !hasGoogleMapsApiKey) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#eef0f3] text-[12px] font-medium text-gray-500 px-4 text-center">
        Route map requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
      </div>
    );
  }

  if (effectiveProvider === 'mapbox' && !hasMapboxToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#eef0f3] text-[12px] font-medium text-gray-500 px-4 text-center">
        Route map requires NEXT_PUBLIC_MAPBOX_TOKEN.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}

interface RouteHistoryPanelProps {
  taskId: number;
  taskTitle: string;
  onClose: () => void;
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'In progress';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function RouteHistoryPanel({ taskId, taskTitle, onClose }: RouteHistoryPanelProps) {
  const providerState = useEffectiveMapProvider();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);

  const routeRole: 'agent' | 'management' =
    role && ['owner', 'admin', 'management', 'manager', 'supervisor'].includes(role.toLowerCase())
      ? 'management'
      : 'agent';

  const { data: route, isLoading, isError } = useTaskRoute(taskId, {
    company_id: companyId ?? 0,
    role: routeRole,
  });

  const polyline = (route?.polyline ?? []) as [number, number][];
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [prevRouteKey, setPrevRouteKey] = useState(`${taskId}:${polyline.length}`);
  const routeKey = `${taskId}:${polyline.length}`;
  if (routeKey !== prevRouteKey) {
    setPrevRouteKey(routeKey);
    setPlaybackIndex(0);
  }
  const start = route?.start
    ? { lat: route.start.latitude, lng: route.start.longitude }
    : null;
  const arrival = route?.arrival
    ? { lat: route.arrival.latitude, lng: route.arrival.longitude }
    : null;
  const near = route?.near
    ? { lat: route.near.latitude, lng: route.near.longitude }
    : null;
  const end = route?.end
    ? { lat: route.end.latitude, lng: route.end.longitude }
    : null;
  const destination = route?.destination
    ? { lat: route.destination.latitude, lng: route.destination.longitude }
    : null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold text-dash-dark truncate">{taskTitle}</h3>
          <p className="text-[11px] text-gray-400">Route history</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-all shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {/* Map */}
      <div className="h-56 shrink-0 bg-gray-100 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-dash-teal border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isLoading && route && (
          <RouteMap
            polyline={polyline}
            start={start}
            near={near}
            arrival={arrival}
            end={end}
            destination={destination}
            playbackIndex={playbackIndex}
          />
        )}
        {providerState.fallbackReason === 'missing_google_api_key' && providerState.requestedProvider === 'google' && (
          <div className="absolute bottom-2 left-2 right-2 rounded-md bg-black/75 px-2.5 py-1.5 text-[10px] font-medium text-white">
            Google map is selected by admin, but NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Showing Mapbox fallback.
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-gray-400">
            Failed to load route
          </div>
        )}
      </div>

      {route && polyline.length >= 2 && (
        <div className="px-3 py-2 border-b border-gray-100 shrink-0">
          <RoutePlaybackControls
            pointCount={polyline.length}
            index={playbackIndex}
            onIndexChange={setPlaybackIndex}
          />
        </div>
      )}

      {/* Stats */}
      {route && (
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 shrink-0">
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Points</p>
            <p className="text-[15px] font-bold text-dash-dark mt-0.5">
              {route.summary?.points_count ?? polyline.length}
            </p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Distance</p>
            <p className="text-[15px] font-bold text-dash-dark mt-0.5">
              {route.summary?.total_distance_meters != null
                ? route.summary.total_distance_meters >= 1000
                  ? `${(route.summary.total_distance_meters / 1000).toFixed(1)}km`
                  : `${Math.round(route.summary.total_distance_meters)}m`
                : '—'}
            </p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Duration</p>
            <p className="text-[15px] font-bold text-dash-dark mt-0.5">
              {route.start
                ? formatDuration(route.start.recorded_at, route.end?.recorded_at ?? null)
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {route && (
          <>
            {/* Start event */}
            {route.start && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Navigation size={14} className="text-green-500" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Task started</p>
                  <p className="text-[11px] text-gray-400">{formatTime(route.start.recorded_at)}</p>
                </div>
              </div>
            )}

            {/* Arrival event */}
            {route.arrival && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin size={14} className="text-green-600" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Arrived at destination</p>
                  <p className="text-[11px] text-gray-400">{formatTime(route.arrival.recorded_at)}</p>
                </div>
              </div>
            )}

            {/* Near-destination event */}
            {route.near && !route.arrival && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin size={14} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Near destination</p>
                  <p className="text-[11px] text-gray-400">{formatTime(route.near.recorded_at)}</p>
                </div>
              </div>
            )}

            {/* Completion event */}
            {route.end && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 size={14} className="text-dash-teal" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Task completed</p>
                  <p className="text-[11px] text-gray-400">{formatTime(route.end.recorded_at)}</p>
                </div>
              </div>
            )}

            {/* In-progress status */}
            {!route.end && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Route size={14} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Currently tracking</p>
                  <p className="text-[11px] text-gray-400">
                    {route.proximity?.state === 'near_destination'
                      ? 'Agent is near destination'
                      : 'Agent is en route'}
                  </p>
                </div>
              </div>
            )}

            {/* Map legend */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Legend</p>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-3 h-3 rounded-full bg-blue-600 shrink-0" />
                Start point
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-3 h-3 rounded-full bg-amber-600 shrink-0" />
                Near destination
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-3 h-3 rounded-full bg-green-600 shrink-0" />
                Arrival point
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-3 h-3 rounded-full bg-[#DC2626] shrink-0" />
                Destination
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-3 h-3 rounded-full bg-slate-700 shrink-0" />
                Completion point
              </div>
              <div className="flex items-center gap-2 text-[12px] text-gray-500">
                <span className="w-8 h-0.5 bg-blue-500 shrink-0 rounded-full" />
                Travel route
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
