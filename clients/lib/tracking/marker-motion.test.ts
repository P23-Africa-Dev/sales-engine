import { describe, expect, it } from "vitest";

import { haversineMeters } from "@/lib/tracking/live-polyline";
import {
  createMarkerMotion,
  enqueueMarkerFix,
  sampleMarkerPosition,
} from "@/lib/tracking/marker-motion";

describe("marker-motion", () => {
  it("glides to the midpoint after half the recorded interval", () => {
    const from: [number, number] = [3.3, 6.5];
    const to: [number, number] = [3.3, 6.5 + 100 / 111_320];
    let state = createMarkerMotion(from, 1_000);
    state = enqueueMarkerFix(state, to, 10_000, 11_000);

    const mid = sampleMarkerPosition(state, state.startMs + state.durationMs / 2);
    const total = haversineMeters(from[0], from[1], to[0], to[1]);
    const traveled = haversineMeters(from[0], from[1], mid[0], mid[1]);
    expect(traveled).toBeGreaterThan(total * 0.4);
    expect(traveled).toBeLessThan(total * 0.6);
  });

  it("does not snap backward when sampled at the same display time", () => {
    const from: [number, number] = [3.3, 6.5];
    const to: [number, number] = [3.3, 6.5 + 80 / 111_320];
    let state = createMarkerMotion(from, 0);
    state = enqueueMarkerFix(state, to, 0, 8_000);
    const at2s = sampleMarkerPosition(state, 2_000);
    const again = sampleMarkerPosition(state, 2_000);
    expect(again).toEqual(at2s);
  });
});
