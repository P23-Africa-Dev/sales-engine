import { describe, expect, it } from "vitest";

import {
  shouldEmitTrackingStartAlert,
  TRACKING_START_ALERT_DEDUPE_MS,
} from "./start-alert-dedupe";

describe("shouldEmitTrackingStartAlert", () => {
  it("emits the first alert for a task", () => {
    const seen = new Map<number, number>();
    expect(shouldEmitTrackingStartAlert(seen, 42, 1_000)).toBe(true);
    expect(seen.get(42)).toBe(1_000);
  });

  it("dedupes the same task within the window", () => {
    const seen = new Map<number, number>();
    expect(shouldEmitTrackingStartAlert(seen, 42, 1_000)).toBe(true);
    expect(
      shouldEmitTrackingStartAlert(seen, 42, 1_000 + TRACKING_START_ALERT_DEDUPE_MS - 1),
    ).toBe(false);
  });

  it("allows a new alert after the window", () => {
    const seen = new Map<number, number>();
    expect(shouldEmitTrackingStartAlert(seen, 42, 1_000)).toBe(true);
    expect(
      shouldEmitTrackingStartAlert(seen, 42, 1_000 + TRACKING_START_ALERT_DEDUPE_MS),
    ).toBe(true);
  });

  it("does not dedupe across different tasks", () => {
    const seen = new Map<number, number>();
    expect(shouldEmitTrackingStartAlert(seen, 1, 1_000)).toBe(true);
    expect(shouldEmitTrackingStartAlert(seen, 2, 1_001)).toBe(true);
  });
});
