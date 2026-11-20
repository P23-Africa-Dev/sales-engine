'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type LayerSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import Link from 'next/link';
import { useDemoAgentAnimation } from '@/hooks/use-demo-agent-animation';
import { createGreenStreetStyle } from '@/lib/map/green-street-style';
import { MapExploreControls } from './map-explore-controls';
import { Search, X } from 'lucide-react';
import {
  DEMO_COLORS, DEMO_MARKETS, DEMO_WEEKS, getDemoCompanies, getDemoCoverage, getDemoTerritories, getDemoVisits, getDemoAgents, getDemoAgentPosition, getDemoActivities, getDemoAgentTelemetry, isWorkingDemoAgent,
  type Coordinate, type DemoMarket, type DemoTerritory,
} from '@/lib/map/factory-demo';

const button = 'rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-dash-dark shadow-sm hover:bg-slate-50';
const mapControlClass = 'flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white/95 px-3 text-xs font-semibold text-dash-dark shadow-sm transition-colors hover:bg-slate-50 aria-pressed:border-teal-300 aria-pressed:bg-teal-50 aria-pressed:text-teal-800';
const field = 'w-full text-dash-dark rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm';

const territoryOptions = [
  ['off', 'Off'], ['boundaries', 'Assigned boundaries'], ['footprints', 'Agent coverage'],
  ['compare', 'Compare zones'], ['health', 'Coverage level'],
] as const;
const signalOptions = [
  ['all', 'All companies'], ['signals', 'Any signal'], ['Expansion announced', 'Expansion'], ['Hiring sales staff', 'Hiring'],
] as const;


function useSource(map: maplibregl.Map | null, id: string, data: FeatureCollection) {
  useEffect(() => {
    if (map?.style) map.getSource<GeoJSONSource>(id)?.setData(data);
  }, [map, id, data]);
}

function collection<T extends GeoJSON.Geometry>(features: GeoJSON.Feature<T>[]): FeatureCollection<T> {
  return { type: 'FeatureCollection', features };
}

function point(coordinates: Coordinate, properties: GeoJSON.GeoJsonProperties) {
  return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates }, properties };
}

