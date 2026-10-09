"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import { format, parse, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  MapPin,
  Route,
  Users,
} from "lucide-react";
import { useJourneyDetail } from "@/hooks/use-field-journeys";
import { useEffectiveMapProvider } from "@/hooks/use-effective-map-provider";
import {
  createMapboxTransformRequest,
  getGoogleMapsPublicApiKey,
  getMapboxPublicToken,
} from "@/lib/config/public-env";
import { getCountryFallbackViewport } from "@/lib/map/default-viewport";
import { loadGoogleMapsApi } from "@/lib/map/google-loader";
import type { FieldStopDto, JourneyTimelineEvent } from "@/lib/api/field-activity";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import { RoutePlaybackControls } from "@/components/operations/route-playback-controls";
import {
  buildJourneysCsv,
  downloadTextFile,
} from "@/lib/tracking/export-journeys-csv";

const EVENT_COLORS: Record<string, string> = {
  green: "#22C55E",
  blue: "#3B82F6",
  orange: "#F97316",
  purple: "#A855F7",
  gray: "#9CA3AF",
  red: "#EF4444",
  teal: "#14B8A6",
};

function formatKm(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stopPopupHtml(args: {
  title: string;
  address: string | null;
  when: string | null;
  duration: string | null;
}): string {
  return `<div style="max-width:240px;padding:2px 0;font-family:system-ui,sans-serif">
    <div style="font-size:12px;font-weight:700;color:#0B1215">${escapeHtml(args.title)}</div>
    ${args.when ? `<div style="font-size:11px;color:#6B7280;margin-top:2px">${escapeHtml(args.when)}</div>` : ""}
    ${args.duration ? `<div style="font-size:11px;color:#6B7280">${escapeHtml(args.duration)}</div>` : ""}
    <div style="font-size:11px;color:#0B1215;margin-top:4px">${escapeHtml(args.address || "Address unavailable")}</div>
  </div>`;
}

function stopMarkerColor(classification: string | null | undefined): string {
  if (classification === "customer_visit" || classification === "lead_visit") return "#F97316";
  if (classification === "org_visit" || classification === "task") return "#3B82F6";
  if (classification === "meeting") return "#A855F7";
  if (classification === "personal") return "#14B8A6";
  if (classification === "ignore") return "#9CA3AF";
  return "#F97316";
}

function formatStopWindow(arrivedAt: string | null, departedAt: string | null): string | null {
  if (!arrivedAt) return null;
  const start = format(parseISO(arrivedAt), "h:mm a");
  if (!departedAt) return `Arrived ${start}`;
  return `${start} – ${format(parseISO(departedAt), "h:mm a")}`;
}

function createNumberedStopElement(index: number, color: string, selected: boolean): HTMLDivElement {
  const el = document.createElement("div");
  const size = selected ? 28 : 24;
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:9999px",
    `background:${color}`,
    "color:white",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font-size:11px",
    "font-weight:800",
    "border:2px solid white",
    "box-shadow:0 2px 8px rgba(15,23,42,0.28)",
    "cursor:pointer",
  ].join(";");
  el.textContent = String(index);
  return el;
}

