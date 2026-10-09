'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import { Search, Eye, EyeOff, RefreshCcw, LocateFixed, X } from 'lucide-react';
import {
  getGoogleMapsPublicApiKey,
  MAPBOX_PUBLIC_TOKEN_ENV,
  createMapboxTransformRequest,
  getMapboxPublicToken,
} from '@/lib/config/public-env';
import { useEffectiveMapProvider, type EffectiveMapProviderState } from '@/hooks/use-effective-map-provider';
import { loadGoogleMapsApi } from '@/lib/map/google-loader';
import { useTrackingStore } from '@/store/tracking';
import { RouteHistoryPanel } from '@/components/map/RouteHistoryPanel';
import type { LiveTaskState } from '@/types/tracking';
import {
  areSamePoint,
  buildTaskTrail,
  createAgentMarkerElement,
  createPulseMarkerElement,
  createStaticMarkerElement,
  getAgentInitials,
  resolveVisualTaskState,
  sanitizePolyline,
  updateAgentMarkerElement,
  updateAgentMarkerHeading,
  VISUAL_PALETTE,
  type VisualTaskState,
} from '@/lib/tracking/map-visualization';
import {
  MAX_PREDICTION_MS,
  projectPosition,
  resolveHeading,
} from '@/lib/tracking/dead-reckoning';
import { fetchDirectionsRoute, clearDirectionsCache } from '@/lib/tracking/directions';
import { fetchMapMatchingRoute } from '@/lib/tracking/map-matching';
import {
  createMarkerMotion,
  enqueueMarkerFix,
  isMarkerMotionComplete,
  sampleMarkerPosition,
  type MarkerMotionState,
} from '@/lib/tracking/marker-motion';
import {
  getMapboxNavigationStyle,
  resolveMapAppearance,
  type MapAppearance,
} from '@/lib/map/style-mode';
import {
  OPERATIONAL_STATUS_META,
  resolveOperationalStatusFromTask,
} from '@/lib/tracking/operational-status';
import {
  hasUsableTaskPosition,
  isLiveTaskStale,
  resolveMapTasks,
  resolvePreferredMapTasks,
  resolveTrajectoryTaskIds,
  countLiveTasksByAgent,
  splitLiveFeedTasks,
  TRACKING_STALE_MS,
} from '@/lib/tracking/live-feed-groups';
import { circleFeatureCollection } from '@/lib/map/circle-geojson';
import {
  createLiveAgentClusterElement,
  LIVE_AGENT_CLUSTER_MIN,
  shouldClusterLiveAgents,
} from '@/lib/map/live-agent-cluster';
import Supercluster from 'supercluster';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { LiveFeedsPanel } from '@/components/map/live-feeds-panel';
import { AgentAvatar } from '@/components/map/agent-avatar';
import { useInitialMapViewport } from '@/hooks/use-initial-map-viewport';
import { TrackingConnectionStatus } from '@/components/tracking/TrackingConnectionStatus';
import { SavedLocationsLayer, type GoogleMapBridge } from '@/components/map/SavedLocationsLayer';
import { TerritoryLayer } from '@/components/map/TerritoryLayer';
import { useInfiniteSavedLocations, useSavedLocationPermissions } from '@/hooks/use-saved-locations';
import { useViewerCoords } from '@/hooks/use-viewer-coords';
import { getSavedLocationLabel } from '@/lib/map/location-types';
import type { SavedLocation } from '@/lib/api/saved-locations';
import { LocationSearchInput } from '@/components/map/LocationSearchInput';
import { BusinessListPanel } from '@/components/map/BusinessListPanel';
import { ClockedInLayer } from '@/components/map/ClockedInLayer';
import { ClockedInPanel } from '@/components/map/ClockedInPanel';
import { FieldActivityLiveLayer } from '@/components/map/FieldActivityLiveLayer';
import { useAttendanceMapSnapshots } from '@/hooks/use-attendance-map';
import { useFieldActivityLiveHydrate } from '@/hooks/use-field-activity-live';
import { useAttendanceMapStore } from '@/store/attendance-map';
import { useFieldActivityLiveStore } from '@/store/field-activity-live';
import type { AttendanceMapSnapshotItem } from '@/lib/api/attendance';
import { isInsideLocationContext, type LocationContext } from '@/lib/map/location-search';
import {
  isBboxTooLarge,
  type PoiResult,
} from '@/lib/map/overpass-search';
import { GooglePoiMapLayer } from '@/components/map/GooglePoiMapLayer';
import { SearchFocusLayer } from '@/components/map/SearchFocusLayer';
import { PoiDetailCard } from '@/components/map/PoiDetailCard';
import { resolvePoiForSearchSelection, inferIsBusiness } from '@/lib/map/poi-display';
import { useGooglePoiViewport } from '@/hooks/use-google-poi-viewport';
import { useMapPoiDisplay } from '@/hooks/use-map-poi-display';
import { fetchPlacesInArea } from '@/lib/map/poi-search';
import { parseTaskMapParams } from '@/lib/tasks/map-navigation';
import {
  createSearchSessionToken,
  retrievePlace,
  suggestPlaces,
  type PlaceSuggestion,
  type RetrievedPlace,
} from '@/lib/utils/place-search';
import { placeAttributionLabel } from '@/lib/utils/place-attribution';
import {
  fetchRecentPlaces,
  getLocalRecentPlaces,
  recentToSuggestionLike,
  rememberRecentPlace,
  type RecentPlace,
} from '@/lib/map/recent-places';

type MapLeftTab = 'feeds' | 'clocked-in' | 'businesses';
const STALE_MS = TRACKING_STALE_MS;
const MARKER_ANIMATION_MS = 700;
const SEARCH_DEBOUNCE_MS = 280;

type GoogleLatLng = { lat: number; lng: number };

type GoogleLatLngBoundsLike = {
  extend: (point: GoogleLatLng) => void;
};

type GoogleMapLike = {
  setCenter: (point: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
  panTo: (point: GoogleLatLng) => void;
  getZoom: () => number;
  fitBounds: (bounds: GoogleLatLngBoundsLike, padding?: number) => void;
};

type GooglePolylineLike = {
  setMap: (map: GoogleMapLike | null) => void;
  setPath: (path: GoogleLatLng[]) => void;
  setOptions: (options: Record<string, unknown>) => void;
};

type GoogleMarkerLike = {
  setMap: (map: GoogleMapLike | null) => void;
  setPosition: (point: GoogleLatLng) => void;
  setIcon: (icon: Record<string, unknown>) => void;
  setLabel: (label: Record<string, unknown>) => void;
  addListener: (event: string, handler: () => void) => void;
};

type GoogleOverlayLike = {
  setMap: (map: GoogleMapLike | null) => void;
};

type GoogleMarkerClustererOptions = ConstructorParameters<typeof MarkerClusterer>[0];

type GoogleMapsNamespaceLike = {
  maps: {
    Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapLike;
    Marker: new (options: Record<string, unknown>) => GoogleMarkerLike;
    Polyline: new (options: Record<string, unknown>) => GooglePolylineLike;
    Circle: new (options: Record<string, unknown>) => {
      setMap: (map: GoogleMapLike | null) => void;
      setCenter: (point: GoogleLatLng) => void;
      setRadius: (radius: number) => void;
      setOptions: (options: Record<string, unknown>) => void;
    };
    LatLngBounds: new () => GoogleLatLngBoundsLike;
    SymbolPath: {
      CIRCLE: unknown;
    };
    event: {
      addListener: (target: unknown, event: string, handler: () => void) => unknown;
      removeListener: (listener: unknown) => void;
    };
  };
};

function getStatusLabel(status: LiveTaskState['status']): string {
  if (status === 'near_destination') return 'Near destination';
  if (status === 'arrived') return 'Arrived';
  if (status === 'completed') return 'Completed';
  return 'On field';
}

function getPresentStatusLabel(status: LiveTaskState['status']): string {
  if (status === 'near_destination') return 'Near Destination';
  if (status === 'arrived') return 'Arrived On Site';
  if (status === 'completed') return 'Completed';
  return 'Presently On Field';
}

function formatMetricDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) return '--';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatSpeed(speedMps: number | null | undefined): string {
  if (speedMps == null || Number.isNaN(speedMps)) return '--';
  return `${(speedMps * 3.6).toFixed(1)} km/h`;
}

