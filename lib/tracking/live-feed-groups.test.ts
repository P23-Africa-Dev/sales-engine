import { describe, expect, it } from "vitest";

import {
  countLiveTasksByAgent,
  formatRelativeLastSeen,
  isActivelyOnTask,
  isHistoryFeedTask,
  resolveMapTasks,
  resolvePreferredMapTasks,
  resolveTrajectoryTaskIds,
  shouldShowTrajectory,
  splitLiveFeedTasks,
  TRACKING_STALE_MS,
} from "@/lib/tracking/live-feed-groups";
import type { LiveTaskState } from "@/types/tracking";

const NOW = new Date("2026-07-12T12:00:00.000Z").getTime();

function task(overrides: Partial<LiveTaskState> & Pick<LiveTaskState, "taskId">): LiveTaskState {
  return {
    taskId: overrides.taskId,
    trackingSessionId: overrides.trackingSessionId ?? 1,
    userId: overrides.userId ?? 10,
    agentName: overrides.agentName ?? "Agent",
    taskTitle: "Task",
    status: overrides.status ?? "in_progress",
    lastPosition: overrides.lastPosition ?? [3.4, 6.5],
    polyline: [],
    lastEventAt: overrides.lastEventAt ?? "2026-07-12T11:59:00.000Z",
    movementStarted: overrides.movementStarted,
    operationalStatus: overrides.operationalStatus,
    isOnline: overrides.isOnline,
    etaSeconds: overrides.etaSeconds,
  };
}