function JourneyMap({
  coordinates,
  timeline,
  stops,
  selectedId,
  clockIn,
  clockOut,
  bounds,
  playbackIndex = null,
}: {
  coordinates: [number, number][];
  timeline: JourneyTimelineEvent[];
  stops: FieldStopDto[];
  selectedId: string | null;
  clockIn: { latitude: number; longitude: number } | null;
  clockOut: { latitude: number; longitude: number } | null;
  bounds: {
    min_lng: number;
    min_lat: number;
    max_lng: number;
    max_lat: number;
  } | null;
  playbackIndex?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const playbackMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const mapboxToken = useMemo(() => getMapboxPublicToken(), []);
  const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);
  const { effectiveProvider } = useEffectiveMapProvider();

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const clearMarkers = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };

    const dispose = () => {
      clearMarkers();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };

    if (effectiveProvider === "google" && googleApiKey) {
      dispose();
      containerRef.current.innerHTML = "";
      loadGoogleMapsApi(googleApiKey).then((raw) => {
        if (cancelled || !containerRef.current || !raw) return;
        const google = raw as {
          maps: {
            Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
              fitBounds: (b: unknown, padding?: unknown) => void;
            };
            Polyline: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
            Marker: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
            LatLngBounds: new () => { extend: (pt: unknown) => void };
            SymbolPath: { CIRCLE: number };
          };
        };

        const center =
          coordinates.length > 0
            ? {
                lat: coordinates[Math.floor(coordinates.length / 2)][1],
                lng: coordinates[Math.floor(coordinates.length / 2)][0],
              }
            : {
                lat: getCountryFallbackViewport().center[1],
                lng: getCountryFallbackViewport().center[0],
              };

        const map = new google.maps.Map(containerRef.current, {
          center,
          zoom: 12,
          disableDefaultUI: true,
          gestureHandling: "greedy",
        });

        if (coordinates.length > 1) {
          new google.maps.Polyline({
            path: coordinates.map(([lng, lat]) => ({ lat, lng })),
            strokeColor: "#3B82F6",
            strokeOpacity: 0.85,
            strokeWeight: 4,
            map,
          });
        }

        const gBounds = new google.maps.LatLngBounds();
        const InfoWindow = (google.maps as unknown as { InfoWindow: new (opts: Record<string, unknown>) => { setContent: (html: string) => void; open: (opts: unknown) => void; close: () => void } }).InfoWindow;
        const addDot = (
          lat: number,
          lng: number,
          color: string,
          selected: boolean,
          popupHtml?: string,
        ) => {
          const marker = new google.maps.Marker({
            position: { lat, lng },
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: selected ? 9 : 6,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            },
          });
          if (popupHtml) {
            const info = new InfoWindow({ content: popupHtml });
            (marker as unknown as { addListener: (ev: string, fn: () => void) => void }).addListener("mouseover", () => {
              info.open({ map, anchor: marker });
            });
            (marker as unknown as { addListener: (ev: string, fn: () => void) => void }).addListener("mouseout", () => {
              info.close();
            });
          }
          gBounds.extend({ lat, lng });
        };

        if (clockIn) addDot(clockIn.latitude, clockIn.longitude, "#22C55E", false);
        if (clockOut) addDot(clockOut.latitude, clockOut.longitude, "#EF4444", false);

        timeline.forEach((event) => {
          if (event.latitude == null || event.longitude == null) return;
          if (event.type === "travel" || event.stop_id != null) return;
          addDot(
            event.latitude,
            event.longitude,
            EVENT_COLORS[event.color] ?? "#9CA3AF",
            event.id === selectedId,
          );
        });

        stops.forEach((stop, index) => {
          addDot(
            stop.latitude,
            stop.longitude,
            stopMarkerColor(stop.classification),
            selectedId === `stop_${stop.id}`,
            stopPopupHtml({
              title: `Stop ${index + 1}`,
              address: stop.address,
              when: formatStopWindow(stop.arrived_at, stop.departed_at),
              duration: stop.duration_seconds > 0 ? formatDuration(stop.duration_seconds) : null,
            }),
          );
        });

        coordinates.forEach(([lng, lat]) => gBounds.extend({ lat, lng }));
        if (bounds) {
          gBounds.extend({ lat: bounds.min_lat, lng: bounds.min_lng });
          gBounds.extend({ lat: bounds.max_lat, lng: bounds.max_lng });
        }
        map.fitBounds(gBounds, 48);
      });

      return () => {
        cancelled = true;
        dispose();
      };
    }

    if (!mapboxToken) return;
    dispose();
    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: getCountryFallbackViewport().center,
      zoom: 11,
      transformRequest: createMapboxTransformRequest(),
    });
    mapRef.current = map;

    map.on("load", () => {
      if (coordinates.length > 1) {
        map.addSource("journey-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates },
          },
        });
        map.addLayer({
          id: "journey-route-line",
          type: "line",
          source: "journey-route",
          paint: {
            "line-color": "#3B82F6",
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });
      }

      const addMarker = (
        lng: number,
        lat: number,
        color: string,
        selected: boolean,
        popupHtml?: string,
        element?: HTMLElement,
      ) => {
        const el = element ?? document.createElement("div");
        if (!element) {
          el.style.width = selected ? "16px" : "12px";
          el.style.height = selected ? "16px" : "12px";
          el.style.borderRadius = "9999px";
          el.style.background = color;
          el.style.border = "2px solid white";
          el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";
        }
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        if (popupHtml) {
          const popup = new mapboxgl.Popup({
            offset: 14,
            closeButton: false,
            closeOnClick: false,
          }).setHTML(popupHtml);
          marker.setPopup(popup);
          el.addEventListener("mouseenter", () => marker.togglePopup());
          el.addEventListener("mouseleave", () => {
            if (marker.getPopup()?.isOpen()) marker.togglePopup();
          });
        }
        markersRef.current.push(marker);
      };

      if (clockIn) addMarker(clockIn.longitude, clockIn.latitude, "#22C55E", false);
      if (clockOut) addMarker(clockOut.longitude, clockOut.latitude, "#EF4444", false);

      timeline.forEach((event) => {
        if (event.latitude == null || event.longitude == null) return;
        if (event.type === "travel" || event.stop_id != null) return;
        addMarker(
          event.longitude,
          event.latitude,
          EVENT_COLORS[event.color] ?? "#9CA3AF",
          event.id === selectedId,
        );
      });

      stops.forEach((stop, index) => {
        const color = stopMarkerColor(stop.classification);
        addMarker(
          stop.longitude,
          stop.latitude,
          color,
          selectedId === `stop_${stop.id}`,
          stopPopupHtml({
            title: `Stop ${index + 1}`,
            address: stop.address,
            when: formatStopWindow(stop.arrived_at, stop.departed_at),
            duration: stop.duration_seconds > 0 ? formatDuration(stop.duration_seconds) : null,
          }),
          createNumberedStopElement(index + 1, color, selectedId === `stop_${stop.id}`),
        );
      });

      if (bounds) {
        map.fitBounds(
          [
            [bounds.min_lng, bounds.min_lat],
            [bounds.max_lng, bounds.max_lat],
          ],
          { padding: 56, maxZoom: 15 },
        );
      } else if (coordinates.length > 0) {
        const lngs = coordinates.map((c) => c[0]);
        const lats = coordinates.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 56, maxZoom: 15 },
        );
      }
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [
    bounds,
    clockIn,
    clockOut,
    coordinates,
    effectiveProvider,
    googleApiKey,
    mapboxToken,
    selectedId,
    stops,
    timeline,
  ]);

  // Keep playback marker in sync without remounting the map.
  useEffect(() => {
    if (playbackIndex == null || coordinates.length === 0) {
      playbackMarkerRef.current?.remove();
      playbackMarkerRef.current = null;
      return;
    }

    const idx = Math.min(Math.max(playbackIndex, 0), coordinates.length - 1);
    const [lng, lat] = coordinates[idx];

    if (effectiveProvider === "google") {
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    if (!playbackMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:18px;height:18px;border-radius:9999px;background:#0EA5E9;border:3px solid white;box-shadow:0 2px 8px rgba(14,165,233,0.55);";
      playbackMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      playbackMarkerRef.current.setLngLat([lng, lat]);
    }
  }, [coordinates, effectiveProvider, playbackIndex]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl overflow-hidden bg-[#e8ecef]" />;
}

type JourneyViewProps = {
  sessionId: string;
  asAgent?: boolean;
  backHref?: string;
  journeyBasePath?: string;
};

export function JourneyView({
  sessionId,
  asAgent = false,
  backHref = "/operations",
  journeyBasePath = "/operations/journeys",
}: JourneyViewProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const companyId = getActiveCompanyContext(user)?.apiCompanyId ?? undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState(0);

  const { data, isLoading, isError } = useJourneyDetail(sessionId, {
    company_id: companyId,
    asAgent,
  });

  const journey = data?.journey;
  const stats = data?.stats;
  const timeline = data?.timeline ?? [];
  const stops = data?.stops ?? [];
  const route = data?.route;
  const navigation = data?.navigation;
  const coordinates = (route?.coordinates ?? []) as [number, number][];

  const [prevJourneyKey, setPrevJourneyKey] = useState(`${sessionId}:${coordinates.length}`);
  const journeyKey = `${sessionId}:${coordinates.length}`;
  if (journeyKey !== prevJourneyKey) {
    setPrevJourneyKey(journeyKey);
    setPlaybackIndex(0);
  }

  const selectedEvent = timeline.find((e) => e.id === selectedId) ?? null;

  const handleExportDay = () => {
    if (!journey) return;
    const csv = buildJourneysCsv([journey], data?.agent?.name ?? undefined);
    downloadTextFile(`journey-${journey.id}-${journey.date ?? "day"}.csv`, csv);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F4F6F7] flex flex-col">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={backHref}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft size={18} className="text-[#0B1215]" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Daily Journey
              </p>
              <h1 className="text-[18px] font-black text-[#0B1215] truncate">
                {data?.agent?.name ?? "Agent"}
                {journey?.date ? (
                  <span className="text-gray-400 font-bold">
                    {" "}
                    · {format(parse(journey.date, "yyyy-MM-dd", new Date()), "EEE, MMM d yyyy")}
                  </span>
                ) : null}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportDay}
              disabled={!journey}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#0B1215] disabled:opacity-40"
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              type="button"
              disabled={!navigation?.previous_id}
              onClick={() =>
                navigation?.previous_id &&
                router.push(`${journeyBasePath}/${navigation.previous_id}`)
              }
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#0B1215] disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Previous Day
            </button>
            <button
              type="button"
              disabled={!navigation?.next_id}
              onClick={() =>
                navigation?.next_id &&
                router.push(`${journeyBasePath}/${navigation.next_id}`)
              }
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#0B1215] disabled:opacity-40"
            >
              Next Day
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-gray-300" size={28} />
        </div>
      ) : isError || !data ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8">
          <Route className="text-gray-300" size={32} />
          <p className="text-sm text-gray-500 font-medium">Unable to load this journey.</p>
          <Link href={backHref} className="text-[12px] font-bold text-[#2F5E71]">
            Back to Workforce
          </Link>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_260px] gap-3 p-3 sm:p-4 min-h-0">
          {/* Timeline */}
          <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col max-h-[42vh] xl:max-h-none">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Timeline
              </p>
              <p className="text-[13px] font-bold text-[#0B1215] mt-0.5">
                {timeline.length} events
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {timeline.map((event) => {
                const time = event.occurred_at
                  ? format(parseISO(event.occurred_at), "h:mm a")
                  : "—";
                const active = selectedId === event.id;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedId(event.id)}
                    className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                      active ? "bg-[#EEF4F4]" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background: EVENT_COLORS[event.color] ?? "#9CA3AF",
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-gray-400">{time}</p>
                        <p className="text-[12px] font-bold text-[#0B1215] truncate">
                          {event.label}
                        </p>
                        {event.duration_seconds != null && event.duration_seconds > 0 && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {formatDuration(event.duration_seconds)}
                          </p>
                        )}
                        {event.address ? (
                          <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                            {event.address}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Map */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[320px] xl:min-h-0 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Route
                </p>
                <p className="text-[13px] font-bold text-[#0B1215]">
                  {formatKm(stats?.distance_meters ?? 0)} travelled
                </p>
              </div>
              {selectedEvent && (
                <div className="text-right max-w-[50%]">
                  <p className="text-[10px] font-bold text-gray-400 truncate">
                    Selected
                  </p>
                  <p className="text-[12px] font-bold text-[#0B1215] truncate">
                    {selectedEvent.label}
                  </p>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-[280px] p-2 flex flex-col gap-2">
              {route && (route.raw_point_count ?? 0) === 0 ? (
                <div className="h-full w-full rounded-2xl border border-dashed border-gray-200 bg-[#F8F9FA] flex flex-col items-center justify-center gap-2">
                  <Route className="text-gray-300" size={26} />
                  <p className="text-[12px] font-semibold text-gray-500">
                    Session was recorded, but no route points were captured.
                  </p>
                  <p className="text-[11px] text-gray-400 text-center max-w-[320px]">
                    This usually means background location collection was interrupted for that day.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-[240px]">
                    <JourneyMap
                      coordinates={coordinates}
                      timeline={timeline}
                      stops={stops}
                      selectedId={selectedId}
                      clockIn={route?.clock_in ?? null}
                      clockOut={route?.clock_out ?? null}
                      bounds={route?.bounds ?? null}
                      playbackIndex={playbackIndex}
                    />
                  </div>
                  <RoutePlaybackControls
                    pointCount={coordinates.length}
                    index={playbackIndex}
                    onIndexChange={setPlaybackIndex}
                  />
                </>
              )}
            </div>
          </section>

          {/* Stats */}
          <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Journey Stats
              </p>
              <p className="text-[13px] font-bold text-[#0B1215] mt-0.5">
                Day summary
              </p>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              {stops.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Stops
                  </p>
                  {stops.map((stop, index) => {
                    const active = selectedId === `stop_${stop.id}`;
                    return (
                      <button
                        key={stop.id}
                        type="button"
                        onClick={() => setSelectedId(`stop_${stop.id}`)}
                        className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors ${
                          active
                            ? "border-[#F97316]/40 bg-orange-50"
                            : "border-gray-100 bg-[#F8F9FA] hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                            style={{ background: stopMarkerColor(stop.classification) }}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-[#0B1215] truncate">
                              {stop.address || `Stop ${index + 1}`}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {formatStopWindow(stop.arrived_at, stop.departed_at) ?? "Time unavailable"}
                              {stop.duration_seconds > 0
                                ? ` · ${formatDuration(stop.duration_seconds)}`
                                : ""}
                            </p>
                            <p className="text-[10px] text-gray-400 capitalize mt-0.5">
                              {(stop.classification ?? "pending").replaceAll("_", " ")}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {[
                {
                  icon: Route,
                  label: "Distance",
                  value: formatKm(stats?.distance_meters ?? 0),
                },
                {
                  icon: Clock,
                  label: "Travel time",
                  value: formatDuration(stats?.travel_seconds ?? 0),
                },
                {
                  icon: Clock,
                  label: "Active time",
                  value: formatDuration(stats?.active_seconds ?? 0),
                },
                {
                  icon: MapPin,
                  label: "Stops",
                  value: String(stats?.stop_count ?? 0),
                },
                {
                  icon: Users,
                  label: "Customer visits",
                  value: String(stats?.visit_count ?? 0),
                },
                {
                  icon: MapPin,
                  label: "Unknown stops",
                  value: String(stats?.unknown_stop_count ?? 0),
                },
                {
                  icon: Clock,
                  label: "Tasks",
                  value: String(stats?.task_count ?? 0),
                },
                {
                  icon: Users,
                  label: "Meetings",
                  value: String(stats?.meeting_count ?? 0),
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[#F8F9FA] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <row.icon size={13} className="text-gray-400 shrink-0" />
                    <span className="text-[11px] font-medium text-gray-500">
                      {row.label}
                    </span>
                  </div>
                  <span className="text-[12px] font-bold text-[#0B1215]">{row.value}</span>
                </div>
              ))}

              <div className="rounded-xl border border-gray-100 px-3 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Travel efficiency</span>
                  <span className="text-[12px] font-bold text-[#0B1215]">
                    {stats?.travel_efficiency != null
                      ? `${Math.round(stats.travel_efficiency * 100)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Productivity</span>
                  <span className="text-[12px] font-bold text-[#0B1215]">
                    {stats?.productivity_score ?? 0}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Avg speed</span>
                  <span className="text-[12px] font-bold text-[#0B1215]">
                    {stats?.average_speed_kmh != null
                      ? `${stats.average_speed_kmh} km/h`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Max speed</span>
                  <span className="text-[12px] font-bold text-[#0B1215]">
                    {stats?.maximum_speed_kmh != null
                      ? `${stats.maximum_speed_kmh} km/h`
                      : "—"}
                  </span>
                </div>
              </div>

              {stats?.narrative && (
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {stats.narrative}
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
