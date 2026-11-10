import { describe, expect, it } from "vitest";

import { resolveLivePolylineForHydrate, shouldKeepLivePolyline } from "@/lib/tracking/live-polyline";

describe("live-polyline", () => {
  it("resets when the last vertex is a teleport away from the new fix", () => {
    const staleTrail: [number, number][] = [
      [3.1891693, 6.5947258],
      [3.35, 6.54],
    ];
    const anchor: [number, number] = [3.366577, 6.531942];

    expect(shouldKeepLivePolyline(staleTrail, anchor)).toBe(false);
    expect(resolveLivePolylineForHydrate(staleTrail, anchor)).toEqual([anchor]);
  });

  it("keeps a continuing trail when the last vertex is near the new fix", () => {
    const liveTrail: [number, number][] = [
      [3.3665, 6.5319],
      [3.3666, 6.532],
    ];
    const anchor: [number, number] = [3.366577, 6.531942];

    expect(shouldKeepLivePolyline(liveTrail, anchor)).toBe(true);
    expect(resolveLivePolylineForHydrate(liveTrail, anchor)).toEqual([...liveTrail, anchor]);
  });

  it("keeps a long in-progress trail whose origin is far but last point is near the agent", () => {
    const liveTrail: [number, number][] = [
      [3.1891693, 6.5947258],
      [3.25, 6.56],
      [3.3665, 6.5319],
    ];
    const anchor: [number, number] = [3.366577, 6.531942];

    expect(shouldKeepLivePolyline(liveTrail, anchor)).toBe(true);
    expect(resolveLivePolylineForHydrate(liveTrail, anchor)[0]).toEqual(liveTrail[0]);
    expect(resolveLivePolylineForHydrate(liveTrail, anchor).at(-1)).toEqual(anchor);
  });
});
