'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type LayerSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import Link from 'next/link';
import { MapExploreControls } from './map-explore-controls';
import { Search, X } from 'lucide-react';
import {
  DEMO_COLORS, DEMO_MARKETS, DEMO_WEEKS, getDemoCompanies, getDemoCoverage, getDemoTerritories, getDemoVisits,
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
  const [panel, setPanel] = useState<'activity' | 'territories' | null>('activity');
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
  const [editing, setEditing] = useState<DemoTerritory | null>(null);
  const [follow, setFollow] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
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
  const routes = useMemo(() => agents.map((_, agent) => currentVisits
    .filter((visit) => visit.agent === agent)
    .map((visit) => visit.company.coordinates)), [agents, currentVisits]);
  const positions = routes.map((route, index) => {
    if (route.length < 2) return { coordinates: route[0] ?? [center[0] + (index ? 0.015 : -0.015), center[1]] as Coordinate, direction: 'At a visit' };
    const segment = Math.floor(tick / 12 + index) % (2 * (route.length - 1));
    const fromIndex = segment < route.length - 1 ? segment : 2 * (route.length - 1) - segment;
    const from = route[fromIndex];
    const to = route[fromIndex + (segment < route.length - 1 ? 1 : -1)];
    const progress = (tick % 12) / 12;
    const angle = Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI;
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return { coordinates: [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress] as Coordinate, direction: compass[Math.round((angle + 360) / 45) % 8] };
  });

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`factory-map-territories-${market}`);
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
        container: container.current, center: [center[0], center[1]], zoom: 11.2,
        style: {
          version: 8,
          glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
          sources: {
            streets: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' },
          },
          layers: [{ id: 'streets', type: 'raster', source: 'streets' }],
        },
      });
    } catch {
      setMapError('The map could not start. A browser with WebGL is required.');
      return;
    }
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.on('load', () => {
      for (const id of ['territories', 'routes', 'visits', 'agents', 'coverage']) {
        instance.addSource(id, { type: 'geojson', data: collection([]) });
      }
      instance.addSource('company-points', { type: 'geojson', data: collection([]) });
      instance.addSource('companies', { type: 'geojson', data: collection([]), cluster: true, clusterRadius: 43, clusterMaxZoom: 15 });
      instance.addLayer({ id: 'zones', source: 'territories', type: 'fill', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'], 'fill-outline-color': ['get', 'color'] } });
      instance.addLayer({ id: 'coverage', source: 'coverage', type: 'circle', paint: {
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, 12, 15, 384],
        'circle-color': ['get', 'color'], 'circle-opacity': 0.16,
      } });
      instance.addLayer({ id: 'heat', source: 'visits', type: 'heatmap', paint: { 'heatmap-radius': 38, 'heatmap-intensity': 1.5, 'heatmap-opacity': 0.8 } });
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
      instance.addLayer({ id: 'agent-pin', source: 'agents', type: 'circle', paint: { 'circle-radius': 20, 'circle-color': '#dff4ff', 'circle-stroke-color': '#0ea5e9', 'circle-stroke-width': 3 } });
      instance.addLayer({ id: 'agent-label', source: 'agents', type: 'symbol', layout: { 'text-field': ['get', 'initials'], 'text-font': ['Open Sans Regular'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#0c4a6e' } });
      instance.on('dragstart', () => setFollow(null));
      for (const layer of ['company-pin', 'company-label', 'clustered-company-pin', 'clustered-company-label']) {
        instance.on('click', layer, ({ features }) => {
          if (features?.length) setSelectedCompany(Number(features[0].properties.id));
        });
      }
      instance.on('click', 'visit-pin', ({ features }) => {
        if (features?.length) setSelectedCompany(Number(features[0].properties.company));
      });
      instance.on('click', 'agent-pin', ({ features }) => {
        if (features?.length) { setFollow(Number(features[0].properties.agent)); setPanel('activity'); }
      });
      instance.on('click', 'clusters', ({ features }) => {
        if (!features?.length) return;
        const cluster = features[0];
        void instance.getSource<GeoJSONSource>('companies')?.getClusterExpansionZoom(cluster.properties.cluster_id)
          .then((zoom) => instance.easeTo({ center: (cluster.geometry as Point).coordinates as Coordinate, zoom }))
          .catch(() => {});
      });
      for (const layer of ['clusters', 'company-pin', 'company-label', 'clustered-company-pin', 'clustered-company-label', 'agent-pin', 'visit-pin']) {
        instance.on('mouseenter', layer, () => { instance.getCanvas().style.cursor = 'pointer'; });
        instance.on('mouseleave', layer, () => { instance.getCanvas().style.cursor = ''; });
      }
      setMap(instance);
    });
    return () => instance.remove();
  }, [center]);

  const companyData = useMemo(() => collection(companies
    .filter((company) => signal === 'all' || (signal === 'signals' ? company.signal : company.signal === signal))
    .map((company) => point(company.coordinates, { id: company.id, name: company.name, signal: Boolean(company.signal) }))), [companies, signal]);
  const visitData = useMemo(() => collection(currentVisits.map((visit) => point(visit.company.coordinates, {
    company: visit.company.id, color: DEMO_COLORS[visit.agent],
  }))), [currentVisits]);
  const territoryData = useMemo(() => collection(territoryMode === 'off' || territoryMode === 'footprints' ? [] : territories.map((territory) => {
    const [west, south, east, north] = territory.bounds;
    const coverage = getDemoCoverage(territory, market);
    const color = territoryMode === 'health' ? (coverage >= 25 ? '#159263' : coverage >= 12 ? '#d58a19' : '#c84950') : DEMO_COLORS[territory.agent];
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
      properties: { color, opacity: territoryMode === 'health' ? 0.3 : 0.13 } };
  })), [territories, territoryMode, market]);
  const routeData = useMemo(() => collection(routes.flatMap((route, agent) => route.length < 2 ? [] : [{
    type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: route }, properties: { color: DEMO_COLORS[agent] },
  }])), [routes]);
  const coverageData = useMemo(() => collection(territoryMode === 'footprints' || territoryMode === 'compare'
    ? currentVisits.map((visit) => point(visit.company.coordinates, { color: DEMO_COLORS[visit.agent] }))
    : []), [territoryMode, currentVisits]);
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

  useEffect(() => {
    if (!map?.style) return;
    const tracked = positions.map((position, agent) => point(position.coordinates, {
      agent, initials: agents[agent].split(' ').map((part) => part[0]).join(''), color: DEMO_COLORS[agent],
    }));
    map.getSource<GeoJSONSource>('agents')?.setData(collection(tracked));
    if (follow !== null) map.easeTo({ center: positions[follow].coordinates, duration: 800 });
  }, [map, agents, positions, follow]);

  useEffect(() => {
    if (companyId === undefined || !companies[companyId]) return;
    setSelectedCompany(companyId);
    setFollow(null);
    if (map?.style) map.flyTo({ center: companies[companyId].coordinates, zoom: 16 });
  }, [map, companyId, companies]);

  const matches = query.trim().length < 2 ? [] : companies.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);
  const company = selectedCompany === undefined ? undefined : companies[selectedCompany];
  const selectCompany = (id: number) => {
    setFollow(null);
    setSelectedCompany(id);
    map?.flyTo({ center: companies[id].coordinates, zoom: 16 });
  };

  return (
    <section aria-label={`${name} map`} className="relative isolate h-[calc(100dvh-7.25rem)] min-h-[32rem] bg-[#e6efeb]">
      <div className="absolute inset-0"><div ref={container} className="h-full w-full" /></div>
      {mapError && <p role="alert" className="absolute inset-x-4 top-24 rounded-xl bg-white p-4">{mapError}</p>}
      <div className="absolute right-4 top-4 z-20 w-[min(300px,calc(100%-2rem))] md:right-8 md:top-6 xl:w-[340px]">
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
      {panel && <aside className="absolute bottom-24 left-4 top-20 z-10 md:top-8 w-[min(340px,calc(100%-2rem))] overflow-y-auto rounded-[32px] border border-slate-100 bg-white p-4 text-dash-dark shadow-2xl md:left-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-dash-dark">{panel === 'activity' ? 'Agent activity' : 'Territories'}</h2>
          <button type="button" className="text-slate-600" aria-label="Close panel" onClick={() => setPanel(null)}><X size={18} /></button>
        </div>
        {panel === 'activity' ? <>
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input aria-label="Search activity" placeholder={activityTab === 'businesses' ? 'Search by business…' : 'Search by agents…'} value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} className="w-full rounded-full border border-slate-100 bg-white py-2.5 pl-9 pr-3 text-sm text-dash-dark" />
          </div>
          <nav aria-label="Field activity" className="mb-3 flex border-b border-slate-100">
            {([['feeds', 'Live Feeds'], ['clocked-in', 'Clocked In (2)'], ['businesses', 'Businesses']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-current={activityTab === id ? 'page' : undefined} onClick={() => { setActivityTab(id); setActivitySearch(''); }} className={`flex-1 border-b-2 py-3 text-xs font-semibold ${activityTab === id ? 'border-dash-dark text-dash-dark' : 'border-transparent text-slate-400'}`}>{label}</button>
            ))}
          </nav>
          {activityTab === 'businesses' ? companies.filter((item) => item.name.toLowerCase().includes(activitySearch.toLowerCase())).map((item) => (
            <button key={item.id} type="button" onClick={() => selectCompany(item.id)} className="block w-full border-b border-slate-100 py-3 text-left text-sm text-dash-dark">
              <span className="block font-semibold">{item.name}</span><span className="text-xs text-slate-500">{item.signal || city}</span>
            </button>
          )) : <>
          <p className="mb-3 text-xs font-semibold text-emerald-700">Active (2)</p>
          {agents.map((agent, index) => agent.toLowerCase().includes(activitySearch.toLowerCase()) && <div key={agent} className="mb-3 flex items-center justify-between gap-2 rounded-[24px] bg-slate-50 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-sm font-bold text-slate-500 shadow-sm">{agent.split(' ').map((part) => part[0]).join('')}</span>
              <div className="min-w-0"><p className="truncate text-sm font-bold text-dash-dark">{agent}</p><p className="mt-1 text-xs text-sky-700">En route · {positions[index].direction}</p><p className="mt-1 text-xs text-slate-500">{city} · Updated just now</p></div>
            </div>
            <button type="button" aria-label={`${follow === index ? 'Release' : 'Follow'} ${agent}`} aria-pressed={follow === index} onClick={() => setFollow(follow === index ? null : index)} className={button}>{follow === index ? 'Release' : 'Follow'}</button>
          </div>)}
          {activityTab === 'feeds' && <><h3 className="mt-5 text-sm font-semibold text-dash-dark">Recorded visits this week</h3>
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
            window.localStorage.setItem(`factory-map-territories-${market}`, JSON.stringify(next));
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
          {territories.map((territory) => <button key={territory.id} type="button" className="block w-full border-b border-slate-100 py-3 text-left text-sm text-dash-dark hover:bg-slate-50" onClick={() => setEditing(territory)}>
            <span className="block font-semibold">{territory.name}</span><span className="text-slate-600">{agents[territory.agent]} · {getDemoCoverage(territory, market)}% covered</span>
          </button>)}
        </>}
      </aside>}
      <div ref={controlsRef} className="absolute inset-x-2 bottom-6 z-30 flex items-center justify-center gap-2">
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
        {heat && <span className="block text-[11px]">Heat map · Recorded visits this week</span>}
      </div>
    </section>
  );
}
