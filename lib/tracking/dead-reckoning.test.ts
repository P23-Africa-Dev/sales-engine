import { describe, expect, it } from "vitest";

import {
  bearingBetween,
  MAX_PREDICTION_METERS,
  projectPosition,
  resolveHeading,
  smoothBearing,
} from "@/lib/tracking/dead-reckoning";

describe("dead-reckoning", () => {
  it("projectPosition returns original point when speed is too low", () => {
    const point: [number, number] = [3.4, 6.5];
    expect(projectPosition(point, 0.2, 90, 10)).toEqual(point);
  });

  it("projectPosition moves north when heading is 0 degrees", () => {
    const start: [number, number] = [3.4, 6.5];
    const projected = projectPosition(start, 10, 0, 1);
    expect(projected[0]).toBeCloseTo(start[0], 5);
    expect(projected[1]).toBeGreaterThan(start[1]);
  });

  it("projectPosition caps travel distance", () => {
    const start: [number, number] = [3.4, 6.5];
    const projected = projectPosition(start, 50, 90, 60);
    const deltaLng = Math.abs(projected[0] - start[0]);
    const deltaLat = Math.abs(projected[1] - start[1]);
    const approxMeters =
      Math.sqrt(deltaLng ** 2 + deltaLat ** 2) * 111_000;
    expect(approxMeters).toBeLessThanOrEqual(MAX_PREDICTION_METERS + 5);
  });

  it("bearingBetween returns null for identical points", () => {
    expect(bearingBetween([3.4, 6.5], [3.4, 6.5])).toBeNull();
  });

  it("bearingBetween points eastward is near 90 degrees", () => {
    const bearing = bearingBetween([3.4, 6.5], [3.41, 6.5]);
    expect(bearing).not.toBeNull();
    expect(bearing!).toBeGreaterThan(80);
    expect(bearing!).toBeLessThan(100);
  });

  it("smoothBearing blends along shortest arc", () => {
    expect(smoothBearing(350, 10, 1)).toBeCloseTo(10, 5);
    expect(smoothBearing(10, 350, 1)).toBeCloseTo(350, 5);
  });

  it("resolveHeading prefers reported heading over trail bearing", () => {
    expect(resolveHeading(180, [[3.4, 6.5], [3.41, 6.5]])).toBe(180);
  });

  it("resolveHeading falls back to trail bearing", () => {
    const heading = resolveHeading(null, [[3.4, 6.5], [3.41, 6.5]]);
    expect(heading).not.toBeNull();
    expect(heading!).toBeGreaterThan(80);
    expect(heading!).toBeLessThan(100);
  });
});
