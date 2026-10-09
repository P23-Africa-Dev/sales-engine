import { beforeEach, describe, expect, it } from "vitest";

import { isActivelyOnTask } from "@/lib/tracking/live-feed-groups";
import { trackingAgentIdentityKey, useTrackingStore } from "@/store/tracking";
import type { TaskRoute, TrackingEnvelope } from "@/types/tracking";
import type { TaskApiItem } from "@/lib/api/tasks";

function resetStore() {
  useTrackingStore.setState({
    liveTasks: {},
    wsStatus: "idle",
    selectedTaskId: null,
    activeTrackingTaskId: null,
    lastTaskStartedAlert: null,
  });
}

function baseEnvelope(
  type: TrackingEnvelope["type"],
  overrides: Partial<TrackingEnvelope["payload"]> = {},
): TrackingEnvelope {
  return {
    type,
    channel: "factory23.tracking.company.1",
    payload: {
      task_id: 10,
      tracking_session_id: 20,
      user_id: 100,
      company_id: 1,
      occurred_at: "2026-07-12T10:00:00.000Z",
      data: {
        latitude: 6.5,
        longitude: 3.4,
        agent: {
          id: 100,
          name: "Agent Alpha",
          avatar_url: "https://cdn.example.com/alpha.png",
        },
      },
      ...overrides,
    },
  };
}

