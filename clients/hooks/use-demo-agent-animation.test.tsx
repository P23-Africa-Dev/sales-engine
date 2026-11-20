import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type maplibregl from 'maplibre-gl';
import { getDemoAgents, getDemoAgentTelemetry } from '@/lib/map/factory-demo';
import { useDemoAgentAnimation } from './use-demo-agent-animation';

const { created } = vi.hoisted(() => ({ created: [] as { element: HTMLButtonElement; setLngLat: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[] }));
vi.mock('maplibre-gl', () => ({ default: { Marker: class {
  element: HTMLButtonElement;
  setLngLat = vi.fn(() => this);
  addTo = vi.fn(() => this);
  remove = vi.fn();
  constructor({ element }: { element: HTMLButtonElement }) { this.element = element; created.push(this); }
} } }));

describe('demo marker animation and follow camera', () => {
  let frame: FrameRequestCallback;
  let seconds: number;
  let now: number;
  const agents = getDemoAgents('ghana');
  const elapsed = () => seconds;
  const map = { getCenter: () => ({ lng: -0.195, lat: 5.623 }), getZoom: () => 12,
    getPitch: () => 0, getBearing: () => 0, flyTo: vi.fn(), jumpTo: vi.fn() };
  beforeEach(() => {
    seconds = 0; now = 0; created.length = 0;
    vi.clearAllMocks();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const advance = (time: number) => { seconds = time; now = time * 1000; act(() => frame(now)); };

  it('keeps every marker animating with no follow and preserves instances through tab/selection updates', () => {
    const onSelect = vi.fn();
    const { rerender, unmount } = renderHook(({ selected }) => useDemoAgentAnimation({
      map: map as unknown as maplibregl.Map, agents, elapsed, selected, follow: null, overviewVersion: 0, onSelect,
    }), { initialProps: { selected: null as number | null } });
    expect(created).toHaveLength(20);
    advance(1);
    advance(2);
    agents.forEach((agent, id) => expect(created[id].setLngLat).toHaveBeenLastCalledWith(getDemoAgentTelemetry(agent, 2).coordinates));
    rerender({ selected: 4 });
    expect(created).toHaveLength(20);
    act(() => created[4].element.click());
    expect(onSelect).toHaveBeenCalledWith(4);
    advance(3);
    expect(created[4].element.getAttribute('aria-pressed')).toBe('true');
    expect(map.jumpTo).not.toHaveBeenCalled();
    unmount();
    created.forEach((marker) => expect(marker.remove).toHaveBeenCalledOnce());
  });

  it('zooms once, follows current coordinates, switches agents, and restores overview on Stop', () => {
    const { rerender } = renderHook(({ follow, overviewVersion }) => useDemoAgentAnimation({
      map: map as unknown as maplibregl.Map, agents, elapsed, selected: follow, follow, overviewVersion, onSelect: vi.fn(),
    }), { initialProps: { follow: 1 as number | null, overviewVersion: 0 } });
    expect(map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 15, center: getDemoAgentTelemetry(agents[1], 0).coordinates }));
    advance(0.5);
    expect(map.jumpTo).not.toHaveBeenCalled();
    advance(1);
    expect(map.jumpTo).toHaveBeenLastCalledWith({ center: getDemoAgentTelemetry(agents[1], 1).coordinates });
    rerender({ follow: 4, overviewVersion: 0 });
    expect(map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 15, center: getDemoAgentTelemetry(agents[4], 1).coordinates }));
    advance(2);
    expect(map.jumpTo).toHaveBeenLastCalledWith({ center: getDemoAgentTelemetry(agents[4], 2).coordinates });
    expect(created).toHaveLength(20);
    rerender({ follow: null, overviewVersion: 1 });
    expect(map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 12, center: { lng: -0.195, lat: 5.623 } }));
  });
});