export function FactoryDemoMap({ market, companyId }: { market: DemoMarket; companyId?: number }) {
  const { agents, center, city, name } = DEMO_MARKETS[market];
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [mapError, setMapError] = useState('');
  const [openControls, setOpenControls] = useState<'layers' | 'filters' | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'activity' | 'territories' | 'history' | 'heat' | null>('activity');
  const [activityTab, setActivityTab] = useState<'feeds' | 'clocked-in' | 'businesses'>('feeds');
  const [activitySearch, setActivitySearch] = useState('');
  const [showPins, setShowPins] = useState(true);
  const [clusterCompanies, setClusterCompanies] = useState(false);
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [signal, setSignal] = useState('all');
  const [heat, setHeat] = useState(false);
  const [territoryMode, setTerritoryMode] = useState('off');
  const [showVisits, setShowVisits] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const [territories, setTerritories] = useState(() => getDemoTerritories(market));
  const coverageByTerritory = useMemo(() => new Map(territories.map((territory) => [territory.id, getDemoCoverage(territory, market)])), [territories, market]);
  const [editing, setEditing] = useState<DemoTerritory | null>(null);
  const [overviewVersion, setOverviewVersion] = useState(0);
  const stopFollowing = () => { setFollow(null); setOverviewVersion((value) => value + 1); };
  const [follow, setFollow] = useState<number | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const simulationStart = useRef<number | null>(null);
  const elapsed = useCallback(() => simulationStart.current === null ? 0 : (performance.now() - simulationStart.current) / 1000, []);
  const [liveRecords, setLiveRecords] = useState<ReturnType<typeof getDemoActivities>>([]);
  const arrivalLegs = useRef(new Map<number, number>());
  const simulationDate = useRef<string | null>(null);
  const profiles = useMemo(() => getDemoAgents(market), [market]);
  const seededActivities = useMemo(() => getDemoActivities(market), [market]);
  const activities = useMemo(() => [...liveRecords, ...seededActivities], [liveRecords, seededActivities]);
  const [historyAgent, setHistoryAgent] = useState('all');
  const [historyDate, setHistoryDate] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState<number | undefined>(companyId);
  useEffect(() => {
    if (!openControls) return;
    const dismiss = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setOpenControls(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        controlsRef.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus();
        setOpenControls(null);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [openControls]);

  const companies = useMemo(() => getDemoCompanies(market), [market]);
  const visits = useMemo(() => getDemoVisits(market), [market]);
  const currentVisits = useMemo(() => visits.filter((visit) => visit.week === DEMO_WEEKS[0] && visit.outcome !== 'Rescheduled'), [visits]);
  const routes = useMemo(() => profiles.map((agent) => agent.route), [profiles]);
  const positions = profiles.map((agent) => getDemoAgentTelemetry(agent, tick));

  useEffect(() => {
    simulationStart.current ??= performance.now();
    simulationDate.current ??= new Date().toISOString();
    const timer = window.setInterval(() => setTick(elapsed()), 1000);
    return () => window.clearInterval(timer);
  }, [elapsed]);

  useEffect(() => {
    const arrivals: ReturnType<typeof getDemoActivities> = [];
    profiles.forEach((agent) => {
      if (!isWorkingDemoAgent(agent)) return;
      const state = getDemoAgentTelemetry(agent, tick);
      const key = `${agent.id}-${state.leg}`;
      if (!state.arrived || arrivalLegs.current.get(agent.id) === state.leg) return;
      arrivalLegs.current.set(agent.id, state.leg);
      arrivals.push({ id: `sim-${key}`, agent: agent.id, agentName: agent.name, type: 'Check-in', location: state.destination.name,
        coordinates: state.coordinates, date: new Date(Date.parse(simulationDate.current!) + tick * 1000).toISOString(), status: 'Completed',
        territory: agent.territory.name, companyId: state.destination.id });
    });
    if (arrivals.length) setLiveRecords((previous) => [...arrivals, ...previous].slice(0, 200));
  }, [tick, profiles]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`factory-map-territories-v2-${market}`);
      if (stored) setTerritories(JSON.parse(stored));
    } catch {
      // Keep seeded territories if local storage is unavailable.
    }
  }, [market]);

  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: container.current, center: [center[0], center[1]], zoom: 13.2,
        style: createGreenStreetStyle(),
      });
    } catch {
      setMapError('The map could not start. A browser with WebGL is required.');
      return;
    }
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.on('load', () => {
      for (const id of ['territories', 'routes', 'visits', 'agents', 'coverage', 'density', 'follow-route', 'remaining-route', 'destination']) {
        instance.addSource(id, { type: 'geojson', data: collection([]) });
      }
      instance.addSource('company-points', { type: 'geojson', data: collection([]) });
      instance.addSource('companies', { type: 'geojson', data: collection([]), cluster: true, clusterRadius: 43, clusterMaxZoom: 15 });
      instance.addLayer({ id: 'zones', source: 'territories', type: 'fill', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'], 'fill-outline-color': ['get', 'color'] } });
      instance.addLayer({ id: 'coverage', source: 'coverage', type: 'circle', paint: {
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, 12, 15, 384],
        'circle-color': ['get', 'color'], 'circle-opacity': 0.16,
      } });
      instance.addLayer({ id: 'heat', source: 'density', type: 'heatmap', paint: { 'heatmap-radius': 38, 'heatmap-intensity': 1.5, 'heatmap-opacity': 0.8 } });
      instance.addLayer({ id: 'routes', source: 'routes', type: 'line', paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.75 } });
      instance.addLayer({ id: 'clusters', source: 'companies', type: 'circle', filter: ['has', 'point_count'], paint: { 'circle-radius': 16, 'circle-color': '#084b5d', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      instance.addLayer({ id: 'cluster-labels', source: 'companies', type: 'symbol', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Regular'], 'text-size': 12 }, paint: { 'text-color': '#fff' } });
      instance.addLayer({ id: 'company-pin', source: 'company-points', type: 'circle', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': ['case', ['get', 'signal'], 7, 5], 'circle-color': ['case', ['get', 'signal'], '#c36a15', '#204e60'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      instance.addLayer({
        id: 'company-label', type: 'symbol', source: 'company-points', minzoom: 14,
        filter: ['!', ['has', 'point_count']],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Regular'], 'text-size': 12, 'text-anchor': 'bottom', 'text-offset': [0, -0.8] },
        paint: { 'text-color': '#0f172a', 'text-halo-color': '#fff', 'text-halo-width': 2.5 },
      });
      for (const id of ['company-pin', 'company-label']) {
        const layer = instance.getLayer(id)?.serialize();
        if (layer) instance.addLayer({ ...layer, id: `clustered-${id}`, source: 'companies' } as LayerSpecification);
      }
      instance.addLayer({ id: 'visit-pin', source: 'visits', type: 'circle', paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      instance.addLayer({ id: 'follow-route', source: 'follow-route', type: 'line', paint: { 'line-color': '#0f766e', 'line-width': 6, 'line-opacity': 0.35 } });
      instance.addLayer({ id: 'remaining-route', source: 'remaining-route', type: 'line', paint: { 'line-color': '#0f766e', 'line-width': 5 } });
      instance.addLayer({ id: 'destination', source: 'destination', type: 'circle', paint: { 'circle-radius': 11, 'circle-color': '#fbbf24', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      instance.addLayer({ id: 'destination-label', source: 'destination', type: 'symbol', layout: { 'text-field': 'Destination', 'text-font': ['Open Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.8], 'text-allow-overlap': true }, paint: { 'text-color': '#0f172a', 'text-halo-color': '#fff', 'text-halo-width': 2 } });
      instance.on('dragstart', () => setFollow(null));
      for (const layer of ['company-pin', 'company-label', 'clustered-company-pin', 'clustered-company-label']) {
        instance.on('click', layer, ({ features }) => {
          if (features?.length) setSelectedCompany(Number(features[0].properties.id));
        });
      }
      instance.on('click', 'visit-pin', ({ features }) => {
        if (features?.length) setSelectedCompany(Number(features[0].properties.company));
      });
      instance.on('click', 'clusters', ({ features }) => {
        if (!features?.length) return;
        const cluster = features[0];
        void instance.getSource<GeoJSONSource>('companies')?.getClusterExpansionZoom(cluster.properties.cluster_id)
          .then((zoom) => instance.easeTo({ center: (cluster.geometry as Point).coordinates as Coordinate, zoom }))
          .catch(() => {});
      });
      for (const layer of ['clusters', 'company-pin', 'company-label', 'clustered-company-pin', 'clustered-company-label', 'visit-pin']) {
        instance.on('mouseenter', layer, () => { instance.getCanvas().style.cursor = 'pointer'; });
        instance.on('mouseleave', layer, () => { instance.getCanvas().style.cursor = ''; });
      }
      const bounds = new maplibregl.LngLatBounds();
      profiles.filter(isWorkingDemoAgent).forEach((agent) => bounds.extend(agent.route[0]));
      instance.fitBounds(bounds, { duration: 0, maxZoom: 13.2, padding: window.innerWidth >= 768 ? { left: 390, right: 90, top: 110, bottom: 130 } : 80 });
      setMap(instance);
    });
    return () => instance.remove();
  }, [center, profiles]);

  const companyData = useMemo(() => collection(companies
    .filter((company) => signal === 'all' || (signal === 'signals' ? company.signal : company.signal === signal))
    .map((company) => point(company.coordinates, { id: company.id, name: company.name, signal: Boolean(company.signal) }))), [companies, signal]);
  const visitData = useMemo(() => collection(currentVisits.map((visit) => point(visit.company.coordinates, {
    company: visit.company.id, color: DEMO_COLORS[visit.agent],
  }))), [currentVisits]);
  const territoryData = useMemo(() => collection(territoryMode === 'off' || territoryMode === 'footprints' ? [] : territories.map((territory) => {
    const [west, south, east, north] = territory.bounds;
    const coverage = coverageByTerritory.get(territory.id) ?? 0;
    const color = territoryMode === 'health' ? (coverage >= 25 ? '#159263' : coverage >= 12 ? '#d58a19' : '#c84950') : DEMO_COLORS[territory.agent];
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
      properties: { color, opacity: territoryMode === 'health' ? 0.3 : 0.13 } };
  })), [territories, territoryMode, coverageByTerritory]);
  const historyRoutes = useMemo(() => profiles.map((agent) => activities.filter((activity) => activity.agent === agent.id && (historyAgent === 'all' || agent.id === Number(historyAgent)) && (historyDate === 'all' || activity.date.startsWith(historyDate))).slice().reverse().map((activity) => activity.coordinates)), [profiles, activities, historyAgent, historyDate]);
  const visibleRoutes = panel === 'history' ? historyRoutes : routes;
  const routeData = useMemo(() => collection(visibleRoutes.flatMap((route, agent) => route.length < 2 ? [] : [{
    type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: route }, properties: { color: DEMO_COLORS[agent] },
  }])), [visibleRoutes]);
  const coverageData = useMemo(() => collection(territoryMode === 'footprints' || territoryMode === 'compare'
    ? currentVisits.map((visit) => point(visit.company.coordinates, { color: DEMO_COLORS[visit.agent] }))
    : []), [territoryMode, currentVisits]);
  const densityTick = Math.floor(tick / 5) * 5;
  const densityData = useMemo(() => collection([...activities.map((activity) => point(activity.coordinates, {})), ...profiles.map((agent) => point(getDemoAgentPosition(agent, densityTick), {}))]), [activities, profiles, densityTick]);
  useSource(map, 'density', densityData);
  useSource(map, 'coverage', coverageData);
  useSource(map, 'companies', companyData);
  useSource(map, 'company-points', companyData);
  useSource(map, 'visits', visitData);
  useSource(map, 'territories', territoryData);
  useSource(map, 'routes', routeData);

  useEffect(() => {
    if (!map?.style) return;
    map.setLayoutProperty('heat', 'visibility', heat ? 'visible' : 'none');
    map.setLayoutProperty('visit-pin', 'visibility', showVisits ? 'visible' : 'none');
    map.setLayoutProperty('routes', 'visibility', showRoutes ? 'visible' : 'none');
    for (const layer of ['company-pin', 'company-label']) {
      map.setLayoutProperty(layer, 'visibility', showPins && !clusterCompanies ? 'visible' : 'none');
    }
    for (const layer of ['clusters', 'cluster-labels', 'clustered-company-pin', 'clustered-company-label']) {
      map.setLayoutProperty(layer, 'visibility', showPins && clusterCompanies ? 'visible' : 'none');
    }
  }, [map, heat, showVisits, showRoutes, showPins, clusterCompanies]);

  const followed = follow === null ? null : positions[follow];
  const lineData = (coordinates: Coordinate[]): FeatureCollection => collection(coordinates.length > 1 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }] : []);
  useSource(map, 'follow-route', lineData(followed?.route ?? []));
  useSource(map, 'remaining-route', lineData(followed?.remainingRoute ?? []));
  useSource(map, 'destination', collection(followed ? [point(followed.destinationCoordinates, {})] : []));
  useDemoAgentAnimation({ map, agents: profiles, elapsed, selected: selectedAgent, follow, overviewVersion,
    onSelect: (id) => { setSelectedAgent(id); setSelectedCompany(undefined); setPanel('activity'); setFollow(id); } });

  useEffect(() => {
    if (companyId === undefined || !companies[companyId]) return;
    setSelectedCompany(companyId);
    setFollow(null);
    if (map?.style) map.flyTo({ center: companies[companyId].coordinates, zoom: 16 });
  }, [map, companyId, companies]);

  const matches = query.trim().length < 2 ? [] : companies.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);
  const company = selectedCompany === undefined ? undefined : companies[selectedCompany];
  const selectAgent = (id: number) => {
    setSelectedAgent(id); setSelectedCompany(undefined); setFollow(id);
  };
  const selectCompany = (id: number) => {
    setSelectedAgent(null);
    setFollow(null);
    setSelectedCompany(id);
    map?.flyTo({ center: companies[id].coordinates, zoom: 16 });
  };

  return (
    <section aria-label={`${name} map`} className="relative isolate h-[calc(100dvh-7.25rem)] min-h-[32rem] bg-[#e6efeb]">
      <div className="absolute inset-x-0 top-0 z-20 px-3 py-2 text-dash-dark">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <nav aria-label="Map views" className="flex max-w-full gap-1 overflow-x-auto">
            {([['heat', 'Heatmaps'], ['territories', 'Territory Mapping'], ['history', 'History']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={panel === id} className={`${mapControlClass} ${panel === id ? 'bg-teal-50 text-teal-800' : ''}`} onClick={() => {
              setPanel(panel === id ? 'activity' : id); setHeat(id === 'heat' && panel !== id);
              setTerritoryMode(id === 'territories' && panel !== id ? 'boundaries' : 'off');
              setShowRoutes(id === 'history' && panel !== id); setShowVisits(id === 'history' && panel !== id);
            }}>{label}</button>)}
          </nav>
          <p className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-teal-800">Simulated demo · Road routes © OpenStreetMap / OSRM</p>
        </div>
      </div>
      <div className="absolute inset-0"><div ref={container} className="h-full w-full" /></div>
      {mapError && <p role="alert" className="absolute inset-x-4 top-24 rounded-xl bg-white p-4">{mapError}</p>}
      <div className="absolute right-4 top-28 z-20 w-[min(300px,calc(100%-2rem))] md:right-8 md:top-20 xl:w-[340px]">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input aria-label="Search by places" placeholder="Search by places…" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-full bg-white py-4 pl-14 pr-6 text-sm font-medium text-dash-dark shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-teal-600" />
        </div>
        {query.trim().length >= 2 && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2 text-sm text-dash-dark shadow-md">
            {matches.length ? matches.map((item) => <button type="button" key={item.id} className="block w-full rounded-xl px-3 py-2 text-left text-dash-dark hover:bg-slate-50" onClick={() => { selectCompany(item.id); setQuery(''); }}>{item.name}</button>) : <p className="px-3 py-2">No matching companies</p>}
          </div>
        )}
      </div>
      {panel && <aside className="absolute bottom-36 left-4 top-44 z-10 md:top-20 w-[min(340px,calc(100%-2rem))] overflow-y-auto rounded-[32px] border border-slate-100 bg-white p-4 text-dash-dark shadow-2xl md:left-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-dash-dark">{panel === 'activity' ? 'Agent activity' : panel === 'history' ? 'Activity history' : panel === 'heat' ? 'Activity density' : 'Territories'}</h2>
          <button type="button" className="text-slate-600" aria-label="Close panel" onClick={() => setPanel(null)}><X size={18} /></button>
        </div>
        {panel === 'heat' ? <div className="space-y-4 text-sm">
          <p>Density from {activities.length} recorded activities and 20 simulated agent locations.</p>
          <div className="h-3 rounded-full bg-gradient-to-r from-blue-200 via-yellow-300 to-red-600" /><p className="flex justify-between text-xs"><span>Lower activity</span><span>Higher activity</span></p>
          <p>Activity period: {DEMO_WEEKS[0]} – 2026-11-20. Live positions refresh throughout the simulation.</p>
          <button className={button} onClick={() => setPanel('activity')}>View agents</button>
        </div> : panel === 'history' ? <>
          <label className="block text-xs">Agent<select aria-label="History agent" className={field} value={historyAgent} onChange={(event) => setHistoryAgent(event.target.value)}><option value="all">All agents</option>{profiles.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
          <label className="my-3 block text-xs">Date<select aria-label="History date" className={field} value={historyDate} onChange={(event) => setHistoryDate(event.target.value)}><option value="all">All dates</option>{Array.from(new Set(activities.map((activity) => activity.date.slice(0, 10)))).map((date) => <option key={date}>{date}</option>)}</select></label>
          <p className="text-xs text-slate-500">{activities.length} simulated records · Select a record to view its location. Lines connect recorded activity locations in time order.</p>
          {activities.filter((activity) => (historyAgent === 'all' || activity.agent === Number(historyAgent)) && (historyDate === 'all' || activity.date.startsWith(historyDate))).map((activity) => <button type="button" key={activity.id} className="block w-full border-b border-slate-100 py-3 text-left text-sm" onClick={() => selectCompany(activity.companyId)}>
            <span className="block font-semibold">{activity.agentName} · {activity.type}</span><span className="block text-xs">{activity.location} · {activity.territory}</span><span className="text-xs text-slate-500">{new Date(activity.date).toLocaleString('en-GB', { timeZone: market === 'ghana' ? 'Africa/Accra' : 'Africa/Nairobi' })} · {activity.status}</span>
          </button>)}
          {!activities.some((activity) => (historyAgent === 'all' || activity.agent === Number(historyAgent)) && (historyDate === 'all' || activity.date.startsWith(historyDate))) && <p className="py-4 text-sm">No records match these filters. Select all dates or agents.</p>}
        </> : panel === 'activity' ? <>
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input aria-label="Search activity" placeholder={activityTab === 'businesses' ? 'Search by business…' : 'Search by agents…'} value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} className="w-full rounded-full border border-slate-100 bg-white py-2.5 pl-9 pr-3 text-sm text-dash-dark" />
          </div>
          <nav aria-label="Field activity" className="mb-3 flex border-b border-slate-100">
            {([['feeds', 'Live Feeds'], ['clocked-in', `Clocked In (${profiles.filter((agent) => agent.status !== 'Offline').length})`], ['businesses', 'Businesses']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-current={activityTab === id ? 'page' : undefined} onClick={() => { setActivityTab(id); setActivitySearch(''); }} className={`flex-1 border-b-2 py-3 text-xs font-semibold ${activityTab === id ? 'border-dash-dark text-dash-dark' : 'border-transparent text-slate-400'}`}>{label}</button>
            ))}
          </nav>
          {activityTab === 'businesses' ? companies.filter((item) => item.name.toLowerCase().includes(activitySearch.toLowerCase())).map((item) => (
            <button key={item.id} type="button" onClick={() => selectCompany(item.id)} className="block w-full border-b border-slate-100 py-3 text-left text-sm text-dash-dark">
              <span className="block font-semibold">{item.name}</span><span className="text-xs text-slate-500">{item.signal || city}</span>
            </button>
          )) : <>
          <p className="mb-3 text-xs font-semibold text-emerald-700">{positions.filter((agent) => agent.status === 'Moving').length} moving · {positions.filter((agent) => agent.arrived).length} at visits · {profiles.filter(isWorkingDemoAgent).length} on duty </p>
          {profiles.filter((agent) => agent.name.toLowerCase().includes(activitySearch.toLowerCase()) && (activityTab !== 'clocked-in' || agent.status !== 'Offline')).map((agent) => <button type="button" key={agent.id} aria-pressed={selectedAgent === agent.id} onClick={() => selectAgent(agent.id)} className={`mb-2 flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${selectedAgent === agent.id ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50'}`}>
            <span style={{ backgroundColor: agent.status === 'Offline' ? '#64748b' : DEMO_COLORS[agent.id] }} className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{agent.initials}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-bold">{agent.name}</span><span className="block text-xs text-slate-600">{positions[agent.id].status} · {agent.territory.name}</span><span className="block text-xs text-slate-500">{positions[agent.id].activity}</span></span>
          </button>)}
          {activityTab === 'feeds' && <><h3 className="mt-5 text-sm font-semibold text-dash-dark">Recorded visits this week</h3>
          {liveRecords.filter((activity) => activity.agentName.toLowerCase().includes(activitySearch.toLowerCase())).map((activity) => <button type="button" key={activity.id} className="block w-full border-b border-teal-100 py-2 text-left text-sm" onClick={() => selectAgent(activity.agent)}><span className="block font-medium">{activity.agentName} · Customer check-in</span><span className="text-xs text-slate-600">{activity.location} · {new Date(activity.date).toLocaleTimeString('en-GB')} · Completed</span></button>)}
          {currentVisits.filter((visit) => agents[visit.agent].toLowerCase().includes(activitySearch.toLowerCase())).slice().reverse().map((visit) => <button type="button" key={visit.id} className="block w-full border-b border-slate-100 py-2 text-left text-sm text-dash-dark hover:bg-slate-50" onClick={() => selectCompany(visit.company.id)}>
            <span className="block font-medium">{visit.company.name}</span>
            <span className="text-xs text-slate-600">{agents[visit.agent]} · {visit.outcome} · {visit.duration} min</span>
          </button>)}</>}
          </>}
        </> : editing ? <form key={editing.id} className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const bounds = ['West', 'South', 'East', 'North'].map((edge) => Number(data.get(edge))) as DemoTerritory['bounds'];
          const error = form.querySelector<HTMLParagraphElement>('[role="alert"]');
          const territoryName = String(data.get('name')).trim();
          if (!territoryName || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
            if (error) error.textContent = 'Enter a name and make sure west is below east and south is below north.';
            return;
          }
          const next = [...territories.filter((territory) => territory.id !== editing.id), { ...editing, name: territoryName, agent: Number(data.get('agent')), bounds }].sort((a, b) => a.id - b.id);
          try {
            window.localStorage.setItem(`factory-map-territories-v2-${market}`, JSON.stringify(next));
          } catch {
            if (error) error.textContent = 'The territory could not be saved in this browser.';
            return;
          }
          setTerritories(next);
          setEditing(null);
        }}>
          <label className="block text-sm">Territory name<input name="name" required className={field} defaultValue={editing.name} /></label>
          <label className="block text-sm">Assigned agent<select name="agent" className={field} defaultValue={editing.agent}>{agents.map((agent, index) => <option key={agent} value={index}>{agent}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2">{['West', 'South', 'East', 'North'].map((edge, index) => <label key={edge} className="text-xs">{edge} boundary
            <input name={edge} className={field} required type="number" step="any" min={index % 2 ? -90 : -180} max={index % 2 ? 90 : 180} defaultValue={Number(editing.bounds[index].toFixed(6))} />
          </label>)}</div>
          <p role="alert" className="text-xs text-red-700" />
          <div className="flex gap-2"><button className={button}>Save territory</button><button type="button" className={button} onClick={() => setEditing(null)}>Cancel</button></div>
        </form> : <>
          <button type="button" className={button} onClick={() => setEditing({ id: Math.max(-1, ...territories.map((item) => item.id)) + 1, name: '', agent: 0, bounds: [center[0] - 0.01, center[1] - 0.01, center[0] + 0.01, center[1] + 0.01] })}>Create territory</button>
          {territories.map((territory) => <button key={territory.id} type="button" className="block w-full border-b border-slate-100 py-3 text-left text-sm text-dash-dark hover:bg-slate-50" onClick={() => { setEditing(territory); setFollow(null); map?.fitBounds([[territory.bounds[0], territory.bounds[1]], [territory.bounds[2], territory.bounds[3]]], { padding: 70 }); }}>
            <span className="block font-semibold">{territory.name}</span><span className="text-slate-600">{agents[territory.agent]} · {coverageByTerritory.get(territory.id)}% covered</span>
          </button>)}
        </>}
      </aside>}
      <div ref={controlsRef} className="absolute inset-x-2 bottom-6 z-30 flex flex-wrap items-center justify-center gap-2">
        <div className="relative">
          <button type="button" aria-expanded={openControls === 'layers'} aria-controls="map-layers-panel" className={mapControlClass} onClick={() => setOpenControls(openControls === 'layers' ? null : 'layers')}>Layers</button>
          {openControls === 'layers' && (
            <div id="map-layers-panel" role="group" aria-label="Activity and map layers" className="absolute bottom-full left-0 mb-3 w-56 space-y-1 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-dash-dark shadow-xl">
              <button type="button" className="flex w-full items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50" aria-pressed={panel === 'activity'} onClick={() => { setPanel(panel === 'activity' ? null : 'activity'); setOpenControls(null); }}>Activity <span>{panel === 'activity' ? 'On' : 'Off'}</span></button>
              <label className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50">Heat map<input type="checkbox" checked={heat} onChange={(event) => setHeat(event.target.checked)} /></label>
              <label className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50">Recorded visits<input type="checkbox" checked={showVisits} onChange={(event) => setShowVisits(event.target.checked)} /></label>
              <label className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-50">Agent routes<input type="checkbox" checked={showRoutes} onChange={(event) => setShowRoutes(event.target.checked)} /></label>
            </div>
          )}
        </div>
      <MapExploreControls
        className="flex shrink-0 items-center gap-1 [&_button]:px-2 sm:gap-2 sm:[&_button]:px-4"
        locating={locating}
        mapMode={mapMode}
        showPinsToggle
        pinsToggleLabel={showPins ? 'Hide Pins' : 'Show Pins'}
        onTogglePins={() => setShowPins(!showPins)}
        onMapModeChange={(mode) => {
          setMapMode(mode);
          map?.easeTo({ pitch: mode === '3d' ? 55 : 0, bearing: mode === '3d' ? -20 : 0, duration: 800 });
        }}
        onLocateMe={() => {
          if (!navigator.geolocation) { setLocationError('Location is unavailable in this browser.'); return; }
          setLocating(true);
          navigator.geolocation.getCurrentPosition(({ coords }) => {
            setLocating(false);
            setLocationError('');
            setFollow(null);
            map?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14 });
          }, () => { setLocating(false); setLocationError('Your location could not be accessed.'); }, { timeout: 10000 });
        }}
      />
        <div className="relative">
          <button type="button" aria-expanded={openControls === 'filters'} aria-controls="map-filters-panel" className={mapControlClass} onClick={() => setOpenControls(openControls === 'filters' ? null : 'filters')}>Filters</button>
          {openControls === 'filters' && (
            <div id="map-filters-panel" role="group" aria-label="Territory and company filters" className="absolute bottom-full right-0 mb-3 max-h-[60dvh] w-64 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-sm text-dash-dark shadow-xl">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-slate-50">Group nearby companies<input type="checkbox" checked={clusterCompanies} onChange={(event) => setClusterCompanies(event.target.checked)} /></label>
              <label className="block space-y-1"><span>Territory overlay</span>
                <select className={field} value={territoryMode} onChange={(event) => setTerritoryMode(event.target.value)}>
                  {territoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block space-y-1"><span>Buying signals</span>
                <select className={field} value={signal} onChange={(event) => setSignal(event.target.value)}>
                  {signalOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button type="button" className="block w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50" onClick={() => {
                setPanel('territories');
                setOpenControls(null);
                if (territoryMode === 'off' || territoryMode === 'footprints') setTerritoryMode('boundaries');
              }}>Manage territories</button>
              <button type="button" className="block w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50" onClick={() => {
                setClusterCompanies(false); setQuery(''); setSignal('all'); setTerritoryMode('off'); setHeat(false); setShowVisits(false); setShowRoutes(false);
              }}>Clear filters</button>
              <Link href={`/admin/map/analytics?market=${market}`} className="block rounded-xl bg-[#103644] px-3 py-2 text-center font-semibold text-white">History &amp; analytics</Link>
            </div>
          )}
        </div>
      </div>
      {locationError && <p role="status" className="absolute bottom-20 right-4 rounded-xl bg-white p-3 text-sm text-dash-dark shadow">{locationError}</p>}
      {selectedAgent !== null && <aside aria-label="Selected agent" className="absolute bottom-36 right-4 z-10 w-[min(17rem,calc(100%-2rem))] rounded-2xl border border-teal-300 bg-white p-4 text-dash-dark shadow-lg max-md:bottom-32 max-md:left-4">
        <div className="flex justify-between"><h2 className="font-bold">{profiles[selectedAgent].name}</h2><button aria-label="Close agent details" onClick={() => { setSelectedAgent(null); stopFollowing(); }}><X size={17} /></button></div>
        <p className="mt-2 text-sm">{positions[selectedAgent].status} · {profiles[selectedAgent].territory.name}</p>
        <p className="mt-1 text-xs">{positions[selectedAgent].activity}</p>
        <p className="mt-2 text-xs font-semibold">{positions[selectedAgent].task}</p>
        <p className="mt-1 text-xs">Destination: {positions[selectedAgent].destination.name}</p>
        <p className="mt-1 text-xs">{positions[selectedAgent].etaSeconds === null ? 'Not travelling' : positions[selectedAgent].arrived ? `Customer check-in · Next task in ${positions[selectedAgent].visitSecondsRemaining}s` : `ETA ${Math.max(1, Math.ceil(positions[selectedAgent].etaSeconds! / 60))} min · Heading ${Math.round(positions[selectedAgent].heading)}°`}</p><p className="mt-1 text-xs text-slate-500">Simulated location · {positions[selectedAgent].coordinates.map((value) => value.toFixed(5)).join(', ')}{profiles[selectedAgent].status === 'Offline' ? ' · Last known position' : ''}</p>
        <button className="mt-3 text-xs font-semibold text-teal-800" onClick={() => follow === selectedAgent ? stopFollowing() : setFollow(selectedAgent)}>{follow === selectedAgent ? 'Stop following' : 'Follow agent'}</button>
      </aside>}
      {company && <aside className="absolute bottom-24 right-4 z-10 w-[min(17rem,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="flex items-start justify-between gap-2"><h2 className="font-bold text-dash-dark">{company.name}</h2><button type="button" className="text-slate-600" aria-label="Close company" onClick={() => setSelectedCompany(undefined)}><X size={17} /></button></div>
        <p className="mt-1 text-xs text-slate-600">{city}</p>
        {company.signal && <p className="mt-2 text-sm font-medium text-amber-800">{company.signal}</p>}
        {visits.filter((visit) => visit.company.id === company.id).length > 0 && <Link href={`/admin/map/analytics?market=${market}&tab=visits&company=${company.id}`} className="mt-2 inline-block text-sm font-semibold text-teal-800">View visit history</Link>}
      </aside>}
      <div className="pointer-events-none absolute bottom-20 right-4 rounded-xl bg-white/95 px-3 py-1.5 text-xs text-dash-dark shadow-sm">
        {city} · {companyData.features.length} companies
        {territoryMode === 'health' && <span className="block text-[11px]">High ≥25% · Medium 12–24% · Low &lt;12%</span>}
        {(territoryMode === 'footprints' || territoryMode === 'compare') && <span className="block text-[11px]">Shaded areas surround this week’s recorded visits</span>}
        {heat && <span className="block text-[11px]">Heat map · Simulated activities and agent positions</span>}
      </div>
    </section>
  );
}
