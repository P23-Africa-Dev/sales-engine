import { describe, expect, it } from "vitest";

import {
  isLiveTaskStale,
  resolveOperationalStatusFromTask,
  taskAgeMs,
} from "@/lib/tracking/operational-status";
import type { LiveTaskState } from "@/types/tracking";

const NOW = new Date("2026-07-12T12:00:00.000Z").getTime();
const STALE_MS = 5 * 60 * 1000;

function task(overrides: Partial<LiveTaskState> = {}): LiveTaskState {
  return {
    taskId: 1,
    trackingSessionId: 10,
    userId: 5,
    agentName: "Agent",
    taskTitle: "Task",
    status: "in_progress",
    lastPosition: [3.4, 6.5],
    polyline: [],
    lastEventAt: "2026-07-12T11:50:00.000Z",
    ...overrides,
  };
}

describe("operational-status freshness", () => {
  it("taskAgeMs prefers lastReceivedAt over skewed lastEventAt", () => {
    const live = task({
      lastEventAt: "2026-07-12T10:00:00.000Z",
      lastReceivedAt: NOW - 30_000,
    });

    expect(taskAgeMs(live, NOW)).toBe(30_000);
    expect(isLiveTaskStale(live, NOW, STALE_MS)).toBe(false);
  });

  it("taskAgeMs falls back to lastEventAt when lastReceivedAt is missing", () => {
    const live = task({
      lastEventAt: "2026-07-12T11:50:00.000Z",
      lastReceivedAt: undefined,
    });

    expect(taskAgeMs(live, NOW)).toBe(10 * 60 * 1000);
    expect(isLiveTaskStale(live, NOW, STALE_MS)).toBe(true);
  });

  it("resolveOperationalStatusFromTask stays online when lastReceivedAt is fresh", () => {
    const live = task({
      lastEventAt: "2026-07-12T10:00:00.000Z",
      lastReceivedAt: NOW - 15_000,
      operationalStatus: "offline",
      isOnline: false,
    });

    expect(resolveOperationalStatusFromTask(live, NOW, STALE_MS)).toBe("en_route");
  });
});
