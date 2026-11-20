import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { DEMO_COLORS, getDemoAgentTelemetry, type DemoAgent } from '@/lib/map/factory-demo';

/** Keep frame updates out of React and never restart the simulation on UI changes. */
export function useDemoAgentAnimation({ map, agents, elapsed, selected, follow, overviewVersion, onSelect }: {
  map: maplibregl.Map | null; agents: DemoAgent[]; elapsed: () => number;
  selected: number | null; follow: number | null; overviewVersion: number; onSelect: (id: number) => void;
}) {
  const live = useRef({ selected, follow, onSelect });
  useEffect(() => { live.current = { selected, follow, onSelect }; }, [selected, follow, onSelect]);
  const overview = useRef<{ center: maplibregl.LngLat; zoom: number; pitch: number; bearing: number } | null>(null);
  const followReady = useRef(0);
  const previousOverviewVersion = useRef(overviewVersion);

  useEffect(() => {
    if (!map) return;
    if (follow !== null) {
      overview.current ??= { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      const state = getDemoAgentTelemetry(agents[follow], elapsed());
      followReady.current = performance.now() + 750;
      map.flyTo({ center: state.coordinates, zoom: 15, duration: 700, padding: { left: 0, right: 0, top: 0, bottom: 0 } });
    } else if (overview.current) {
      if (overviewVersion !== previousOverviewVersion.current) map.flyTo({ ...overview.current, duration: 700, padding: { left: 0, right: 0, top: 0, bottom: 0 } });
      overview.current = null;
    }
    previousOverviewVersion.current = overviewVersion;
  }, [map, agents, elapsed, follow, overviewVersion]);

  useEffect(() => {
    if (!map) return;
    const markers = agents.map((agent) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.style.cssText = `width:42px;height:42px;border:3px solid white;border-radius:50%;background:${agent.status === 'Offline' ? '#64748b' : agent.status === 'Idle' ? '#b45309' : DEMO_COLORS[agent.id]};color:white;font:bold 12px sans-serif;box-shadow:0 2px 8px #0005;cursor:pointer;`;
      const initials = document.createElement('span');
      initials.textContent = agent.initials;
      const arrow = document.createElement('span');
      arrow.textContent = '▲';
      arrow.style.cssText = 'position:absolute;top:-17px;left:11px;font-size:18px;color:#0f766e;transform-origin:7px 35px;text-shadow:0 0 2px white;';
      element.append(initials, arrow);
      element.addEventListener('click', () => live.current.onSelect(agent.id));
      const marker = new maplibregl.Marker({ element }).setLngLat(agent.route[0]).addTo(map);
      element.setAttribute('aria-label', `Select ${agent.name}`);
      return { marker, element, arrow };
    });
    let frame = 0, previous = 0;
    const update = (now: number) => {
      if (now - previous >= 1000 / 30) {
        previous = now;
        const time = elapsed();
        agents.forEach((agent, index) => {
          const state = getDemoAgentTelemetry(agent, time);
          const { marker, element, arrow } = markers[index];
          marker.setLngLat(state.coordinates);
          element.style.borderColor = live.current.selected === index ? '#fbbf24' : '#fff';
          element.setAttribute('aria-pressed', String(live.current.selected === index));
          element.title = `${agent.name} · ${state.status} · ${state.task}`;
          arrow.style.display = state.status === 'Moving' ? 'block' : 'none';
          arrow.style.transform = `rotate(${state.heading - map.getBearing()}deg)`;
          if (live.current.follow === index && now >= followReady.current) {
            // jumpTo is a frame-aligned camera update; easeTo here would restart/cancel its animation every frame.
            map.jumpTo({ center: state.coordinates });
          }
        });
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => { cancelAnimationFrame(frame); markers.forEach(({ marker }) => marker.remove()); };
  }, [map, agents, elapsed]);
}
