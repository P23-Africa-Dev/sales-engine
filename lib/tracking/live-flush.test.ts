import { describe, expect, it } from "vitest";

import { LIVE_FLUSH_MOVING_MS, shouldFlushLiveLocation } from "@/lib/tracking/live-flush";

describe("live-flush", () => {
  it("flushes the first sample", () => {
    expect(
      shouldFlushLiveLocation({ longitude: 3.3, latitude: 6.5, speedMps: 0 }, null, 1_000),
    ).toBe(true);
  });

  it("flushes after ~20m of travel", () => {
    expect(
      shouldFlushLiveLocation(
        { longitude: 3.3, latitude: 6.5 + 25 / 111_320, speedMps: 0 },
        { atMs: 1_000, lng: 3.3, lat: 6.5 },
        1_500,
      ),
    ).toBe(true);
  });

  it("flushes while moving after 2s", () => {
    expect(
      shouldFlushLiveLocation(
        { longitude: 3.30001, latitude: 6.5, speedMps: 8 },
        { atMs: 1_000, lng: 3.3, lat: 6.5 },
        1_000 + LIVE_FLUSH_MOVING_MS,
      ),
    ).toBe(true);
  });

  it("holds a stationary sample until the heartbeat window", () => {
    expect(
      shouldFlushLiveLocation(
        { longitude: 3.3, latitude: 6.5, speedMps: 0 },
        { atMs: 1_000, lng: 3.3, lat: 6.5 },
        2_500,
      ),
    ).toBe(false);
  });
});