describe("live-feed-groups", () => {
  it("treats in-progress fresh tasks as active", () => {
    const live = task({ taskId: 1, movementStarted: true, isOnline: true });
    expect(isActivelyOnTask(live, NOW, TRACKING_STALE_MS)).toBe(true);
    expect(isHistoryFeedTask(live, NOW, TRACKING_STALE_MS)).toBe(false);
  });

  it("routes completed tasks to history", () => {
    const done = task({ taskId: 2, status: "completed" });
    expect(isActivelyOnTask(done, NOW, TRACKING_STALE_MS)).toBe(false);
    expect(isHistoryFeedTask(done, NOW, TRACKING_STALE_MS)).toBe(true);
  });

  it("routes stale tasks to history", () => {
    const stale = task({
      taskId: 3,
      lastEventAt: "2026-07-12T11:50:00.000Z",
    });
    expect(isActivelyOnTask(stale, NOW, TRACKING_STALE_MS)).toBe(false);
    expect(isHistoryFeedTask(stale, NOW, TRACKING_STALE_MS)).toBe(true);
  });

  it("keeps delayed but actively tracking tasks in active feed", () => {
    const delayed = task({
      taskId: 4,
      etaSeconds: 3600,
      operationalStatus: "delayed",
      isOnline: true,
    });
    expect(isActivelyOnTask(delayed, NOW, TRACKING_STALE_MS)).toBe(true);
    expect(isHistoryFeedTask(delayed, NOW, TRACKING_STALE_MS)).toBe(false);
  });

  it("requires an open tracking session for active classification", () => {
    const noSession = task({ taskId: 5, trackingSessionId: 0 });
    expect(isActivelyOnTask(noSession, NOW, TRACKING_STALE_MS)).toBe(false);
  });

  it("keeps a fresh task active even when backend flags say offline (clock skew)", () => {
    // Under agent/server clock skew the backend can stamp a live event as
    // offline. The client must trust its own freshness (recent lastEventAt).
    const skewed = task({
      taskId: 6,
      operationalStatus: "offline",
      isOnline: false,
    });
    expect(isActivelyOnTask(skewed, NOW, TRACKING_STALE_MS)).toBe(true);
  });

  it("routes genuinely stale tasks to history regardless of flags", () => {
    const stale = task({
      taskId: 7,
      operationalStatus: "offline",
      isOnline: false,
      lastEventAt: "2026-07-12T11:50:00.000Z",
    });
    expect(isActivelyOnTask(stale, NOW, TRACKING_STALE_MS)).toBe(false);
  });

  it("splitLiveFeedTasks sorts by lastEventAt desc", () => {
    const activeOld = task({
      taskId: 10,
      movementStarted: true,
      lastEventAt: "2026-07-12T11:58:00.000Z",
    });
    const activeNew = task({
      taskId: 11,
      movementStarted: true,
      lastEventAt: "2026-07-12T11:59:30.000Z",
    });
    const completed = task({ taskId: 12, status: "completed" });

    const { active, history } = splitLiveFeedTasks(
      [activeOld, completed, activeNew],
      NOW,
      TRACKING_STALE_MS,
    );
    expect(active.map((t) => t.taskId)).toEqual([11, 10]);
    expect(history.map((t) => t.taskId)).toEqual([12]);
  });

  it("shouldShowTrajectory draws trails for all active agents", () => {
    const activeIds = new Set([1, 2]);
    expect(shouldShowTrajectory(1, null, false, activeIds)).toBe(true);
    expect(shouldShowTrajectory(1, 1, false, activeIds)).toBe(true);
    expect(shouldShowTrajectory(2, 1, false, activeIds)).toBe(true);
    expect(shouldShowTrajectory(1, null, true, activeIds)).toBe(true);
    expect(shouldShowTrajectory(2, null, true, activeIds)).toBe(true);
    expect(shouldShowTrajectory(99, null, true, activeIds)).toBe(false);
    expect(shouldShowTrajectory(99, 99, false, activeIds)).toBe(true);
  });

  it("resolveMapTasks includes selected history agent on map", () => {
    const active = [task({ taskId: 1, movementStarted: true })];
    const history = [task({ taskId: 9, status: "completed" })];
    expect(resolveMapTasks(active, history, null).map((t) => t.taskId)).toEqual([1]);
    expect(resolveMapTasks(active, history, 9).map((t) => t.taskId)).toEqual([1, 9]);
  });

  it("resolveTrajectoryTaskIds includes every active agent plus a selected history task", () => {
    const active = [task({ taskId: 1 }), task({ taskId: 2 })];
    expect(Array.from(resolveTrajectoryTaskIds(active, null, false)).sort()).toEqual([1, 2]);
    expect(Array.from(resolveTrajectoryTaskIds(active, 2, false)).sort()).toEqual([1, 2]);
    expect(Array.from(resolveTrajectoryTaskIds(active, 9, false)).sort()).toEqual([1, 2, 9]);
  });

  it("counts multiple live tasks per agent and prefers the newest for map pins", () => {
    const a1 = task({
      taskId: 1,
      userId: 42,
      movementStarted: true,
      lastEventAt: "2026-07-12T11:58:00.000Z",
    });
    const a2 = task({
      taskId: 2,
      userId: 42,
      movementStarted: true,
      lastEventAt: "2026-07-12T11:59:30.000Z",
    });
    const b1 = task({
      taskId: 3,
      userId: 99,
      movementStarted: true,
      lastEventAt: "2026-07-12T11:59:00.000Z",
    });

    const counts = countLiveTasksByAgent([a1, a2, b1]);
    expect(counts.get(42)).toBe(2);
    expect(counts.get(99)).toBe(1);

    const preferred = resolvePreferredMapTasks([a1, a2, b1], null);
    expect(preferred.map((t) => t.taskId).sort()).toEqual([2, 3]);

    const withSelected = resolvePreferredMapTasks([a1, a2, b1], 1);
    expect(withSelected.some((t) => t.taskId === 1)).toBe(true);
    expect(withSelected.some((t) => t.taskId === 2)).toBe(true);
  });

  it("formats relative last seen labels", () => {
    expect(formatRelativeLastSeen("2026-07-12T11:59:50.000Z", NOW)).toBe("just now");
    expect(formatRelativeLastSeen("2026-07-12T11:57:00.000Z", NOW)).toBe("3m ago");
    expect(formatRelativeLastSeen("2026-07-12T09:00:00.000Z", NOW)).toBe("3h ago");
  });
});