describe("tracking store avatar identity", () => {
  beforeEach(() => {
    resetStore();
  });

  it("hydrateFromRoute preserves assignee avatar from task payload", () => {
    const task = {
      id: 10,
      title: "Install panel",
      assignee: {
        id: 55,
        name: "Assignee One",
        avatar_url: "https://cdn.example.com/assignee.png",
      },
    } as TaskApiItem;

    const route = {
      polyline: [[3.39, 6.49], [3.4, 6.5]],
      status: "in_progress",
    } as TaskRoute;

    useTrackingStore.getState().hydrateFromRoute(10, route, task);

    const live = useTrackingStore.getState().liveTasks[10];
    expect(live.userId).toBe(55);
    expect(live.agentAvatarUrl).toBe("https://cdn.example.com/assignee.png");
  });

  it("hydrateFromRoute keeps previous avatar when assignee omits url", () => {
    useTrackingStore.getState().seedFromTaskStart({
      taskId: 10,
      trackingSessionId: 20,
      userId: 55,
      agentAvatarUrl: "https://cdn.example.com/prev.png",
      position: [3.4, 6.5],
    });

    const task = {
      id: 10,
      title: "Install panel",
      assignee: { id: 55, name: "Assignee One" },
    } as TaskApiItem;

    useTrackingStore.getState().hydrateFromRoute(10, { polyline: [[3.4, 6.5]] } as TaskRoute, task);

    expect(useTrackingStore.getState().liveTasks[10].agentAvatarUrl).toBe(
      "https://cdn.example.com/prev.png",
    );
  });

  it("seedFromTaskStart clears stale avatar when userId changes", () => {
    useTrackingStore.getState().seedFromTaskStart({
      taskId: 10,
      trackingSessionId: 20,
      userId: 100,
      agentName: "Agent Alpha",
      agentAvatarUrl: "https://cdn.example.com/alpha.png",
      position: [3.4, 6.5],
    });

    useTrackingStore.getState().seedFromTaskStart({
      taskId: 10,
      trackingSessionId: 21,
      userId: 200,
      agentName: "Agent Beta",
      position: [3.41, 6.51],
    });

    const live = useTrackingStore.getState().liveTasks[10];
    expect(live.userId).toBe(200);
    expect(live.agentAvatarUrl).toBeUndefined();
    expect(live.polyline).toEqual([[3.41, 6.51]]);
  });

  it("seedFromTaskStart keeps avatar when userId is unchanged", () => {
    useTrackingStore.getState().seedFromTaskStart({
      taskId: 10,
      trackingSessionId: 20,
      userId: 100,
      agentAvatarUrl: "https://cdn.example.com/alpha.png",
      position: [3.4, 6.5],
    });

    useTrackingStore.getState().seedFromTaskStart({
      taskId: 10,
      trackingSessionId: 21,
      userId: 100,
      position: [3.41, 6.51],
    });

    expect(useTrackingStore.getState().liveTasks[10].agentAvatarUrl).toBe(
      "https://cdn.example.com/alpha.png",
    );
  });

  it("upsertFromWs reassignment clears avatar and resets polyline for new agent", () => {
    useTrackingStore.getState().upsertFromWs(
      baseEnvelope("tracking.location.updated", {
        data: {
          latitude: 6.5,
          longitude: 3.4,
          agent: {
            id: 100,
            name: "Agent Alpha",
            avatar_url: "https://cdn.example.com/alpha.png",
          },
        },
      }),
    );

    useTrackingStore.getState().upsertFromWs({
      type: "tracking.task.reassigned",
      channel: "factory23.tracking.company.1",
      payload: {
        task_id: 10,
        tracking_session_id: 20,
        user_id: 200,
        company_id: 1,
        occurred_at: "2026-07-12T10:05:00.000Z",
        data: {
          from_user_id: 100,
          to_user_id: 200,
          reassignment_id: 1,
          reassignment_status: "accepted",
        },
      },
    });

    const live = useTrackingStore.getState().liveTasks[10];
    expect(live.userId).toBe(200);
    expect(live.agentAvatarUrl).toBeUndefined();
    expect(live.polyline).toEqual([]);
  });

  it("trackingAgentIdentityKey combines user and avatar url", () => {
    expect(
      trackingAgentIdentityKey({ userId: 5, agentAvatarUrl: "https://cdn.example.com/a.png" }),
    ).toBe("5:https://cdn.example.com/a.png");
    expect(trackingAgentIdentityKey({ userId: 5, agentAvatarUrl: undefined })).toBe("5:");
  });

  it("tracking.task.started with coords builds an active live feed task", () => {
    useTrackingStore.getState().upsertFromWs(
      baseEnvelope("tracking.task.started", {
        data: {
          latitude: 6.5,
          longitude: 3.4,
          agent: { id: 100, name: "Agent Alpha" },
          task: { title: "Site visit" },
        },
      }),
    );

    const live = useTrackingStore.getState().liveTasks[10];
    expect(live.trackingSessionId).toBe(20);
    expect(live.lastPosition).toEqual([3.4, 6.5]);
    expect(live.status).toBe("in_progress");
    expect(isActivelyOnTask(live, Date.now())).toBe(true);

    const alert = useTrackingStore.getState().lastTaskStartedAlert;
    expect(alert?.taskId).toBe(10);
    expect(alert?.agentName).toBe("Agent Alpha");
    expect(alert?.taskTitle).toBe("Site visit");
    expect(alert?.signal).toBe(1);
  });

  it("hydrateFromSnapshots stamps lastReceivedAt for freshness", () => {
    const before = Date.now();

    useTrackingStore.getState().hydrateFromSnapshots([
      {
        agent: { id: 55, name: "Agent Snap", avatar_url: "https://cdn.example.com/snap.png" },
        task: {
          id: 42,
          title: "Hydrate task",
          status: "in_progress",
          tracking_session_id: 99,
        },
        location: {
          latitude: 6.51,
          longitude: 3.41,
          recorded_at: "2026-07-12T10:00:00.000Z",
          arrived: false,
        },
        status: {
          is_online: true,
          is_stale: false,
          proximity_state: "in_progress",
          last_seen_at: "2026-07-12T10:00:00.000Z",
          operational_status: "en_route",
        },
        updated_at: "2026-07-12T10:00:00.000Z",
      },
    ]);

    const live = useTrackingStore.getState().liveTasks[42];
    expect(live).toBeDefined();
    expect(live.userId).toBe(55);
    expect(typeof live.lastReceivedAt).toBe("number");
    expect(live.lastReceivedAt!).toBeGreaterThanOrEqual(before);
    expect(live.lastReceivedAt!).toBeLessThanOrEqual(Date.now());
  });
});