function formatEta(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || etaSeconds < 0) return '--';
  if (etaSeconds < 60) return '<1 min';
  const minutes = Math.round(etaSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildDestinationPopupHtml(params: { title: string; location: string; statusLabel: string }): string {
  const title = escapeHtml(params.title || 'Destination');
  const location = escapeHtml(params.location || 'No location details');
  const statusLabel = escapeHtml(params.statusLabel || 'Destination');

  return `
    <div style="min-width:220px; max-width:300px; padding:12px 14px; border-radius:18px; background:rgba(255,255,255,0.96); border:1px solid rgba(148,163,184,0.18); box-shadow:0 18px 48px rgba(15,23,42,0.16); backdrop-filter:blur(18px); font-family:ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="font-size:14px; font-weight:700; color:#0F172A; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${title}</div>
      <div style="margin-top:5px; font-size:12px; line-height:1.45; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${location}</div>
      <div style="margin-top:6px; font-size:11px; font-weight:700; letter-spacing:0.02em; text-transform:uppercase; color:#DC2626;">${statusLabel}</div>
    </div>
  `;
}

function buildSelectedAgentPopupHtml(params: { name: string; avatarUrl?: string; location: string; statusLabel: string }): string {
  const name = escapeHtml(params.name || 'Agent');
  const location = escapeHtml(params.location || 'No location details');
  const statusLabel = escapeHtml(params.statusLabel || 'Presently On Field');
  const initials = escapeHtml(getAgentInitials(params.name) ?? '');
  const avatarUrl = params.avatarUrl ? escapeHtml(params.avatarUrl) : '';

  return `
    <div style="width:140px; padding:15px 13px; border-radius:16px; background:#ffffff; border:0.5px solid rgba(226,232,240,0.88); box-shadow:0 12px 27px rgba(15,23,42,0.24); font-family:ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; position:relative;">
     
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <a href="/operations/agents" style="font-size:8px; line-height:1; font-weight:700; color:#1F2933; text-decoration:underline; text-underline-offset:1.5px; letter-spacing:-0.01em;">View Full Profile</a>
         <button type="button" data-popup-close="selected-agent" aria-label="Close popup" style="position:absolute; top:12px; right:8px; color:#0F2530; display:flex; align-items:center; justify-content:center; width:12px; height:12px; padding:0; border:0; background:transparent; cursor:pointer;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
      </button>
      </div>

      <div style="margin-top:5px; display:flex; justify-content:center;">
        <div style="width:50px; height:50px; border-radius:9999px; padding:2.5px; background:linear-gradient(180deg, rgba(207,218,218,0.75), rgba(83,128,128,0.95));">
          <div style="width:100%; height:100%; border-radius:9999px; overflow:hidden; background:#F1FAF7; display:flex; align-items:center; justify-content:center;">
            ${avatarUrl ? `<img src="${avatarUrl}" alt="${name} avatar" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` : ''}
            <div style="width:100%; height:100%; display:${avatarUrl ? 'none' : 'flex'}; align-items:center; justify-content:center; font-size:21px; font-weight:800; color:#10232D; background:linear-gradient(135deg, #E2E8F0, #F8FAFC);">${initials || '•'}</div>
          </div>
        </div>
      </div>

      <div style="margin-top:12px; text-align:center;">
        <div style="font-size:13px; font-weight:800; color:#112631; line-height:1.12; letter-spacing:-0.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
        <div style="margin-top:1.5px; font-size:9.5px; color:#112631; line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${location}</div>
      </div>

      <div style="margin-top:9px; display:flex; justify-content:center;">
        <span style="display:inline-flex; min-width:95px; min-height:25px; align-items:center; justify-content:center; padding:0 11px; border-radius:8.5px; background:#6FE0B0; color:#0B2B31; font-size:6px; line-height:1; font-weight:500;">${statusLabel}</span>
      </div>
    </div>
  `;
}

function getDestinationMarkerKind(status: LiveTaskState['status']): 'destination' | 'near' | 'arrived' | 'completed' {
  if (status === 'completed') return 'completed';
  if (status === 'near_destination') return 'near';
  if (status === 'arrived') return 'arrived';
  return 'destination';
}

function getVisualState(task: LiveTaskState, stale: boolean): VisualTaskState {
  return resolveVisualTaskState(task.status, stale, task.operationalStatus);
}

function createUserLocationIndicatorElement() {
  const root = document.createElement('div');
  root.style.position = 'relative';
  root.style.width = '18px';
  root.style.height = '18px';
  root.style.borderRadius = '9999px';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.pointerEvents = 'none';

  root.innerHTML = `
    <div style="position:absolute; width:40px; height:40px; border-radius:9999px; background:rgba(37,99,235,0.2); animation:dashboard-user-pulse 1.8s ease-out infinite;"></div>
    <div style="position:absolute; width:24px; height:24px; border-radius:9999px; background:rgba(59,130,246,0.35);"></div>
    <div style="position:relative; width:18px; height:18px; border-radius:9999px; background:#2563EB; border:3px solid #FFFFFF; box-shadow:0 4px 14px rgba(37,99,235,0.4);"></div>
    <style>
      @keyframes dashboard-user-pulse {
        0% { transform: scale(0.7); opacity: .8; }
        100% { transform: scale(1.35); opacity: 0; }
      }
    </style>
  `;

  return root;
}

interface MapViewProps {
  compact?: boolean;
}

export function MapboxMapView({ compact = false, providerState }: MapViewProps & { providerState: EffectiveMapProviderState }) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const initialAgentId = Number.parseInt(searchParams.get('agent') ?? '', 10);
  const taskFocus = useMemo(
    () => parseTaskMapParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const taskFocusMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const taskFocusSelectedRef = useRef(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const originMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const destinationMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const agentMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const agentMarkerUserIdRef = useRef<Map<number, number>>(new Map());
  const agentClusterMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const markerAnimationsRef = useRef<Map<number, number>>(new Map());
  const markerPositionRef = useRef<Map<number, [number, number]>>(new Map());
  const markerMotionRef = useRef<Map<number, MarkerMotionState>>(new Map());
  const queuedTargetRef = useRef<Map<number, string>>(new Map());
  const motionRafRef = useRef(0);
  const snappedTrailsRef = useRef<Map<number, [number, number][]>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const pulseMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const userLocationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const locateMePinRef = useRef<mapboxgl.Marker | null>(null);
  const directionRoutesRef = useRef<Map<number, [number, number][]>>(new Map());
  const [mapZoom, setMapZoom] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [leftSearchQuery, setLeftSearchQuery] = useState('');
  const [appearance, setAppearance] = useState<MapAppearance>(() => resolveMapAppearance());
  const [placeResults, setPlaceResults] = useState<PlaceSuggestion[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<RecentPlace[]>([]);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [placeResolving, setPlaceResolving] = useState(false);
  const searchSessionTokenRef = useRef<string>(createSearchSessionToken());
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [followAllActive, setFollowAllActive] = useState(false);
  const [showHistoryFeeds, setShowHistoryFeeds] = useState(false);
  const followAllLastFitRef = useRef(0);
  // Camera follow mode: keeps tracking the selected agent until the user pans away.
  const [isFollowing, setIsFollowing] = useState(false);
  const isFollowingRef = useRef(false);
  const suppressFollowBreakRef = useRef(false);
  const [historyTask, setHistoryTask] = useState<{ id: number; title: string } | null>(null);
  // Bumped every 30s to re-evaluate stale status and sync markers
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Flips true after map 'load' fires so the sync effect knows the map is ready
  const [mapVersion, setMapVersion] = useState(0);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [isInitialHydrating, setIsInitialHydrating] = useState(false);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [focusLocation, setFocusLocation] = useState<SavedLocation | null>(null);
  const [locationCtx, setLocationCtx] = useState<LocationContext | null>(null);
  const [leftTab, setLeftTab] = useState<MapLeftTab>(
    initialTab === 'clocked-in' ? 'clocked-in' : initialTab === 'businesses' ? 'businesses' : 'feeds'
  );
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');
  const [showBusinessPins, setShowBusinessPins] = useState(true);
  const [showGooglePois, setShowGooglePois] = useState(true);
  const [locating, setLocating] = useState(false);
  const [debouncedLeftSearch, setDebouncedLeftSearch] = useState('');
  const [debouncedMapSearch, setDebouncedMapSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedLeftSearch(leftSearchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [leftSearchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedMapSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const businessesSearchQ =
    leftTab === 'businesses' && debouncedLeftSearch.length > 0 ? debouncedLeftSearch : undefined;

  const viewerCoords = useViewerCoords();
  const nearLat = viewerCoords?.latitude;
  const nearLng = viewerCoords?.longitude;

  const {
    items: infiniteSavedLocations,
    total: savedLocationsTotal,
    isLoading: savedLocationsLoading,
    hasNextPage: hasNextSavedPage,
    isFetchingNextPage: isFetchingNextSavedPage,
    fetchNextPage: fetchNextSavedPage,
  } = useInfiniteSavedLocations({
    q: businessesSearchQ,
    near_lat: nearLat,
    near_lng: nearLng,
    enabled: leftTab === 'businesses',
  });

  // Lightweight page for map-bar saved-location suggestions (server search).
  const { items: mapSearchSavedHits = [] } = useInfiniteSavedLocations({
    q: debouncedMapSearch.length >= 2 ? debouncedMapSearch : undefined,
    near_lat: nearLat,
    near_lng: nearLng,
    per_page: 8,
    enabled: debouncedMapSearch.length >= 2,
  });

  const savedLocations = infiniteSavedLocations;
  const savedLocationPermissions = useSavedLocationPermissions();
  const { isLoading: clockedInLoading } = useAttendanceMapSnapshots({}, { scope: 'management' });
  useFieldActivityLiveHydrate(!compact);
  const fieldLiveAgentsMap = useFieldActivityLiveStore((s) => s.agents);
  const fieldLiveAgents = useMemo(() => Object.values(fieldLiveAgentsMap), [fieldLiveAgentsMap]);
  const fieldFollowUserId = useFieldActivityLiveStore((s) => s.followUserId);
  const fieldFollowAll = useFieldActivityLiveStore((s) => s.followAll);
  const fieldFocusMode = useFieldActivityLiveStore((s) => s.focusMode);
  const setFieldFollowUserId = useFieldActivityLiveStore((s) => s.setFollowUserId);
  const setFieldFollowAll = useFieldActivityLiveStore((s) => s.setFollowAll);
  const setFieldFocusMode = useFieldActivityLiveStore((s) => s.setFocusMode);
  const fieldFollowAllLastFitRef = useRef(0);
  const clockedInItemMap = useAttendanceMapStore((s) => s.items);
  const clockedInItems = useMemo(() => Object.values(clockedInItemMap), [clockedInItemMap]);
  const selectedClockedInUserId = useAttendanceMapStore((s) => s.selectedUserId);
  const setSelectedClockedInUserId = useAttendanceMapStore((s) => s.setSelectedUserId);

  const handleClockedInSelect = useCallback((item: AttendanceMapSnapshotItem) => {
    setSelectedClockedInUserId(item.user_id);
    const live = useFieldActivityLiveStore.getState().agents[item.user_id];
    const center = live?.lastPosition
      ? live.lastPosition
      : ([item.longitude, item.latitude] as [number, number]);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center, zoom: Math.max(map.getZoom(), 14), speed: 1.2 });
  }, [setSelectedClockedInUserId]);

  const highlightedClockedInUserId =
    selectedClockedInUserId ??
    (Number.isFinite(initialAgentId) ? initialAgentId : null);

  const filteredBusinesses = useMemo(() => {
    if (!locationCtx) return savedLocations;
    return savedLocations.filter((loc) => isInsideLocationContext(loc, locationCtx));
  }, [savedLocations, locationCtx]);

  const filteredBusinessIds = useMemo(() => {
    // When an area context is active, restrict markers — but never hide the focused pin.
    if (!locationCtx) return null;
    const ids = new Set(filteredBusinesses.map((b) => b.id));
    if (focusLocation) ids.add(focusLocation.id);
    return ids;
  }, [locationCtx, filteredBusinesses, focusLocation]);

  const liveTasks = useTrackingStore((s) => s.liveTasks);

  const tasks = useMemo(() => Object.values(liveTasks), [liveTasks]);
  const feedGroups = useMemo(
    () => splitLiveFeedTasks(tasks, nowMs, STALE_MS),
    [tasks, nowMs],
  );
  const mapTasks = useMemo(() => {
    const base = resolveMapTasks(feedGroups.active, feedGroups.history, selectedTaskId);
    return resolvePreferredMapTasks(base, selectedTaskId);
  }, [feedGroups.active, feedGroups.history, selectedTaskId]);
  const agentTaskCounts = useMemo(() => countLiveTasksByAgent(tasks), [tasks]);
  const trajectoryTaskIds = useMemo(
    () => resolveTrajectoryTaskIds(feedGroups.active, selectedTaskId, followAllActive),
    [feedGroups.active, selectedTaskId, followAllActive],
  );
  const followedTask = selectedTaskId != null ? liveTasks[selectedTaskId] ?? null : null;
  const hasActiveTaskPositions = useMemo(
    () => tasks.some((task) => hasUsableTaskPosition(task)),
    [tasks]
  );
  const preferUserLocation = !taskFocus;
  const {
    viewport: initialViewport,
    isResolving: isResolvingInitialViewport,
    isUserLocation: initialViewportIsUserLocation,
  } = useInitialMapViewport({ preferUserLocation, taskFocus });
  const selectedTask = selectedTaskId != null ? liveTasks[selectedTaskId] ?? null : null;
  const token = getMapboxPublicToken();
  // Super-admin master toggle (per-org override) for Google business pins.
  const { enabled: poiDisplayAllowed } = useMapPoiDisplay();
  const {
    pois: viewportPois,
    busy: poiBusy,
    zoomTooLow: poiZoomTooLow,
    selectedPoi,
    setSelectedPoi,
  } = useGooglePoiViewport(mapInstance, mapVersion > 0, showGooglePois && poiDisplayAllowed);

  const displayedPois = useMemo(() => {
    if (!locationCtx) return viewportPois;
    return viewportPois.filter((poi) =>
      isInsideLocationContext({ latitude: poi.lat, longitude: poi.lng }, locationCtx),
    );
  }, [viewportPois, locationCtx]);

  const handlePoiSelect = useCallback((poi: PoiResult) => {
    setSelectedPoi(poi);
    mapRef.current?.flyTo({ center: [poi.lng, poi.lat], zoom: Math.max(mapRef.current?.getZoom() ?? 15, 16), speed: 1.2 });
  }, [setSelectedPoi]);

  const handleSelectTask = useCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    const task = useTrackingStore.getState().liveTasks[taskId];
    const map = mapRef.current;
    if (!task || !map) return;
    const [lng, lat] = task.lastPosition;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    suppressFollowBreakRef.current = true;
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15.5), speed: 1.2 });
    map.once('moveend', () => {
      suppressFollowBreakRef.current = false;
    });
  }, [setSelectedTaskId]);

  // Deep-link from live-feed alerts: /map?taskId=123 (coords optional)
  const deepLinkTaskId = Number.parseInt(searchParams.get('taskId') ?? '', 10);
  useEffect(() => {
    if (!Number.isFinite(deepLinkTaskId) || deepLinkTaskId <= 0) return;
    const task = liveTasks[deepLinkTaskId];
    if (!task || !hasUsableTaskPosition(task)) return;
    if (selectedTaskId === deepLinkTaskId) return;
    const timer = setTimeout(() => {
      handleSelectTask(deepLinkTaskId);
    }, 0);
    return () => clearTimeout(timer);
  }, [deepLinkTaskId, liveTasks, selectedTaskId, handleSelectTask]);

  // Deep-link by agent: /map?agent=123 — select that agent's live task when no taskId.
  useEffect(() => {
    if (!Number.isFinite(initialAgentId) || initialAgentId <= 0) return;
    if (Number.isFinite(deepLinkTaskId) && deepLinkTaskId > 0) return;
    const match = Object.values(liveTasks).find(
      (task) => task.userId === initialAgentId && hasUsableTaskPosition(task),
    );
    if (!match) return;
    if (selectedTaskId === match.taskId) return;
    const timer = setTimeout(() => {
      handleSelectTask(match.taskId);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialAgentId, deepLinkTaskId, liveTasks, selectedTaskId, handleSelectTask]);

  const handleViewHistoryTask = useCallback((task: LiveTaskState) => {
    // Route history slide-in disabled — see docs/map-route-history-panel.md
    // setHistoryTask({ id: task.taskId, title: task.taskTitle ?? `Task #${task.taskId}` });
  }, [setHistoryTask]);

  const handleToggleFollowAll = useCallback(() => {
    setFollowAllActive((prev) => {
      if (!prev) {
        setIsFollowing(false);
        followAllLastFitRef.current = 0;
      }
      return !prev;
    });
  }, [setFollowAllActive, setIsFollowing]);

  const handleToggleSelectedFollowGoogle = useCallback(() => {
    const task = selectedTaskId != null ? liveTasks[selectedTaskId] ?? null : null;
    if (!task) return;
    if (isFollowing) {
      setIsFollowing(false);
      return;
    }
    setFollowAllActive(false);
    const map = mapRef.current;
    const [lng, lat] = task.lastPosition;
    if (map && Number.isFinite(lng) && Number.isFinite(lat)) {
      map.panTo({ lat, lng });
      if (map.getZoom() < 15) map.setZoom(15);
    }
    setIsFollowing(true);
  }, [isFollowing, liveTasks, selectedTaskId, setFollowAllActive, setIsFollowing]);

  const handleToggleSelectedFollow = useCallback(() => {
    if (!selectedTask) return;
    if (isFollowing) {
      setIsFollowing(false);
      return;
    }
    setFollowAllActive(false);
    const map = mapRef.current;
    const [lng, lat] = selectedTask.lastPosition;
    if (map && Number.isFinite(lng) && Number.isFinite(lat)) {
      suppressFollowBreakRef.current = true;
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15.5), speed: 1.4 });
      map.once('moveend', () => {
        suppressFollowBreakRef.current = false;
      });
    }
    setIsFollowing(true);
  }, [isFollowing, selectedTask, setFollowAllActive, setIsFollowing]);

  const savedLocationMatches = useMemo(() => {
    if (debouncedMapSearch.length < 2) return [] as SavedLocation[];
    return mapSearchSavedHits.slice(0, 6);
  }, [debouncedMapSearch, mapSearchSavedHits]);

  const leftSearchResults = useMemo(() => {
    const needle = leftSearchQuery.trim().toLowerCase();
    if (!needle) return null;

    if (leftTab === 'feeds') {
      return tasks
        .filter(
          (task) =>
            task.agentName.toLowerCase().includes(needle) ||
            (task.taskTitle ?? '').toLowerCase().includes(needle) ||
            (task.projectName ?? '').toLowerCase().includes(needle) ||
            (task.taskAddress ?? '').toLowerCase().includes(needle) ||
            String(task.taskId).includes(needle)
        )
        .slice(0, 8);
    }

    if (leftTab === 'clocked-in') {
      return clockedInItems
        .filter((item) => item.agent_name.toLowerCase().includes(needle))
        .slice(0, 8);
    }

    // Businesses tab uses server-side `q` via useInfiniteSavedLocations — not client filter.
    if (leftTab === 'businesses') {
      return null;
    }

    return null;
  }, [leftSearchQuery, leftTab, tasks, clockedInItems]);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);

    if (value.trim().length < 2) {
      setPlaceResults([]);
      setSearchBusy(false);
    }
  }, [setPlaceResults, setSearchBusy, setSearchQuery]);

  const handleLocationSelect = useCallback((
    ctx: LocationContext | null,
    options?: { place?: RetrievedPlace; suggestion?: PlaceSuggestion },
  ) => {
    setLocationCtx(ctx);
    if (!ctx) {
      setSelectedPoi(null);
      return;
    }
    setLeftTab('businesses');

    if (ctx.isBusiness) {
      const poi = resolvePoiForSearchSelection(
        ctx,
        viewportPois,
        options?.place ?? null,
        options?.suggestion ?? null,
      );
      if (poi) setSelectedPoi(poi);
    } else {
      setSelectedPoi(null);
    }

    const map = mapRef.current;
    if (!map) return;
    if (ctx.bbox) {
      map.fitBounds(
        [[ctx.bbox[0], ctx.bbox[1]], [ctx.bbox[2], ctx.bbox[3]]],
        { padding: 60, duration: 1200 }
      );
    } else {
      map.flyTo({ center: ctx.center, zoom: Math.max(map.getZoom(), 15), speed: 1.2 });
    }
  }, [setLeftTab, setLocationCtx, setSelectedPoi, viewportPois]);

  const handlePlaceResultSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    setPlaceResolving(true);
    const place = await retrievePlace(suggestion);
    setPlaceResolving(false);
    // Retrieval closes the provider session; rotate to a fresh one.
    searchSessionTokenRef.current = createSearchSessionToken();

    if (!place) return;

    void rememberRecentPlace({
      name: place.name,
      address: place.address,
      latitude: place.lat,
      longitude: place.lng,
      provider: place.provider,
      provider_place_id: place.placeId,
    });

    handleLocationSelect({
      name: place.name,
      center: [place.lng, place.lat],
      bbox: place.bbox,
      radiusKm: 5,
      placeId: suggestion.id,
      address: place.address,
      category: suggestion.category,
      isBusiness: inferIsBusiness(suggestion),
    }, { place, suggestion });
    setSearchQuery('');
    setPlaceResults([]);
    setSearchPanelOpen(false);
  }, [handleLocationSelect, setPlaceResolving, setPlaceResults, setSearchPanelOpen, setSearchQuery]);

  const handleRecentPlaceSelect = useCallback((recent: RecentPlace) => {
    void handlePlaceResultSelect(recentToSuggestionLike(recent, searchSessionTokenRef.current));
  }, [handlePlaceResultSelect]);

  const showHoverPopup = useCallback((position: [number, number], html: string) => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (!hoverPopupRef.current) {
      hoverPopupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        className: 'custom-dark-popup',
      });
    }

    hoverPopupRef.current.setLngLat(position).setHTML(html).addTo(map);
  }, [setSelectedTaskId]);

  const hideHoverPopup = useCallback(() => {
    hoverPopupRef.current?.remove();
  }, [setFollowAllActive, setIsFollowing]);

  const bindHoverPopup = useCallback(
    (element: HTMLElement, getPosition: () => [number, number], getHtml: () => string) => {
      if (element.dataset.hoverBound === 'true') return;

      element.dataset.hoverBound = 'true';
      element.addEventListener('mouseenter', () => showHoverPopup(getPosition(), getHtml()));
      element.addEventListener('mouseleave', hideHoverPopup);
    },
    [hideHoverPopup, showHoverPopup]
  );

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
        // Remove blue dot and previous locate pin, then place a red pin
        userLocationMarkerRef.current?.remove();
        userLocationMarkerRef.current = null;
        locateMePinRef.current?.remove();
        if (mapRef.current) {
          locateMePinRef.current = new mapboxgl.Marker({ color: '#EF4444' })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
        }
      },
      () => setLocating(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }, [locating, setLocating]);

  const ensureMotionLoop = useCallback(() => {
    if (motionRafRef.current) return;

    const step = (now: number) => {
      let pending = false;
      markerMotionRef.current.forEach((state, taskId) => {
        const marker = agentMarkersRef.current.get(taskId);
        if (!marker) return;
        const pos = sampleMarkerPosition(state, now);
        marker.setLngLat(pos);
        markerPositionRef.current.set(taskId, pos);
        if (!isMarkerMotionComplete(state, now)) pending = true;
      });
      if (pending) {
        motionRafRef.current = requestAnimationFrame(step);
      } else {
        motionRafRef.current = 0;
      }
    };

    motionRafRef.current = requestAnimationFrame(step);
  }, []);

  const queueAgentMotion = useCallback((
    taskId: number,
    marker: mapboxgl.Marker,
    target: [number, number],
    recordedAtMs?: number,
  ) => {
    const key = `${target[0].toFixed(6)},${target[1].toFixed(6)}`;
    if (queuedTargetRef.current.get(taskId) === key) return;
    queuedTargetRef.current.set(taskId, key);

    const now = performance.now();
    const existing = markerMotionRef.current.get(taskId);
    const cached = markerPositionRef.current.get(taskId);
    const current = cached ?? [marker.getLngLat().lng, marker.getLngLat().lat] as [number, number];
    const base = existing ?? createMarkerMotion(current, now);
    markerMotionRef.current.set(taskId, enqueueMarkerFix(base, target, now, recordedAtMs));
    ensureMotionLoop();
  }, [ensureMotionLoop]);

  // ── Staleness clock (state, not Date.now() in render — react-hooks/purity) ─
  useEffect(() => {
    const bump = () => {
      setNowMs(Date.now());
      setTick((t) => t + 1);
      setAppearance(resolveMapAppearance());
    };
    bump();
    const iv = setInterval(bump, 30_000);
    return () => clearInterval(iv);
  }, [setFollowAllActive, setIsFollowing]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query || query.length < 2 || compact) {
      return;
    }

    let cancelled = false;
    const abort = new AbortController();

    const timer = setTimeout(() => {
      setSearchBusy(true);

      // Bias suggestions toward the current map view so nearby businesses rank first.
      const center = mapRef.current?.getCenter();
      const proximity: [number, number] | undefined = center
        ? [center.lng, center.lat]
        : undefined;

      suggestPlaces(query, {
        sessionToken: searchSessionTokenRef.current,
        proximity,
        limit: 12,
        token,
        signal: abort.signal,
      })
        .then((results) => {
          if (cancelled) return;
          // Keep prior results while empty responses settle — only clear on settled empty.
          if (results.length > 0) {
            setPlaceResults(results);
          } else {
            setPlaceResults([]);
          }
        })
        .catch((error) => {
          if (cancelled) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          // Keep last good results on hard failure.
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [compact, searchQuery, token]);

  // Keep follow ref in sync (refs only in effects).
  useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);

  // While following a single agent, keep the camera glued to their live position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isFollowing || followAllActive || !selectedTask) return;
    const [lng, lat] = selectedTask.lastPosition;
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) return;
    suppressFollowBreakRef.current = true;
    map.easeTo({ center: [lng, lat], duration: 900, essential: true });
    map.once('moveend', () => {
      suppressFollowBreakRef.current = false;
    });
  }, [isFollowing, followAllActive, selectedTask, selectedTask?.lastPosition?.[0], selectedTask?.lastPosition?.[1]]);

  // Field-activity follow: keep camera on selected clocked-in agent day trail.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || leftTab !== 'clocked-in' || fieldFollowAll || fieldFollowUserId == null) return;
    const agent = fieldLiveAgentsMap[fieldFollowUserId];
    const pos = agent?.lastPosition;
    if (!pos) return;
    const [lng, lat] = pos;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    suppressFollowBreakRef.current = true;
    map.easeTo({ center: [lng, lat], duration: 900, essential: true });
    map.once('moveend', () => {
      suppressFollowBreakRef.current = false;
    });
  }, [
    leftTab,
    fieldFollowAll,
    fieldFollowUserId,
    fieldLiveAgentsMap,
    fieldLiveAgentsMap[fieldFollowUserId ?? -1]?.lastPosition?.[0],
    fieldLiveAgentsMap[fieldFollowUserId ?? -1]?.lastPosition?.[1],
  ]);

  // Field-activity follow-all: fit bounds to every active field agent.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || leftTab !== 'clocked-in' || !fieldFollowAll || fieldLiveAgents.length === 0) return;

    const now = Date.now();
    if (now - fieldFollowAllLastFitRef.current < 2000) return;
    fieldFollowAllLastFitRef.current = now;

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoint = false;
    for (const agent of fieldLiveAgents) {
      const pos = agent.lastPosition ?? agent.polyline[agent.polyline.length - 1];
      if (!pos) continue;
      bounds.extend(pos);
      hasPoint = true;
    }
    if (!hasPoint) return;
    suppressFollowBreakRef.current = true;
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 900 });
    map.once('moveend', () => {
      suppressFollowBreakRef.current = false;
    });
  }, [leftTab, fieldFollowAll, fieldLiveAgents]);

  // Follow-all: fit bounds to every actively tracking agent (throttled).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followAllActive || feedGroups.active.length === 0) return;

    const now = Date.now();
    if (now - followAllLastFitRef.current < 2000) return;
    followAllLastFitRef.current = now;

    const bounds = new mapboxgl.LngLatBounds();
    for (const task of feedGroups.active) {
      bounds.extend(task.lastPosition);
    }
    suppressFollowBreakRef.current = true;
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 900 });
    map.once('moveend', () => {
      suppressFollowBreakRef.current = false;
    });
  }, [
    followAllActive,
    feedGroups.active,
    feedGroups.active.map((t) => t.lastPosition.join(',')).join('|'),
    mapVersion,
  ]);

  // Break follow mode the moment the user pans/zooms/rotates manually.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapVersion === 0) return;

    const breakFollow = () => {
      if (suppressFollowBreakRef.current) return;
      if (isFollowingRef.current) setIsFollowing(false);
      setFollowAllActive(false);
    };

    map.on('dragstart', breakFollow);
    map.on('wheel', breakFollow);
    map.on('pitchstart', breakFollow);
    map.on('rotatestart', breakFollow);
    return () => {
      map.off('dragstart', breakFollow);
      map.off('wheel', breakFollow);
      map.off('pitchstart', breakFollow);
      map.off('rotatestart', breakFollow);
    };
  }, [mapVersion]);

  // ── Task focus from URL (?taskId&lat&lng): select the live task if it is
  // being tracked, otherwise pin + fly to the task's static destination. ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current || !taskFocus) return;

    const liveTask = liveTasks[taskFocus.taskId];
    if (liveTask && hasUsableTaskPosition(liveTask)) {
      // Upgrade the static pin to the live tracked task once it is available.
      // Center on the agent without auto-opening the detail card (click-to-open).
      taskFocusMarkerRef.current?.remove();
      taskFocusMarkerRef.current = null;
      if (!taskFocusSelectedRef.current) {
        taskFocusSelectedRef.current = true;
        map.flyTo({
          center: liveTask.lastPosition,
          zoom: Math.max(map.getZoom(), 15.5),
          speed: 1.2,
        });
      }
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
      map.flyTo({ center: lngLat, zoom: 15.5, speed: 1.4 });
    }
  }, [taskFocus, liveTasks, mapVersion]);

  // Handle Popup & Pulse Marker for Selected Task
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    if (!selectedTask) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (pulseMarkerRef.current) {
        pulseMarkerRef.current.remove();
        pulseMarkerRef.current = null;
      }
      return;
    }

    const { lastPosition, agentName, agentAvatarUrl, taskTitle, taskAddress } = selectedTask;

    if (!pulseMarkerRef.current) {
      const el = createPulseMarkerElement();
      pulseMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lastPosition)
        .addTo(map);
    } else {
      pulseMarkerRef.current.setLngLat(lastPosition);
    }

    if (!popupRef.current) {
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'custom-dark-popup',
        offset: 20,
      }).addTo(map);
    }

    const popupHtml = buildSelectedAgentPopupHtml({
      name: agentName,
      avatarUrl: agentAvatarUrl,
      location: taskAddress || taskTitle || 'No location details',
      statusLabel: getPresentStatusLabel(selectedTask.status),
    });
    const popup = popupRef.current;
    if (!popup) return;

    popup.setLngLat(lastPosition).setHTML(popupHtml);

    const popupElement = popup.getElement();
    if (!popupElement) return;

    const closeButton = popupElement.querySelector<HTMLButtonElement>('[data-popup-close="selected-agent"]');
    closeButton?.addEventListener('click', () => {
      popupRef.current?.remove();
      setSelectedTaskId(null);
    }, { once: true });
  }, [selectedTask, mapVersion, setSelectedTaskId]);

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !token || !initialViewport) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: getMapboxNavigationStyle(appearance),
      center: initialViewport.center,
      zoom: compact ? Math.max(initialViewport.zoom, 5.4) : initialViewport.zoom,
      attributionControl: false,
      transformRequest: createMapboxTransformRequest(),
      ...(compact && { interactive: false }),
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('live-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-lines-casing',
        type: 'line',
        source: 'live-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0095FF',
          'line-width': 12,
          'line-opacity': 0.3,
        },
      });
      map.addLayer({
        id: 'route-lines-main',
        type: 'line',
        source: 'live-routes',
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

      map.addSource('selection-overlays', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'selection-overlay-fill',
        type: 'fill',
        source: 'selection-overlays',
        paint: {
          'fill-color': [
            'match',
            ['get', 'kind'],
            'geofence',
            '#16A34A',
            '#3B82F6',
          ],
          'fill-opacity': 0.12,
        },
      });
      map.addLayer({
        id: 'selection-overlay-outline',
        type: 'line',
        source: 'selection-overlays',
        paint: {
          'line-color': [
            'match',
            ['get', 'kind'],
            'geofence',
            '#16A34A',
            '#3B82F6',
          ],
          'line-width': 2,
          'line-opacity': 0.75,
        },
      });

      const syncZoom = () => setMapZoom(map.getZoom());
      syncZoom();
      map.on('zoomend', syncZoom);
      map.on('moveend', syncZoom);

      if (initialViewportIsUserLocation) {
        userLocationMarkerRef.current = new mapboxgl.Marker({
          element: createUserLocationIndicatorElement(),
          anchor: 'center',
        })
          .setLngLat(initialViewport.center)
          .addTo(map);
      }

      mapLoadedRef.current = true;
      setMapInstance(map);
      setMapVersion((v) => v + 1);
    });

    return () => {
      mapLoadedRef.current = false;
      markerAnimationsRef.current.forEach((frameId) => cancelAnimationFrame(frameId));
      markerAnimationsRef.current.clear();
      if (motionRafRef.current) cancelAnimationFrame(motionRafRef.current);
      motionRafRef.current = 0;
      markerPositionRef.current.clear();
      markerMotionRef.current.clear();
      queuedTargetRef.current.clear();
      snappedTrailsRef.current.clear();

      originMarkersRef.current.forEach((marker) => marker.remove());
      destinationMarkersRef.current.forEach((marker) => marker.remove());
      agentMarkersRef.current.forEach((marker) => marker.remove());
      agentClusterMarkersRef.current.forEach((marker) => marker.remove());
      originMarkersRef.current.clear();
      destinationMarkersRef.current.clear();
      agentMarkersRef.current.clear();
      agentClusterMarkersRef.current = [];

      if (popupRef.current) popupRef.current.remove();
      if (pulseMarkerRef.current) pulseMarkerRef.current.remove();
      if (userLocationMarkerRef.current) userLocationMarkerRef.current.remove();
      if (locateMePinRef.current) locateMePinRef.current.remove();
      popupRef.current = null;
      pulseMarkerRef.current = null;
      userLocationMarkerRef.current = null;
      locateMePinRef.current = null;
      if (hoverPopupRef.current) hoverPopupRef.current.remove();
      hoverPopupRef.current = null;
      if (taskFocusMarkerRef.current) taskFocusMarkerRef.current.remove();
      taskFocusMarkerRef.current = null;
      taskFocusSelectedRef.current = false;
      directionRoutesRef.current.clear();
      clearDirectionsCache();

      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, [token, compact, appearance, initialViewport, initialViewportIsUserLocation]);

  useEffect(() => {
    if (hasActiveTaskPositions) {
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
    }
  }, [hasActiveTaskPositions]);

  // ── Sync live tasks → markers + routes ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const now = nowMs || Date.now();
    const allTrackedTasks = mapTasks.filter((t) => hasUsableTaskPosition(t));
    const bounds = map.getBounds();
    const maxRenderedMarkers = allTrackedTasks.length > 120 ? 120 : 400;
    const validTasks = allTrackedTasks
      .filter((task) => {
        if (selectedTaskId === task.taskId) return true;
        if (allTrackedTasks.length <= 100) return true;
        if (!bounds) return true;
        return bounds.contains([task.lastPosition[0], task.lastPosition[1]]);
      })
      .sort((a, b) => {
        const aTs = new Date(a.lastEventAt).getTime();
        const bTs = new Date(b.lastEventAt).getTime();
        return bTs - aTs;
      })
      .slice(0, maxRenderedMarkers);
    const validIds = new Set(validTasks.map((t) => t.taskId));
    const routeFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const destinationIds = new Set<number>();

    agentClusterMarkersRef.current.forEach((marker) => marker.remove());
    agentClusterMarkersRef.current = [];

    const zoom = mapZoom || map.getZoom();
    const clustering = shouldClusterLiveAgents(validTasks.length, zoom, {
      disableClustering: selectedTaskId != null,
    });
    const clusteredTaskIds = new Set<number>();

    if (clustering && bounds) {
      const clusterable = validTasks.filter(
        (task) => selectedTaskId !== task.taskId,
      );
      const points = clusterable.map((task) => ({
        type: 'Feature' as const,
        properties: { cluster: false, taskId: task.taskId },
        geometry: {
          type: 'Point' as const,
          coordinates: [task.lastPosition[0], task.lastPosition[1]] as [number, number],
        },
      }));
      const clusterIndex = new Supercluster({ radius: 56, maxZoom: 15 });
      clusterIndex.load(points);
      const clusters = clusterIndex.getClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        Math.floor(zoom),
      );

      clusters.forEach((feature) => {
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        if (feature.properties?.cluster) {
          const count = Number(feature.properties.point_count ?? 0);
          const leaves = clusterIndex.getLeaves(Number(feature.id), Infinity);
          leaves.forEach((leaf) => {
            const id = Number(leaf.properties?.taskId);
            if (Number.isFinite(id)) clusteredTaskIds.add(id);
          });
          const el = createLiveAgentClusterElement(count);
          el.addEventListener('click', () => {
            const expansionZoom = clusterIndex.getClusterExpansionZoom(Number(feature.id));
            map.easeTo({ center: [lng, lat], zoom: expansionZoom });
          });
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(map);
          agentClusterMarkersRef.current.push(marker);
        }
      });
    }

    validTasks.forEach((task) => {
      const stale = isLiveTaskStale(task, now, STALE_MS);
      const derivedOperationalStatus = resolveOperationalStatusFromTask(task, now, STALE_MS);
      const visualState = resolveVisualTaskState(task.status, stale, derivedOperationalStatus);
      const rawTrail = sanitizePolyline(buildTaskTrail(task));
      const trail = snappedTrailsRef.current.get(task.taskId) ?? rawTrail;
      const currentPoint = task.lastPosition;
      const showTrajectory = trajectoryTaskIds.has(task.taskId);
      const taskCount = agentTaskCounts.get(task.userId) ?? 1;
      const hideAgentInCluster = clusteredTaskIds.has(task.taskId);

      if (showTrajectory && trail.length >= 2) {
        routeFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: trail },
          properties: {
            taskId: task.taskId,
            status: visualState,
          },
        });
      }

      const originPoint = trail[0] ?? currentPoint;
      const existingOriginMarker = originMarkersRef.current.get(task.taskId);
      if (showTrajectory) {
        if (!existingOriginMarker) {
          const el = createStaticMarkerElement('origin');
          el.title = `Origin - ${task.agentName || `Task ${task.taskId}`}`;
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(originPoint)
            .addTo(map);
          originMarkersRef.current.set(task.taskId, marker);
        } else {
          existingOriginMarker.setLngLat(originPoint);
        }
      } else if (existingOriginMarker) {
        existingOriginMarker.remove();
        originMarkersRef.current.delete(task.taskId);
      }

      if (task.destination) {
        destinationIds.add(task.taskId);
        const destinationPoint: [number, number] = [task.destination.lng, task.destination.lat];
        const markerKind = getDestinationMarkerKind(task.status);

        // Forward route rendered via Directions API effect below

        const existingDestinationMarker = destinationMarkersRef.current.get(task.taskId);
        if (!existingDestinationMarker) {
          const el = createStaticMarkerElement(markerKind);
          el.dataset.kind = markerKind;
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(destinationPoint)
            .addTo(map);
          bindHoverPopup(
            el,
            () => destinationPoint,
            () =>
              buildDestinationPopupHtml({
                title:
                  markerKind === 'destination'
                    ? `Destination - ${task.agentName || `Task ${task.taskId}`}`
                    : markerKind === 'near'
                      ? `Near destination - ${task.agentName || `Task ${task.taskId}`}`
                      : markerKind === 'arrived'
                        ? `Arrival reached - ${task.agentName || `Task ${task.taskId}`}`
                        : `Completed - ${task.agentName || `Task ${task.taskId}`}`,
                location: task.taskAddress || task.taskTitle || 'No location details',
                statusLabel: getStatusLabel(task.status),
              })
          );
          destinationMarkersRef.current.set(task.taskId, marker);
        } else {
          const existingKind = existingDestinationMarker.getElement().dataset.kind;
          if (existingKind !== markerKind) {
            existingDestinationMarker.remove();
            const el = createStaticMarkerElement(markerKind);
            el.dataset.kind = markerKind;
            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
              .setLngLat(destinationPoint)
              .addTo(map);
            bindHoverPopup(
              el,
              () => destinationPoint,
              () =>
                buildDestinationPopupHtml({
                  title:
                    markerKind === 'destination'
                      ? `Destination - ${task.agentName || `Task ${task.taskId}`}`
                      : markerKind === 'near'
                        ? `Near destination - ${task.agentName || `Task ${task.taskId}`}`
                        : markerKind === 'arrived'
                          ? `Arrival reached - ${task.agentName || `Task ${task.taskId}`}`
                          : `Completed - ${task.agentName || `Task ${task.taskId}`}`,
                  location: task.taskAddress || task.taskTitle || 'No location details',
                  statusLabel: getStatusLabel(task.status),
                })
            );
            destinationMarkersRef.current.set(task.taskId, marker);
          } else {
            existingDestinationMarker.setLngLat(destinationPoint);
          }
        }
      }

      let existingAgentMarker = agentMarkersRef.current.get(task.taskId);
      if (hideAgentInCluster) {
        if (existingAgentMarker) {
          existingAgentMarker.remove();
          agentMarkersRef.current.delete(task.taskId);
          markerPositionRef.current.delete(task.taskId);
          agentMarkerUserIdRef.current.delete(task.taskId);
          const frameId = markerAnimationsRef.current.get(task.taskId);
          if (frameId) {
            cancelAnimationFrame(frameId);
            markerAnimationsRef.current.delete(task.taskId);
          }
        }
        return;
      }

      const trackedUserId = agentMarkerUserIdRef.current.get(task.taskId);
      if (
        existingAgentMarker &&
        trackedUserId != null &&
        task.userId > 0 &&
        trackedUserId !== task.userId
      ) {
        existingAgentMarker.remove();
        agentMarkersRef.current.delete(task.taskId);
        markerPositionRef.current.delete(task.taskId);
        agentMarkerUserIdRef.current.delete(task.taskId);
        const frameId = markerAnimationsRef.current.get(task.taskId);
        if (frameId) {
          cancelAnimationFrame(frameId);
          markerAnimationsRef.current.delete(task.taskId);
        }
        existingAgentMarker = undefined;
      }

      if (!existingAgentMarker) {
        const el = createAgentMarkerElement({
          name: task.agentName,
          avatarUrl: task.agentAvatarUrl,
          visualState,
          stale,
          taskCount,
        });
        el.dataset.agentName = task.agentName;
        el.dataset.avatarUrl = task.agentAvatarUrl ?? '';
        el.dataset.location = task.taskAddress || task.taskTitle || 'No location details';
        el.dataset.statusLabel = getStatusLabel(task.status);
        // Agent detail card is click-only — no hover popup (blocks live route while tracking).
        if (!compact) {
          el.addEventListener('click', () => {
            handleSelectTask(task.taskId);
          });
        }

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(task.lastPosition)
          .addTo(map);
        agentMarkersRef.current.set(task.taskId, marker);
        markerPositionRef.current.set(task.taskId, task.lastPosition);
        markerMotionRef.current.set(task.taskId, createMarkerMotion(task.lastPosition, performance.now()));
        queuedTargetRef.current.set(
          task.taskId,
          `${task.lastPosition[0].toFixed(6)},${task.lastPosition[1].toFixed(6)}`,
        );
        if (task.userId > 0) {
          agentMarkerUserIdRef.current.set(task.taskId, task.userId);
        }
        updateAgentMarkerHeading(el, stale ? null : resolveHeading(task.headingDegrees ?? null, trail));
      } else {
        updateAgentMarkerElement(existingAgentMarker.getElement(), {
          name: task.agentName,
          avatarUrl: task.agentAvatarUrl,
          visualState,
          stale,
          taskCount,
        });
        existingAgentMarker.getElement().dataset.agentName = task.agentName;
        existingAgentMarker.getElement().dataset.avatarUrl = task.agentAvatarUrl ?? '';
        existingAgentMarker.getElement().dataset.location = task.taskAddress || task.taskTitle || 'No location details';
        existingAgentMarker.getElement().dataset.statusLabel = getStatusLabel(task.status);
        const heading = resolveHeading(task.headingDegrees ?? null, trail);
        updateAgentMarkerHeading(existingAgentMarker.getElement(), stale ? null : heading);
        if (!stale) {
          queueAgentMotion(
            task.taskId,
            existingAgentMarker,
            task.lastPosition,
            new Date(task.lastEventAt).getTime(),
          );
        }
      }
    });

    const routeSource = map.getSource('live-routes') as mapboxgl.GeoJSONSource | undefined;
    routeSource?.setData({
      type: 'FeatureCollection',
      features: routeFeatures,
    });

    // Also render cached forward routes
    const forwardFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    directionRoutesRef.current.forEach((coords, taskId) => {
      if (validIds.has(taskId) && trajectoryTaskIds.has(taskId) && coords.length >= 2) {
        forwardFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { taskId },
        });
      }
    });
    const forwardSource = map.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;
    forwardSource?.setData({
      type: 'FeatureCollection',
      features: forwardFeatures,
    });

    const overlayCircles: Array<{
      lng: number;
      lat: number;
      radiusMeters: number;
      kind: 'accuracy' | 'geofence';
    }> = [];
    if (selectedTaskId != null) {
      const selected = validTasks.find((t) => t.taskId === selectedTaskId) ?? liveTasks[selectedTaskId];
      if (selected && hasUsableTaskPosition(selected)) {
        const accuracy = selected.accuracyMeters;
        if (typeof accuracy === 'number' && accuracy > 0 && accuracy < 500) {
          overlayCircles.push({
            lng: selected.lastPosition[0],
            lat: selected.lastPosition[1],
            radiusMeters: accuracy,
            kind: 'accuracy',
          });
        }
        const radiusM = selected.destination?.radiusM;
        if (
          selected.destination &&
          typeof radiusM === 'number' &&
          radiusM > 0
        ) {
          overlayCircles.push({
            lng: selected.destination.lng,
            lat: selected.destination.lat,
            radiusMeters: radiusM,
            kind: 'geofence',
          });
        }
      }
    }
    const overlaySource = map.getSource('selection-overlays') as mapboxgl.GeoJSONSource | undefined;
    overlaySource?.setData(circleFeatureCollection(overlayCircles));

    originMarkersRef.current.forEach((marker, id) => {
      if (!validIds.has(id)) {
        marker.remove();
        originMarkersRef.current.delete(id);
      }
    });

    destinationMarkersRef.current.forEach((marker, id) => {
      if (!destinationIds.has(id)) {
        marker.remove();
        destinationMarkersRef.current.delete(id);
      }
    });

    agentMarkersRef.current.forEach((marker, id) => {
      if (!validIds.has(id) || clusteredTaskIds.has(id)) {
        marker.remove();
        agentMarkersRef.current.delete(id);
        markerPositionRef.current.delete(id);
        agentMarkerUserIdRef.current.delete(id);
        markerMotionRef.current.delete(id);
        queuedTargetRef.current.delete(id);
        const frameId = markerAnimationsRef.current.get(id);
        if (frameId) {
          cancelAnimationFrame(frameId);
          markerAnimationsRef.current.delete(id);
        }
      }
    });
  }, [mapTasks, trajectoryTaskIds, tick, compact, mapVersion, nowMs, mapZoom, agentTaskCounts, liveTasks, queueAgentMotion, selectedTaskId, bindHoverPopup, handleSelectTask]);

  // ── Fetch Mapbox Directions routes for tasks with destinations ───────────────
  useEffect(() => {
    if (!token || !mapLoadedRef.current) return;

    const tasksWithDest = mapTasks.filter(
      (t) =>
        trajectoryTaskIds.has(t.taskId) &&
        t.destination &&
        (t.lastPosition[0] !== 0 || t.lastPosition[1] !== 0) &&
        t.status !== 'completed'
    );

    let cancelled = false;

    async function fetchAll() {
      let didChange = false;

      for (const task of tasksWithDest) {
        if (cancelled) return;
        if (!task.destination) continue;

        const origin: [number, number] = task.lastPosition;
        const dest: [number, number] = [task.destination.lng, task.destination.lat];

        // Skip if same point
        if (areSamePoint(origin, dest)) continue;

        const routeResult = await fetchDirectionsRoute(origin, dest, token);
        if (cancelled) return;

        if (routeResult && routeResult.coords.length >= 2) {
          directionRoutesRef.current.set(task.taskId, routeResult.coords);
          didChange = true;
        }
      }

      // Remove routes for tasks that no longer have destinations
      const activeIds = new Set(tasksWithDest.map((t) => t.taskId));
      directionRoutesRef.current.forEach((_, id) => {
        if (!activeIds.has(id)) {
          directionRoutesRef.current.delete(id);
          didChange = true;
        }
      });

      // Update the forward-routes source on the map
      if (didChange && !cancelled && mapRef.current) {
        const forwardFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        directionRoutesRef.current.forEach((coords, taskId) => {
          if (coords.length >= 2) {
            forwardFeatures.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
              properties: { taskId },
            });
          }
        });
        const src = mapRef.current.getSource('forward-routes') as mapboxgl.GeoJSONSource | undefined;
        src?.setData({ type: 'FeatureCollection', features: forwardFeatures });
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [mapTasks, trajectoryTaskIds, token, mapVersion]);

  useEffect(() => {
    if (!token || !mapLoadedRef.current) return;

    let cancelled = false;

    async function matchTrails() {
      let didChange = false;
      for (const task of mapTasks) {
        if (cancelled) return;
        if (!trajectoryTaskIds.has(task.taskId)) continue;
        const raw = sanitizePolyline(buildTaskTrail(task));
        if (raw.length < 5) continue;
        const windowed = raw.slice(-25);
        const snapped = await fetchMapMatchingRoute(windowed, token, 'driving');
        if (cancelled) return;
        if (snapped.length >= 2) {
          const prefix = raw.length > windowed.length ? raw.slice(0, raw.length - windowed.length) : [];
          snappedTrailsRef.current.set(task.taskId, [...prefix, ...snapped]);
          didChange = true;
        }
      }

      if (!didChange || cancelled || !mapRef.current) return;
      const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      mapTasks.forEach((task) => {
        if (!trajectoryTaskIds.has(task.taskId)) return;
        const trail = snappedTrailsRef.current.get(task.taskId) ?? sanitizePolyline(buildTaskTrail(task));
        if (trail.length < 2) return;
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: trail },
          properties: { taskId: task.taskId, status: task.status },
        });
      });
      const src = mapRef.current.getSource('live-routes') as mapboxgl.GeoJSONSource | undefined;
      src?.setData({ type: 'FeatureCollection', features });
    }

    void matchTrails();
    return () => {
      cancelled = true;
    };
  }, [mapTasks, trajectoryTaskIds, token, mapVersion]);

  // ── No token fallback ────────────────────────────────────────────────────────
  if (!token) {
    if (compact) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#F0F0F0] text-sm text-gray-400">
          Map requires {MAPBOX_PUBLIC_TOKEN_ENV}
        </div>
      );
    }
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

  if (compact) {
    return (
      <div className="w-full h-full relative">
        {/* Mount the live tracking WS + hydration so the home widget updates in real time. */}
        <div className="hidden" aria-hidden="true">
          <HydrationBridge onHydrationChange={setIsInitialHydrating} />
        </div>

        <div ref={mapContainer} className="w-full h-full" />

        <SavedLocationsLayer
          provider="mapbox"
          ready={mapVersion > 0}
          getMapboxMap={() => mapRef.current}
          pinMode={false}
          onPinModeChange={() => { }}
          readOnly
        />

        {clockedInItems.length > 0 && (
          <ClockedInLayer
            provider="mapbox"
            ready={mapVersion > 0}
            items={clockedInItems}
            selectedUserId={highlightedClockedInUserId}
            onSelectUserId={setSelectedClockedInUserId}
            getMapboxMap={() => mapRef.current}
          />
        )}

        {providerState.fallbackReason === 'missing_google_api_key' && providerState.requestedProvider === 'google' && (
          <div className="absolute bottom-1 left-1 right-1 rounded bg-black/70 px-2 py-1 text-[9px] font-medium text-white">
            Google key missing. Showing Mapbox fallback.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="hidden" aria-hidden="true">
        <HydrationBridge onHydrationChange={setIsInitialHydrating} />
      </div>

      <TrackingConnectionStatus />

      {/* Map canvas */}
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
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

      {/* Search — top, full-width on mobile / top-right on desktop */}
      <div className="absolute top-4 left-4 right-4 md:top-8 md:right-8 md:left-auto md:w-[450px] z-20">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search by places…"
            value={searchQuery}
            onChange={(e) => handleSearchQueryChange(e.target.value)}
            onFocus={() => {
              setRecentPlaces(getLocalRecentPlaces());
              void fetchRecentPlaces().then(setRecentPlaces);
              setSearchPanelOpen(true);
            }}
            onBlur={() => {
              // Delay so click on recent/result still registers.
              window.setTimeout(() => setSearchPanelOpen(false), 150);
            }}
            className="w-full bg-white rounded-full py-4 pl-14 pr-6 text-[14px] shadow-2xl shadow-black/5 outline-none font-medium text-dash-dark placeholder:text-gray-400"
          />
        </div>

        {searchPanelOpen && searchQuery.trim().length < 2 && recentPlaces.length > 0 && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-2 py-2 shadow-xl max-h-[50vh] overflow-y-auto">
            <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Recent
            </div>
            {recentPlaces.map((r) => (
              <button
                key={`recent-${r.id ?? `${r.latitude},${r.longitude}`}`}
                type="button"
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] text-slate-700 hover:bg-slate-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleRecentPlaceSelect(r);
                }}
              >
                <span className="font-semibold">{r.name}</span>
                {r.address && r.address !== r.name && (
                  <span className="block text-[11px] text-slate-400 truncate">{r.address}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {(searchBusy || placeResults.length > 0 || savedLocationMatches.length > 0) && searchQuery.trim().length >= 2 && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-2 py-2 shadow-xl max-h-[50vh] overflow-y-auto">
            {savedLocationMatches.length > 0 && (
              <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Saved locations
              </div>
            )}
            {savedLocationMatches.map((loc) => (
              <button
                key={`saved-${loc.id}`}
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] text-slate-700 hover:bg-slate-100"
                onClick={() => setFocusLocation({ ...loc })}
              >
                <span className="font-semibold">{loc.name}</span>
                <span className="text-slate-400"> · {getSavedLocationLabel(loc.type)}</span>
              </button>
            ))}

            {(placeResults.length > 0 || searchBusy) && savedLocationMatches.length > 0 && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Places
              </div>
            )}

            {searchBusy && (
              <div className="px-3 py-2 text-[12px] text-slate-500">Searching places...</div>
            )}

            {!searchBusy && placeResults.length === 0 && savedLocationMatches.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-slate-500">No matches found.</div>
            )}

            {placeResults.map((result) => (
              <button
                key={`${result.provider}-${result.id}`}
                disabled={placeResolving}
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                onClick={() => handlePlaceResultSelect(result)}
              >
                <span className="font-semibold">{result.name}</span>
                {result.category && (
                  <span className="ml-2 text-[10px] font-medium text-dash-teal capitalize">
                    {result.category.replace(/_/g, ' ')}
                  </span>
                )}
                {(() => {
                  const label = placeAttributionLabel(
                    result.sources,
                    result.provider,
                    result.attributionVisible,
                  );
                  return label ? (
                    <span className="ml-1.5 text-[9px] font-medium text-slate-400">{label}</span>
                  ) : null;
                })()}
                {result.placeFormatted && result.placeFormatted !== result.name && (
                  <span className="block text-[11px] text-slate-400 truncate">{result.placeFormatted}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Left panel — agent/business search + tabs */}
      {!fieldFocusMode && (
      <div className="absolute top-20 left-4 right-4 md:top-8 md:left-8 md:right-auto md:w-[340px] z-20 bg-white rounded-[32px] shadow-2xl shadow-black/10 overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
        {/* Dynamic search filter */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={15} strokeWidth={2} />
            <input
              type="text"
              placeholder={
                leftTab === 'feeds' ? 'Search by agents…' :
                  leftTab === 'clocked-in' ? 'Search by clocked in agents…' :
                    'Search by business…'
              }
              value={leftSearchQuery}
              onChange={(e) => setLeftSearchQuery(e.target.value)}
              className="w-full bg-white rounded-full py-3 pl-10 pr-10 text-[13px] shadow-2xl shadow-black/10 outline-none font-medium text-dash-dark placeholder:text-gray-400 border border-slate-100"
            />
            {leftSearchQuery.length > 0 ? (
              <button
                onClick={() => setLeftSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X size={10} className="text-slate-500" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 shrink-0 mx-4">
          <button
            onClick={() => { setLeftTab('feeds'); setLeftSearchQuery(''); }}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'feeds' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Live Feeds
          </button>
          <button
            onClick={() => { setLeftTab('clocked-in'); setLeftSearchQuery(''); }}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'clocked-in' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Clocked In ({clockedInItems.length})
          </button>
          <button
            onClick={() => { setLeftTab('businesses'); setLeftSearchQuery(''); }}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'businesses' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Businesses {locationCtx ? `(${filteredBusinesses.length})` : ''}
          </button>
        </div>

        {leftTab === 'feeds' ? (
          <LiveFeedsPanel
            tasks={tasks}
            nowMs={nowMs}
            selectedTaskId={selectedTaskId}
            isInitialHydrating={isInitialHydrating}
            followAllActive={followAllActive}
            showHistory={showHistoryFeeds}
            searchQuery={leftSearchQuery}
            onToggleHistory={() => setShowHistoryFeeds((prev) => !prev)}
            onToggleFollowAll={handleToggleFollowAll}
            onSelectTask={handleSelectTask}
            onViewHistoryTask={handleViewHistoryTask}
          />
        ) : leftTab === 'clocked-in' ? (
          <ClockedInPanel
            items={leftSearchResults && Array.isArray(leftSearchResults) ? (leftSearchResults as typeof clockedInItems) : clockedInItems}
            isLoading={clockedInLoading}
            selectedUserId={highlightedClockedInUserId}
            onSelect={handleClockedInSelect}
            followAllActive={fieldFollowAll}
            focusMode={fieldFocusMode}
            onFollowSelected={() => {
              if (highlightedClockedInUserId != null) {
                setFieldFollowUserId(highlightedClockedInUserId);
              }
            }}
            onToggleFollowAll={() => setFieldFollowAll(!fieldFollowAll)}
            onToggleFocusMode={() => setFieldFocusMode(!fieldFocusMode)}
          />
        ) : (
          <BusinessListPanel
            activeLocation={locationCtx}
            pois={displayedPois}
            poiBusy={poiBusy}
            poiZoomTooLow={poiZoomTooLow}
            savedLocations={savedLocations}
            savedLocationsLoading={savedLocationsLoading}
            savedLocationsTotal={savedLocationsTotal}
            hasNextSavedPage={Boolean(hasNextSavedPage)}
            isFetchingNextSavedPage={isFetchingNextSavedPage}
            onLoadMoreSaved={() => {
              if (hasNextSavedPage && !isFetchingNextSavedPage) {
                void fetchNextSavedPage();
              }
            }}
            onPoiClick={handlePoiSelect}
            onSavedClick={(b) => {
              setFocusLocation(b);
              mapRef.current?.flyTo({ center: [b.longitude, b.latitude], zoom: 17, speed: 1.2 });
            }}
          />
        )}
      </div>
      )}

      {fieldFocusMode && (
        <button
          type="button"
          onClick={() => setFieldFocusMode(false)}
          className="absolute top-20 left-4 z-30 inline-flex items-center gap-2 rounded-full bg-[#0A192F] px-4 py-2 text-[12px] font-semibold text-white shadow-lg"
        >
          Exit focus
        </button>
      )}

      {showBusinessPins && (
        <SavedLocationsLayer
          provider="mapbox"
          ready={mapVersion > 0}
          getMapboxMap={() => mapRef.current}
          pinMode={pinMode}
          onPinModeChange={setPinMode}
          focusLocation={focusLocation}
          extraLocations={savedLocationMatches}
          visibleIds={filteredBusinessIds}
        />
      )}

      <GooglePoiMapLayer
        map={mapInstance}
        mapReady={mapVersion > 0}
        pois={viewportPois}
        visible={showGooglePois && poiDisplayAllowed}
        selectedPoiId={selectedPoi?.id ?? null}
        excludePlaceId={locationCtx?.placeId ?? null}
        onPoiClick={handlePoiSelect}
      />

      <SearchFocusLayer
        map={mapInstance}
        mapReady={mapVersion > 0}
        focus={locationCtx}
      />

      <PoiDetailCard
        poi={selectedPoi}
        onClose={() => setSelectedPoi(null)}
        onCenter={(poi) => {
          mapRef.current?.flyTo({ center: [poi.lng, poi.lat], zoom: 17, speed: 1.2 });
        }}
      />

      {(leftTab === 'clocked-in' || compact) && clockedInItems.length > 0 && (
        <ClockedInLayer
          provider="mapbox"
          ready={mapVersion > 0}
          items={clockedInItems}
          selectedUserId={highlightedClockedInUserId}
          onSelectUserId={setSelectedClockedInUserId}
          getMapboxMap={() => mapRef.current}
        />
      )}

      {(leftTab === 'clocked-in' || compact) && (
        <FieldActivityLiveLayer
          provider="mapbox"
          ready={mapVersion > 0}
          agents={fieldLiveAgents}
          selectedUserId={highlightedClockedInUserId}
          followAll={fieldFollowAll}
          getMapboxMap={() => mapRef.current}
        />
      )}

      <TerritoryLayer
        variant="admin"
        provider="mapbox"
        ready={mapVersion > 0}
        getMapboxMap={() => mapRef.current}
        toggleClassName="absolute bottom-6 left-4 z-30 flex flex-col-reverse items-start gap-2"
      />

      {selectedTask && (() => {
        const operationalStatus = resolveOperationalStatusFromTask(selectedTask, nowMs, STALE_MS);
        const statusMeta = OPERATIONAL_STATUS_META[operationalStatus];

        return (
          <div className="absolute bottom-64 right-4 md:right-10 z-20 w-[min(92vw,380px)] rounded-3xl border border-slate-200 bg-white/95 backdrop-blur shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <h4 className="text-[14px] font-bold text-slate-800 flex-1 min-w-0">Active Agent Command Panel</h4>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold shrink-0 ${statusMeta.badgeClassName}`}>
                {statusMeta.label}
              </span>
              <button
                onClick={() => setSelectedTaskId(null)}
                aria-label="Close panel"
                className="shrink-0 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L11 11M11 1L1 11" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <AgentAvatar
                  key={`selected-${selectedTask.taskId}-${selectedTask.agentAvatarUrl ?? ''}`}
                  name={selectedTask.agentName}
                  avatarUrl={selectedTask.agentAvatarUrl}
                  sizeClassName="w-12 h-12"
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-slate-900 truncate">{selectedTask.agentName || 'Agent'}</p>
                  <p className="text-[11px] text-slate-500">Role: Agent</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Current Task</p>
                  <p className="font-semibold text-slate-800 truncate">{selectedTask.taskTitle || `Task #${selectedTask.taskId}`}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Current Project</p>
                  <p className="font-semibold text-slate-800 truncate">{selectedTask.projectName ?? 'Unassigned'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">ETA</p>
                  <p className="font-semibold text-slate-800">{formatEta(selectedTask.etaSeconds)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Speed</p>
                  <p className="font-semibold text-slate-800">{formatSpeed(selectedTask.speedMps)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Distance Remaining</p>
                  <p className="font-semibold text-slate-800">{formatMetricDistance(selectedTask.distanceRemainingMeters)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Route Deviation</p>
                  <p className="font-semibold text-slate-800">{formatMetricDistance(selectedTask.routeDeviationMeters)}</p>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Last GPS Update: {new Date(selectedTask.lastEventAt).toLocaleString()}
              </p>

              <button
                onClick={handleToggleSelectedFollow}
                className={`w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-colors ${isFollowing
                  ? 'bg-dash-teal/10 text-dash-teal hover:bg-dash-teal/20'
                  : 'bg-[#0A192F] text-white hover:bg-[#132B4A]'
                  }`}
              >
                <LocateFixed size={14} />
                {isFollowing ? 'Following — tap to stop' : 'Follow agent'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Route history slide-in disabled — see docs/map-route-history-panel.md
      {historyTask && (
        <RouteHistoryPanel
          taskId={historyTask.id}
          taskTitle={historyTask.title}
          onClose={() => setHistoryTask(null)}
        />
      )}
      */}

      {providerState.fallbackReason === 'missing_google_api_key' && providerState.requestedProvider === 'google' && (
        <div className="absolute bottom-3 left-3 right-3 md:left-8 md:right-auto md:w-[420px] z-20 rounded-md bg-black/75 px-3 py-2 text-[11px] font-medium text-white">
          Google map is selected by admin, but NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Showing Mapbox fallback.
        </div>
      )}

      {/* Map controls — bottom-center, clear of the AI FAB at bottom-right */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        {poiDisplayAllowed && (
          <button
            onClick={() => setShowGooglePois((visible) => !visible)}
            title={showGooglePois ? 'Hide Google Places' : 'Show Google Places'}
            className="h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 px-4 flex items-center gap-2 text-[12px] font-semibold text-dash-dark hover:bg-slate-50 active:scale-95 transition-all"
          >
            {showGooglePois ? <EyeOff size={16} /> : <Eye size={16} />}
            {showGooglePois ? 'Hide Places' : 'Show Places'}
          </button>
        )}

        {/* Toggle saved business pins */}
        <button
          onClick={() => setShowBusinessPins((visible) => !visible)}
          title={showBusinessPins ? 'Hide pinned locations' : 'Show pinned locations'}
          className="h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 px-4 flex items-center gap-2 text-[12px] font-semibold text-dash-dark hover:bg-slate-50 active:scale-95 transition-all"
        >
          {showBusinessPins ? <EyeOff size={16} /> : <Eye size={16} />}
          {showBusinessPins ? 'Hide Pins' : 'Show Pins'}
        </button>

        {/* Locate me */}
        <button
          onClick={handleLocateMe}
          disabled={locating}
          title="Center on my location"
          className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 flex items-center justify-center text-dash-teal hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <LocateFixed size={18} className={locating ? 'animate-pulse' : ''} />
        </button>

        {/* 2D / 3D toggle */}
        <div className="flex rounded-full overflow-hidden border border-slate-200 shadow-lg bg-white/95 backdrop-blur">
          <button
            onClick={() => {
              if (mapMode !== '2d') {
                setMapMode('2d');
                mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 800 });
              }
            }}
            className={`px-4 py-2 text-[12px] font-semibold transition-colors ${mapMode === '2d' ? 'bg-[#0A192F] text-white' : 'text-slate-500 hover:text-dash-dark'}`}
          >
            2D
          </button>
          <button
            onClick={() => {
              if (mapMode !== '3d') {
                setMapMode('3d');
                mapRef.current?.easeTo({ pitch: 55, bearing: -20, duration: 800 });
              }
            }}
            className={`px-4 py-2 text-[12px] font-semibold transition-colors ${mapMode === '3d' ? 'bg-[#0A192F] text-white' : 'text-slate-500 hover:text-dash-dark'}`}
          >
            3D
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleMapView({ compact = false, providerState }: MapViewProps & { providerState: EffectiveMapProviderState }) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const initialAgentId = Number.parseInt(searchParams.get('agent') ?? '', 10);
  const taskFocus = useMemo(
    () => parseTaskMapParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const taskFocusMarkerRef = useRef<GoogleMarkerLike | null>(null);
  const taskFocusSelectedRef = useRef(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapLike | null>(null);
  const googleRef = useRef<GoogleMapsNamespaceLike | null>(null);
  const agentMarkersRef = useRef<Map<number, GoogleMarkerLike>>(new Map());
  const destinationMarkersRef = useRef<Map<number, GoogleMarkerLike>>(new Map());
  const routeLinesRef = useRef<Map<number, GooglePolylineLike>>(new Map());
  const overlayCirclesRef = useRef<Array<{ setMap: (map: GoogleMapLike | null) => void }>>([]);
  const agentClustererRef = useRef<MarkerClusterer | null>(null);
  const userLocationMarkerRef = useRef<GoogleMarkerLike | null>(null);
  const locateMePinRef = useRef<GoogleMarkerLike | null>(null);
  const markerAnimationsRef = useRef<Map<number, number>>(new Map());
  const markerPositionRef = useRef<Map<number, [number, number]>>(new Map());

  const [searchQuery, setSearchQuery] = useState('');
  const [leftSearchQuery, setLeftSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [followAllActive, setFollowAllActive] = useState(false);
  const [showHistoryFeeds, setShowHistoryFeeds] = useState(false);
  const followAllLastFitRef = useRef(0);
  // Camera follow mode: keeps tracking the selected agent until the user pans away.
  const [isFollowing, setIsFollowing] = useState(false);
  const isFollowingRef = useRef(false);
  const suppressFollowBreakRef = useRef(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [historyTask, setHistoryTask] = useState<{ id: number; title: string } | null>(null);
  const [isInitialHydrating, setIsInitialHydrating] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [focusLocation, setFocusLocation] = useState<SavedLocation | null>(null);
  const [locationCtx, setLocationCtx] = useState<LocationContext | null>(null);
  const [leftTab, setLeftTab] = useState<MapLeftTab>(
    initialTab === 'clocked-in' ? 'clocked-in' : initialTab === 'businesses' ? 'businesses' : 'feeds'
  );
  const [showBusinessPins, setShowBusinessPins] = useState(true);
  const [poiResults, setPoiResults] = useState<PoiResult[]>([]);
  const [poiBusy, setPoiBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  // Super-admin master toggle (per-org override) for Google business pins.
  const { enabled: poiDisplayAllowed } = useMapPoiDisplay();
  const googlePoiMarkersRef = useRef<{ setMap: (m: unknown) => void }[]>([]);
  const [debouncedLeftSearch, setDebouncedLeftSearch] = useState('');
  const [debouncedMapSearch, setDebouncedMapSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedLeftSearch(leftSearchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [leftSearchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedMapSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const businessesSearchQ =
    leftTab === 'businesses' && debouncedLeftSearch.length > 0 ? debouncedLeftSearch : undefined;

  const viewerCoords = useViewerCoords();
  const nearLat = viewerCoords?.latitude;
  const nearLng = viewerCoords?.longitude;

  const {
    items: infiniteSavedLocations,
    total: savedLocationsTotal,
    isLoading: savedLocationsLoading,
    hasNextPage: hasNextSavedPage,
    isFetchingNextPage: isFetchingNextSavedPage,
    fetchNextPage: fetchNextSavedPage,
  } = useInfiniteSavedLocations({
    q: businessesSearchQ,
    near_lat: nearLat,
    near_lng: nearLng,
    enabled: leftTab === 'businesses',
  });

  const { items: mapSearchSavedHits = [] } = useInfiniteSavedLocations({
    q: debouncedMapSearch.length >= 2 ? debouncedMapSearch : undefined,
    near_lat: nearLat,
    near_lng: nearLng,
    per_page: 8,
    enabled: debouncedMapSearch.length >= 2,
  });

  const savedLocations = infiniteSavedLocations;
  const savedLocationPermissions = useSavedLocationPermissions();
  const { isLoading: clockedInLoading } = useAttendanceMapSnapshots({}, { scope: 'management' });
  useFieldActivityLiveHydrate(!compact);
  const fieldLiveAgentsMap = useFieldActivityLiveStore((s) => s.agents);
  const fieldLiveAgents = useMemo(() => Object.values(fieldLiveAgentsMap), [fieldLiveAgentsMap]);
  const fieldFollowUserId = useFieldActivityLiveStore((s) => s.followUserId);
  const fieldFollowAll = useFieldActivityLiveStore((s) => s.followAll);
  const fieldFocusMode = useFieldActivityLiveStore((s) => s.focusMode);
  const setFieldFollowUserId = useFieldActivityLiveStore((s) => s.setFollowUserId);
  const setFieldFollowAll = useFieldActivityLiveStore((s) => s.setFollowAll);
  const setFieldFocusMode = useFieldActivityLiveStore((s) => s.setFocusMode);
  const fieldFollowAllLastFitRef = useRef(0);
  const clockedInItemMap = useAttendanceMapStore((s) => s.items);
  const clockedInItems = useMemo(() => Object.values(clockedInItemMap), [clockedInItemMap]);
  const selectedClockedInUserId = useAttendanceMapStore((s) => s.selectedUserId);
  const setSelectedClockedInUserId = useAttendanceMapStore((s) => s.setSelectedUserId);

  const handleClockedInSelect = useCallback((item: AttendanceMapSnapshotItem) => {
    setSelectedClockedInUserId(item.user_id);
    const live = useFieldActivityLiveStore.getState().agents[item.user_id];
    const map = mapRef.current;
    if (!map) return;
    const lat = live?.lastPosition?.[1] ?? item.latitude;
    const lng = live?.lastPosition?.[0] ?? item.longitude;
    map.panTo({ lat, lng });
    if (map.getZoom() < 14) {
      map.setZoom(14);
    }
  }, [setSelectedClockedInUserId]);

  const highlightedClockedInUserId =
    selectedClockedInUserId ??
    (Number.isFinite(initialAgentId) ? initialAgentId : null);

  const filteredBusinesses = useMemo(() => {
    if (!locationCtx) return savedLocations;
    return savedLocations.filter((loc) => isInsideLocationContext(loc, locationCtx));
  }, [savedLocations, locationCtx]);

  const filteredBusinessIds = useMemo(() => {
    // When an area context is active, restrict markers — but never hide the focused pin.
    if (!locationCtx) return null;
    const ids = new Set(filteredBusinesses.map((b) => b.id));
    if (focusLocation) ids.add(focusLocation.id);
    return ids;
  }, [locationCtx, filteredBusinesses, focusLocation]);

  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const tasks = useMemo(() => Object.values(liveTasks), [liveTasks]);
  const feedGroups = useMemo(
    () => splitLiveFeedTasks(tasks, nowMs, STALE_MS),
    [tasks, nowMs],
  );
  const mapTasks = useMemo(() => {
    const base = resolveMapTasks(feedGroups.active, feedGroups.history, selectedTaskId);
    return resolvePreferredMapTasks(base, selectedTaskId);
  }, [feedGroups.active, feedGroups.history, selectedTaskId]);
  const trajectoryTaskIds = useMemo(
    () => resolveTrajectoryTaskIds(feedGroups.active, selectedTaskId, followAllActive),
    [feedGroups.active, selectedTaskId, followAllActive],
  );

  const handleSelectTask = useCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    const task = useTrackingStore.getState().liveTasks[taskId];
    const map = mapRef.current;
    if (!task || !map) return;
    const [lng, lat] = task.lastPosition;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    map.panTo({ lat, lng });
    if (map.getZoom() < 15.5) map.setZoom(15.5);
  }, [setSelectedTaskId]);

  const deepLinkTaskIdGoogle = Number.parseInt(searchParams.get('taskId') ?? '', 10);
  useEffect(() => {
    if (!Number.isFinite(deepLinkTaskIdGoogle) || deepLinkTaskIdGoogle <= 0) return;
    const task = liveTasks[deepLinkTaskIdGoogle];
    if (!task || !hasUsableTaskPosition(task)) return;
    if (selectedTaskId === deepLinkTaskIdGoogle) return;
    const timer = setTimeout(() => {
      handleSelectTask(deepLinkTaskIdGoogle);
    }, 0);
    return () => clearTimeout(timer);
  }, [deepLinkTaskIdGoogle, liveTasks, selectedTaskId, handleSelectTask]);

  useEffect(() => {
    if (!Number.isFinite(initialAgentId) || initialAgentId <= 0) return;
    if (Number.isFinite(deepLinkTaskIdGoogle) && deepLinkTaskIdGoogle > 0) return;
    const match = Object.values(liveTasks).find(
      (task) => task.userId === initialAgentId && hasUsableTaskPosition(task),
    );
    if (!match) return;
    if (selectedTaskId === match.taskId) return;
    const timer = setTimeout(() => {
      handleSelectTask(match.taskId);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialAgentId, deepLinkTaskIdGoogle, liveTasks, selectedTaskId, handleSelectTask]);

  const handleViewHistoryTask = useCallback((task: LiveTaskState) => {
    // Route history slide-in disabled — see docs/map-route-history-panel.md
    // setHistoryTask({ id: task.taskId, title: task.taskTitle ?? `Task #${task.taskId}` });
  }, [setHistoryTask]);

  const handleToggleFollowAll = useCallback(() => {
    setFollowAllActive((prev) => {
      if (!prev) {
        setIsFollowing(false);
        followAllLastFitRef.current = 0;
      }
      return !prev;
    });
  }, [setFollowAllActive, setIsFollowing]);

  const handleToggleSelectedFollowGoogle = useCallback(() => {
    const task = selectedTaskId != null ? liveTasks[selectedTaskId] ?? null : null;
    if (!task) return;
    if (isFollowing) {
      setIsFollowing(false);
      return;
    }
    setFollowAllActive(false);
    const map = mapRef.current;
    const [lng, lat] = task.lastPosition;
    if (map && Number.isFinite(lng) && Number.isFinite(lat)) {
      map.panTo({ lat, lng });
      if (map.getZoom() < 15) map.setZoom(15);
    }
    setIsFollowing(true);
  }, [isFollowing, liveTasks, selectedTaskId, setFollowAllActive, setIsFollowing]);

  // Smoothly tween a Google agent marker between GPS fixes (rAF lerp) so
  // movement reads as continuous instead of teleporting on each update.
  const animateGoogleMarkerTo = useCallback(
    (
      taskId: number,
      marker: GoogleMarkerLike,
      target: [number, number],
      motion?: { speedMps?: number | null; headingDegrees?: number | null },
    ) => {
      const current = markerPositionRef.current.get(taskId) ?? target;

      const existingFrame = markerAnimationsRef.current.get(taskId);
      if (existingFrame) {
        cancelAnimationFrame(existingFrame);
        markerAnimationsRef.current.delete(taskId);
      }

      const skipCatchUp = areSamePoint(current, target);
      const speedMps = motion?.speedMps ?? null;
      const headingDegrees = motion?.headingDegrees ?? null;
      const canPredict =
        typeof speedMps === 'number' && speedMps > 0.5 &&
        typeof headingDegrees === 'number' && Number.isFinite(headingDegrees);

      if (skipCatchUp && !canPredict) {
        marker.setPosition({ lat: target[1], lng: target[0] });
        markerPositionRef.current.set(taskId, target);
        return;
      }

      const startedAt = performance.now();
      // Ease to the new fix, then dead-reckon along speed/heading so movement
      // stays continuous until the next fix re-anchors the marker.
      const step = (frameNow: number) => {
        const elapsed = frameNow - startedAt;

        if (!skipCatchUp && elapsed < MARKER_ANIMATION_MS) {
          const progress = elapsed / MARKER_ANIMATION_MS;
          const eased =
            progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

          marker.setPosition({
            lat: current[1] + (target[1] - current[1]) * eased,
            lng: current[0] + (target[0] - current[0]) * eased,
          });
          markerAnimationsRef.current.set(taskId, requestAnimationFrame(step));
          return;
        }

        if (!canPredict || elapsed > MAX_PREDICTION_MS) {
          marker.setPosition({ lat: target[1], lng: target[0] });
          markerPositionRef.current.set(taskId, target);
          markerAnimationsRef.current.delete(taskId);
          return;
        }

        const predictSeconds = (elapsed - (skipCatchUp ? 0 : MARKER_ANIMATION_MS)) / 1000;
        const predicted = projectPosition(target, speedMps, headingDegrees, predictSeconds);
        marker.setPosition({ lat: predicted[1], lng: predicted[0] });
        markerPositionRef.current.set(taskId, predicted);
        markerAnimationsRef.current.set(taskId, requestAnimationFrame(step));
      };

      markerAnimationsRef.current.set(taskId, requestAnimationFrame(step));
    },
    [],
  );
  const hasActiveTaskPositions = useMemo(
    () => tasks.some((task) => hasUsableTaskPosition(task)),
    [tasks]
  );
  const preferUserLocation = !taskFocus;
  const {
    viewport: initialViewport,
    isResolving: isResolvingInitialViewport,
    isUserLocation: initialViewportIsUserLocation,
  } = useInitialMapViewport({ preferUserLocation, taskFocus });
  const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);

  const savedLocationMatches = useMemo(() => {
    if (debouncedMapSearch.length < 2) return [] as SavedLocation[];
    return mapSearchSavedHits.slice(0, 6);
  }, [debouncedMapSearch, mapSearchSavedHits]);

  const handleLocationSelect = useCallback((ctx: LocationContext | null) => {
    setLocationCtx(ctx);
    if (ctx) setLeftTab('businesses');
    if (!ctx || !mapRef.current || !googleRef.current) return;
    if (ctx.bbox) {
      const google = googleRef.current as unknown as { maps: { LatLngBounds: new (sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) => object } };
      const bounds = new google.maps.LatLngBounds(
        { lat: ctx.bbox[1], lng: ctx.bbox[0] },
        { lat: ctx.bbox[3], lng: ctx.bbox[2] }
      );
      mapRef.current.fitBounds(bounds as unknown as GoogleLatLngBoundsLike, 60);
    } else {
      mapRef.current.setCenter({ lat: ctx.center[1], lng: ctx.center[0] });
      mapRef.current.setZoom(13);
    }
  }, [setLeftTab, setLocationCtx]);

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
        // Remove blue dot and previous locate pin, then place a red pin
        userLocationMarkerRef.current?.setMap(null);
        userLocationMarkerRef.current = null;
        locateMePinRef.current?.setMap(null);
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
  }, [locating, setLocating]);

  // ── Fetch businesses when a location is selected (Google primary, Mapbox fallback) ─
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPoiResults([]);
    if (!locationCtx) return;
    // Business-pin display disabled (super-admin master/per-org): skip the
    // billed area search entirely.
    if (!poiDisplayAllowed) return;
    if (locationCtx.bbox && isBboxTooLarge(locationCtx.bbox)) return;

    let cancelled = false;
    setPoiBusy(true);

    fetchPlacesInArea(locationCtx)
      .then((results) => {
        if (!cancelled) { setPoiResults(results); setPoiBusy(false); }
      }).catch(() => { if (!cancelled) setPoiBusy(false); });

    return () => { cancelled = true; setPoiBusy(false); };
  }, [locationCtx, poiDisplayAllowed]);

  // ── Render POI markers on Google Maps ────────────────────────────────────────
  useEffect(() => {
    googlePoiMarkersRef.current.forEach((m) => m.setMap(null));
    googlePoiMarkersRef.current = [];

    if (!googleReady || !mapRef.current || !googleRef.current || poiResults.length === 0) return;

    const maps = googleRef.current as unknown as {
      maps: {
        Marker: new (opts: Record<string, unknown>) => { setMap: (m: unknown) => void };
        SymbolPath: { CIRCLE: unknown };
      };
    };

    googlePoiMarkersRef.current = poiResults.map((poi) => {
      const marker = new maps.maps.Marker({
        position: { lat: poi.lat, lng: poi.lng },
        title: `${poi.name} · ${poi.categoryLabel}`,
        icon: {
          path: maps.maps.SymbolPath.CIRCLE,
          fillColor: poi.categoryColor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8,
        },
        map: mapRef.current,
      });
      return marker;
    });

    return () => {
      googlePoiMarkersRef.current.forEach((m) => m.setMap(null));
      googlePoiMarkersRef.current = [];
    };
  }, [poiResults, googleReady]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !googleApiKey || !initialViewport) {
      return;
    }

    let cancelled = false;

    loadGoogleMapsApi(googleApiKey)
      .then((google) => {
        const googleMaps = google as unknown as GoogleMapsNamespaceLike;

        if (cancelled || !mapContainer.current) {
          return;
        }

        googleRef.current = googleMaps;
        mapRef.current = new googleMaps.maps.Map(mapContainer.current, {
          center: { lat: initialViewport.center[1], lng: initialViewport.center[0] },
          zoom: compact ? Math.max(initialViewport.zoom, 5.4) : initialViewport.zoom,
          disableDefaultUI: compact,
          zoomControl: true,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: compact ? 'none' : 'auto',
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

        setGoogleReady(true);
      })
      .catch(() => {
        // Key/network failures surface through fallback UI.
      });

    return () => {
      cancelled = true;
      setGoogleReady(false);

      markerAnimationsRef.current.forEach((frame) => cancelAnimationFrame(frame));
      markerAnimationsRef.current.clear();
      markerPositionRef.current.clear();

      routeLinesRef.current.forEach((line) => line.setMap(null));
      destinationMarkersRef.current.forEach((marker) => marker.setMap(null));
      agentMarkersRef.current.forEach((marker) => marker.setMap(null));
      userLocationMarkerRef.current?.setMap(null);
      locateMePinRef.current?.setMap(null);
      taskFocusMarkerRef.current?.setMap(null);
      taskFocusMarkerRef.current = null;
      taskFocusSelectedRef.current = false;

      routeLinesRef.current.clear();
      destinationMarkersRef.current.clear();
      agentMarkersRef.current.clear();
      userLocationMarkerRef.current = null;
      locateMePinRef.current = null;
      mapRef.current = null;
      googleRef.current = null;
    };
  }, [compact, googleApiKey, initialViewport, initialViewportIsUserLocation]);

  // Re-evaluate stale status labels periodically.
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);

  // While following a single agent, keep the camera glued to their live position.
  const followedTask = selectedTaskId != null ? liveTasks[selectedTaskId] ?? null : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isFollowing || followAllActive || !followedTask) return;
    const [lng, lat] = followedTask.lastPosition;
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) return;
    map.panTo({ lat, lng });
  }, [isFollowing, followAllActive, followedTask, followedTask?.lastPosition?.[0], followedTask?.lastPosition?.[1]]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || leftTab !== 'clocked-in' || fieldFollowAll || fieldFollowUserId == null) return;
    const agent = fieldLiveAgentsMap[fieldFollowUserId];
    const pos = agent?.lastPosition;
    if (!pos) return;
    map.panTo({ lat: pos[1], lng: pos[0] });
  }, [
    leftTab,
    fieldFollowAll,
    fieldFollowUserId,
    fieldLiveAgentsMap,
    fieldLiveAgentsMap[fieldFollowUserId ?? -1]?.lastPosition?.[0],
    fieldLiveAgentsMap[fieldFollowUserId ?? -1]?.lastPosition?.[1],
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const google = googleRef.current;
    if (!map || !google || leftTab !== 'clocked-in' || !fieldFollowAll || fieldLiveAgents.length === 0) return;

    const now = Date.now();
    if (now - fieldFollowAllLastFitRef.current < 2000) return;
    fieldFollowAllLastFitRef.current = now;

    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    for (const agent of fieldLiveAgents) {
      const pos = agent.lastPosition ?? agent.polyline[agent.polyline.length - 1];
      if (!pos) continue;
      bounds.extend({ lat: pos[1], lng: pos[0] });
      hasPoint = true;
    }
    if (!hasPoint) return;
    map.fitBounds(bounds, 80);
  }, [leftTab, fieldFollowAll, fieldLiveAgents, googleReady]);

  // Follow-all: fit bounds to every actively tracking agent (throttled).
  useEffect(() => {
    const map = mapRef.current;
    const google = googleRef.current;
    if (!map || !google || !followAllActive || feedGroups.active.length === 0) return;

    const now = Date.now();
    if (now - followAllLastFitRef.current < 2000) return;
    followAllLastFitRef.current = now;

    const bounds = new google.maps.LatLngBounds();
    for (const task of feedGroups.active) {
      bounds.extend({ lat: task.lastPosition[1], lng: task.lastPosition[0] });
    }
    map.fitBounds(bounds, 80);
  }, [
    followAllActive,
    feedGroups.active,
    feedGroups.active.map((t) => t.lastPosition.join(',')).join('|'),
    googleReady,
  ]);

  // Break follow mode when the user drags the map manually.
  useEffect(() => {
    const map = mapRef.current;
    const google = googleRef.current;
    if (!map || !google || !googleReady) return;

    const listener = google.maps.event.addListener(map, 'dragstart', () => {
      if (isFollowingRef.current) setIsFollowing(false);
      setFollowAllActive(false);
    });
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [googleReady]);

  // ── Task focus from URL (?taskId&lat&lng): select the live task if it is
  // being tracked, otherwise pin + pan to the task's static destination. ──────
  useEffect(() => {
    const map = mapRef.current;
    const google = googleRef.current;
    if (!map || !google || !googleReady || !taskFocus) return;

    const liveTask = liveTasks[taskFocus.taskId];
    if (liveTask && hasUsableTaskPosition(liveTask)) {
      // Center on the agent without auto-opening the detail card (click-to-open).
      taskFocusMarkerRef.current?.setMap(null);
      taskFocusMarkerRef.current = null;
      if (!taskFocusSelectedRef.current) {
        taskFocusSelectedRef.current = true;
        const [lng, lat] = liveTask.lastPosition;
        map.panTo({ lat, lng });
        if (map.getZoom() < 15.5) map.setZoom(15.5);
      }
      return;
    }

    if (!taskFocusMarkerRef.current) {
      const position = { lat: taskFocus.lat, lng: taskFocus.lng };
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
      map.panTo(position);
      map.setZoom(15);
    }
  }, [taskFocus, liveTasks, googleReady]);

  useEffect(() => {
    if (hasActiveTaskPositions) {
      userLocationMarkerRef.current?.setMap(null);
      userLocationMarkerRef.current = null;
    }
  }, [hasActiveTaskPositions]);

  useEffect(() => {
    const map = mapRef.current;
    const google = googleRef.current;

    if (!map || !google) return;

    const now = Date.now();
    const validTasks = mapTasks.filter((task) => hasUsableTaskPosition(task));
    const validIds = new Set(validTasks.map((task) => task.taskId));
    const destinationIds = new Set<number>();

    validTasks.forEach((task) => {
      const stale = isLiveTaskStale(task, now, STALE_MS);
      const visualState = getVisualState(task, stale);
      const trail = sanitizePolyline(buildTaskTrail(task));
      const showTrajectory = trajectoryTaskIds.has(task.taskId);

      const routeLine = routeLinesRef.current.get(task.taskId);
      if (showTrajectory && trail.length >= 2) {
        if (!routeLine) {
          const line = new google.maps.Polyline({
            map,
            geodesic: true,
            strokeColor: VISUAL_PALETTE[visualState].trail,
            strokeOpacity: 0.92,
            strokeWeight: 4,
          });
          line.setPath(trail.map((point) => ({ lat: point[1], lng: point[0] })));
          routeLinesRef.current.set(task.taskId, line);
        } else {
          routeLine.setOptions({ strokeColor: VISUAL_PALETTE[visualState].trail });
          routeLine.setMap(map);
          routeLine.setPath(trail.map((point) => ({ lat: point[1], lng: point[0] })));
        }
      } else if (routeLine) {
        routeLine.setMap(null);
        routeLinesRef.current.delete(task.taskId);
      }

      const current = task.lastPosition;
      const existingAgentMarker = agentMarkersRef.current.get(task.taskId);
      const initials = getAgentInitials(task.agentName) || 'A';

      if (!existingAgentMarker) {
        const marker = new google.maps.Marker({
          map,
          position: { lat: current[1], lng: current[0] },
          title: `${task.agentName || `Task ${task.taskId}`} - ${getStatusLabel(task.status)}`,
          label: {
            text: initials,
            color: '#FFFFFF',
            fontWeight: '700',
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 11,
            fillColor: VISUAL_PALETTE[visualState].markerBorder,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          },
        });

        if (!compact) {
          marker.addListener('click', () => {
            handleSelectTask(task.taskId);
          });
        }

        agentMarkersRef.current.set(task.taskId, marker);
        markerPositionRef.current.set(task.taskId, current);
      } else {
        animateGoogleMarkerTo(task.taskId, existingAgentMarker, current, {
          speedMps: stale ? null : task.speedMps,
          headingDegrees: stale ? null : resolveHeading(task.headingDegrees ?? null, trail),
        });
        existingAgentMarker.setLabel({
          text: initials,
          color: '#FFFFFF',
          fontWeight: '700',
        });
        existingAgentMarker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: VISUAL_PALETTE[visualState].markerBorder,
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        });
      }

      if (task.destination) {
        destinationIds.add(task.taskId);
        const destinationPoint = { lat: task.destination.lat, lng: task.destination.lng };
        const markerKind = getDestinationMarkerKind(task.status);
        const destinationColor =
          markerKind === 'completed'
            ? '#334155'
            : markerKind === 'arrived'
              ? '#16A34A'
              : markerKind === 'near'
                ? '#D97706'
                : '#DC2626';

        const existingDestinationMarker = destinationMarkersRef.current.get(task.taskId);
        if (!existingDestinationMarker) {
          const marker = new google.maps.Marker({
            map,
            position: destinationPoint,
            title: `Destination - ${task.agentName || `Task ${task.taskId}`}`,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: destinationColor,
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
            },
          });
          destinationMarkersRef.current.set(task.taskId, marker);
        } else {
          existingDestinationMarker.setPosition(destinationPoint);
          existingDestinationMarker.setIcon({
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: destinationColor,
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3,
          });
        }
      }
    });

    routeLinesRef.current.forEach((line, id) => {
      if (!validIds.has(id)) {
        line.setMap(null);
        routeLinesRef.current.delete(id);
      }
    });

    destinationMarkersRef.current.forEach((marker, id) => {
      if (!destinationIds.has(id)) {
        marker.setMap(null);
        destinationMarkersRef.current.delete(id);
      }
    });

    agentMarkersRef.current.forEach((marker, id) => {
      if (!validIds.has(id)) {
        marker.setMap(null);
        agentMarkersRef.current.delete(id);
        const frame = markerAnimationsRef.current.get(id);
        if (frame) {
          cancelAnimationFrame(frame);
          markerAnimationsRef.current.delete(id);
        }
        markerPositionRef.current.delete(id);
      }
    });

    // Cluster agent markers when density is high (mirrors Mapbox Supercluster).
    const agentMarkerList = Array.from(agentMarkersRef.current.values());
    if (agentMarkerList.length >= LIVE_AGENT_CLUSTER_MIN) {
      if (!agentClustererRef.current) {
        agentClustererRef.current = new MarkerClusterer({
          map,
          markers: agentMarkerList,
        } as unknown as GoogleMarkerClustererOptions);
      } else {
        agentClustererRef.current.clearMarkers();
        agentClustererRef.current.addMarkers(
          agentMarkerList as unknown as NonNullable<GoogleMarkerClustererOptions['markers']>,
        );
      }
    } else if (agentClustererRef.current) {
      agentClustererRef.current.clearMarkers();
      (agentClustererRef.current as unknown as GoogleOverlayLike).setMap(null);
      agentClustererRef.current = null;
      agentMarkerList.forEach((marker) => marker.setMap(map));
    }

    overlayCirclesRef.current.forEach((circle) => circle.setMap(null));
    overlayCirclesRef.current = [];
    if (selectedTaskId != null) {
      const selected = validTasks.find((t) => t.taskId === selectedTaskId) ?? liveTasks[selectedTaskId];
      if (selected && hasUsableTaskPosition(selected)) {
        const accuracy = selected.accuracyMeters;
        if (typeof accuracy === 'number' && accuracy > 0 && accuracy < 500) {
          const circle = new google.maps.Circle({
            map,
            center: { lat: selected.lastPosition[1], lng: selected.lastPosition[0] },
            radius: accuracy,
            fillColor: '#3B82F6',
            fillOpacity: 0.12,
            strokeColor: '#3B82F6',
            strokeOpacity: 0.75,
            strokeWeight: 2,
          });
          overlayCirclesRef.current.push(circle);
        }
        const radiusM = selected.destination?.radiusM;
        if (selected.destination && typeof radiusM === 'number' && radiusM > 0) {
          const circle = new google.maps.Circle({
            map,
            center: { lat: selected.destination.lat, lng: selected.destination.lng },
            radius: radiusM,
            fillColor: '#16A34A',
            fillOpacity: 0.12,
            strokeColor: '#16A34A',
            strokeOpacity: 0.75,
            strokeWeight: 2,
          });
          overlayCirclesRef.current.push(circle);
        }
      }
    }
  }, [compact, mapTasks, trajectoryTaskIds, animateGoogleMarkerTo, handleSelectTask, selectedTaskId, liveTasks]);

  const leftSearchResults = useMemo(() => {
    const needle = leftSearchQuery.trim().toLowerCase();
    if (!needle) return null;

    if (leftTab === 'feeds') {
      return tasks
        .filter(
          (task) =>
            task.agentName.toLowerCase().includes(needle) ||
            (task.taskTitle ?? '').toLowerCase().includes(needle) ||
            (task.projectName ?? '').toLowerCase().includes(needle) ||
            (task.taskAddress ?? '').toLowerCase().includes(needle) ||
            String(task.taskId).includes(needle)
        )
        .slice(0, 8);
    }

    if (leftTab === 'clocked-in') {
      return clockedInItems
        .filter((item) => item.agent_name.toLowerCase().includes(needle))
        .slice(0, 8);
    }

    // Businesses tab uses server-side `q` via useInfiniteSavedLocations.
    if (leftTab === 'businesses') {
      return null;
    }

    return null;
  }, [leftSearchQuery, leftTab, tasks, clockedInItems]);

  if (!googleApiKey) {
    if (compact) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#F0F0F0] text-sm text-gray-400">
          Map requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </div>
      );
    }

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

  if (compact) {
    return (
      <div className="w-full h-full relative">
        {/* Mount the live tracking WS + hydration so the home widget updates in real time. */}
        <div className="hidden" aria-hidden="true">
          <HydrationBridge onHydrationChange={setIsInitialHydrating} />
        </div>

        <div ref={mapContainer} className="w-full h-full" />

        <SavedLocationsLayer
          provider="google"
          ready={googleReady}
          getGoogleMap={() =>
            mapRef.current && googleRef.current
              ? ({ map: mapRef.current, maps: googleRef.current } as unknown as GoogleMapBridge)
              : null
          }
          pinMode={false}
          onPinModeChange={() => { }}
          readOnly
        />

        {providerState.fallbackReason === 'missing_mapbox_token' && providerState.requestedProvider === 'mapbox' && (
          <div className="absolute bottom-1 left-1 right-1 rounded bg-black/70 px-2 py-1 text-[9px] font-medium text-white">
            Mapbox token missing. Showing Google fallback.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="hidden" aria-hidden="true">
        <HydrationBridge onHydrationChange={setIsInitialHydrating} />
      </div>

      <TrackingConnectionStatus />

      <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
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

      <div className="absolute top-4 left-4 right-4 md:top-8 md:right-8 md:left-auto md:w-[450px] z-20">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search by places…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white rounded-full py-4 pl-14 pr-6 text-[14px] shadow-2xl shadow-black/5 outline-none font-medium text-dash-dark placeholder:text-gray-400"
          />
        </div>

        {savedLocationMatches.length > 0 && searchQuery.trim().length >= 2 && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-2 py-2 shadow-xl max-h-[50vh] overflow-y-auto">
            <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Saved locations
            </div>
            {savedLocationMatches.map((loc) => (
              <button
                key={`saved-${loc.id}`}
                className="w-full text-left px-3 py-2 rounded-xl text-[12px] text-slate-700 hover:bg-slate-100"
                onClick={() => setFocusLocation({ ...loc })}
              >
                <span className="font-semibold">{loc.name}</span>
                <span className="text-slate-400"> · {getSavedLocationLabel(loc.type)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Left panel — agent/business search + tabs */}
      {!fieldFocusMode && (
      <div className="absolute top-20 left-4 right-4 md:top-8 md:left-8 md:right-auto md:w-[340px] z-20 bg-white rounded-[32px] shadow-2xl shadow-black/10 overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
        {/* Dynamic search filter */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={15} strokeWidth={2} />
            <input
              type="text"
              placeholder={
                leftTab === 'feeds' ? 'Search by agents…' :
                  leftTab === 'clocked-in' ? 'Search by clocked in agents…' :
                    'Search by business…'
              }
              value={leftSearchQuery}
              onChange={(e) => setLeftSearchQuery(e.target.value)}
              className="w-full bg-white rounded-full py-3 pl-10 pr-10 text-[13px] shadow-2xl shadow-black/10 outline-none font-medium text-dash-dark placeholder:text-gray-400 border border-slate-100"
            />
            {leftSearchQuery.length > 0 ? (
              <button
                onClick={() => setLeftSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X size={10} className="text-slate-500" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 shrink-0 mx-4">
          <button
            onClick={() => { setLeftTab('feeds'); setLeftSearchQuery(''); }}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'feeds' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Live Feeds
          </button>
          <button
            onClick={() => { setLeftTab('clocked-in'); setLeftSearchQuery(''); }}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'clocked-in' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Clocked In ({clockedInItems.length})
          </button>
          <button
            onClick={() => { setLeftTab('businesses'); setLeftSearchQuery(''); }}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${leftTab === 'businesses' ? 'text-dash-dark border-b-2 border-dash-dark' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Businesses {locationCtx ? `(${filteredBusinesses.length})` : ''}
          </button>
        </div>

        {leftTab === 'feeds' ? (
          <LiveFeedsPanel
            tasks={tasks}
            nowMs={nowMs}
            selectedTaskId={selectedTaskId}
            isInitialHydrating={isInitialHydrating}
            followAllActive={followAllActive}
            showHistory={showHistoryFeeds}
            searchQuery={leftSearchQuery}
            onToggleHistory={() => setShowHistoryFeeds((prev) => !prev)}
            onToggleFollowAll={handleToggleFollowAll}
            onSelectTask={handleSelectTask}
            onViewHistoryTask={handleViewHistoryTask}
          />
        ) : leftTab === 'clocked-in' ? (
          <ClockedInPanel
            items={leftSearchResults && Array.isArray(leftSearchResults) ? (leftSearchResults as typeof clockedInItems) : clockedInItems}
            isLoading={clockedInLoading}
            selectedUserId={highlightedClockedInUserId}
            onSelect={handleClockedInSelect}
            followAllActive={fieldFollowAll}
            focusMode={fieldFocusMode}
            onFollowSelected={() => {
              if (highlightedClockedInUserId != null) {
                setFieldFollowUserId(highlightedClockedInUserId);
              }
            }}
            onToggleFollowAll={() => setFieldFollowAll(!fieldFollowAll)}
            onToggleFocusMode={() => setFieldFocusMode(!fieldFocusMode)}
          />
        ) : (
          <BusinessListPanel
            activeLocation={locationCtx}
            pois={poiResults}
            poiBusy={poiBusy}
            savedLocations={savedLocations}
            savedLocationsLoading={savedLocationsLoading}
            savedLocationsTotal={savedLocationsTotal}
            hasNextSavedPage={Boolean(hasNextSavedPage)}
            isFetchingNextSavedPage={isFetchingNextSavedPage}
            onLoadMoreSaved={() => {
              if (hasNextSavedPage && !isFetchingNextSavedPage) {
                void fetchNextSavedPage();
              }
            }}
            onPoiClick={(p) => {
              mapRef.current?.panTo({ lat: p.lat, lng: p.lng });
              if ((mapRef.current?.getZoom() ?? 0) < 17) mapRef.current?.setZoom(17);
            }}
            onSavedClick={(b) => {
              setFocusLocation(b);
              mapRef.current?.panTo({ lat: b.latitude, lng: b.longitude });
              if ((mapRef.current?.getZoom() ?? 0) < 17) mapRef.current?.setZoom(17);
            }}
          />
        )}
      </div>
      )}

      {fieldFocusMode && (
        <button
          type="button"
          onClick={() => setFieldFocusMode(false)}
          className="absolute top-20 left-4 z-30 inline-flex items-center gap-2 rounded-full bg-[#0A192F] px-4 py-2 text-[12px] font-semibold text-white shadow-lg"
        >
          Exit focus
        </button>
      )}

      {showBusinessPins && (
        <SavedLocationsLayer
          provider="google"
          ready={googleReady}
          getGoogleMap={() =>
            mapRef.current && googleRef.current
              ? ({ map: mapRef.current, maps: googleRef.current } as unknown as GoogleMapBridge)
              : null
          }
          pinMode={pinMode}
          onPinModeChange={setPinMode}
          focusLocation={focusLocation}
          extraLocations={savedLocationMatches}
          visibleIds={filteredBusinessIds}
        />
      )}

      {(leftTab === 'clocked-in' || compact) && clockedInItems.length > 0 && (
        <ClockedInLayer
          provider="google"
          ready={googleReady}
          items={clockedInItems}
          selectedUserId={highlightedClockedInUserId}
          onSelectUserId={setSelectedClockedInUserId}
          getGoogleMap={() =>
            mapRef.current && googleRef.current
              ? ({ map: mapRef.current, maps: googleRef.current } as unknown as GoogleMapBridge)
              : null
          }
        />
      )}

      {(leftTab === 'clocked-in' || compact) && (
        <FieldActivityLiveLayer
          provider="google"
          ready={googleReady}
          agents={fieldLiveAgents}
          selectedUserId={highlightedClockedInUserId}
          followAll={fieldFollowAll}
          getGoogleMap={() =>
            mapRef.current && googleRef.current
              ? ({ map: mapRef.current, maps: googleRef.current } as unknown as GoogleMapBridge)
              : null
          }
        />
      )}

      <TerritoryLayer
        variant="admin"
        provider="google"
        ready={googleReady}
        getGoogleMap={() => (mapRef.current ? { map: mapRef.current } : null)}
        toggleClassName="absolute bottom-6 left-4 z-30 flex flex-col-reverse items-start gap-2"
      />

      {/* Route history slide-in disabled — see docs/map-route-history-panel.md
      {historyTask && (
        <RouteHistoryPanel
          taskId={historyTask.id}
          taskTitle={historyTask.title}
          onClose={() => setHistoryTask(null)}
        />
      )}
      */}

      {/* Map controls — bottom-center, clear of the AI FAB at bottom-right */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        {followedTask && (
          <button
            onClick={handleToggleSelectedFollowGoogle}
            className={`h-10 rounded-full backdrop-blur shadow-lg border px-4 flex items-center gap-2 text-[12px] font-semibold active:scale-95 transition-all ${isFollowing
              ? 'bg-[#0A192F] text-white border-[#0A192F]'
              : 'bg-white/95 text-dash-dark border-slate-200 hover:bg-slate-50'
              }`}
          >
            <LocateFixed size={16} />
            {isFollowing ? `Following ${followedTask.agentName || 'agent'} — Stop` : 'Follow agent'}
          </button>
        )}
        <button
          onClick={() => setShowBusinessPins((visible) => !visible)}
          title={showBusinessPins ? 'Hide business pins' : 'Show business pins'}
          className="h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 px-4 flex items-center gap-2 text-[12px] font-semibold text-dash-dark hover:bg-slate-50 active:scale-95 transition-all"
        >
          {showBusinessPins ? <EyeOff size={16} /> : <Eye size={16} />}
          {showBusinessPins ? 'Hide Pins' : 'Show Pins'}
        </button>

        <button
          onClick={handleLocateMe}
          disabled={locating}
          title="Center on my location"
          className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 flex items-center justify-center text-dash-teal hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <LocateFixed size={18} className={locating ? 'animate-pulse' : ''} />
        </button>
      </div>

      {providerState.fallbackReason === 'missing_mapbox_token' && providerState.requestedProvider === 'mapbox' && (
        <div className="absolute bottom-3 left-3 right-3 md:left-8 md:right-auto md:w-[420px] z-20 rounded-md bg-black/75 px-3 py-2 text-[11px] font-medium text-white">
          Mapbox is selected by admin, but NEXT_PUBLIC_MAPBOX_TOKEN is missing. Showing Google fallback.
        </div>
      )}
    </div>
  );
}

export function MapView(props: MapViewProps) {
  const providerState = useEffectiveMapProvider();

  if (providerState.effectiveProvider === 'google') {
    return <GoogleMapView {...props} providerState={providerState} />;
  }

  return <MapboxMapView {...props} providerState={providerState} />;
}

function HydrationBridge({
  onHydrationChange,
}: {
  onHydrationChange: (isHydrating: boolean) => void;
}) {
  // WS lives in dashboard layout (GlobalTrackingWsBridge). Map only mirrors hydrate state.
  const isInitialHydrating = useTrackingStore((s) => s.isInitialHydrating);

  useEffect(() => {
    onHydrationChange(isInitialHydrating);
  }, [isInitialHydrating, onHydrationChange]);

  return null;
}
