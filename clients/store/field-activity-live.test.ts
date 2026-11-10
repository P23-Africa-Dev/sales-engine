import { beforeEach, describe, expect, it } from "vitest";
import { useFieldActivityLiveStore } from "@/store/field-activity-live";

describe("useFieldActivityLiveStore", () => {
  beforeEach(() => {
    useFieldActivityLiveStore.getState().clear();
  });

  it("hydrates agents and appends polyline points", () => {
    useFieldActivityLiveStore.getState().hydrate([
      {
        userId: 9,
        name: "Amara",
        avatarUrl: null,
        sessionId: 44,
        lastPosition: [3.37, 6.52],
        lastMovementState: "moving",
        lastRecordedAt: "2026-07-29T10:00:00+01:00",
        polyline: [[3.37, 6.52]],
        stops: [],
      },
    ]);

    useFieldActivityLiveStore.getState().appendPoint(9, [3.38, 6.53], {
      movementState: "moving",
      recordedAt: "2026-07-29T10:05:00+01:00",
    });

    const agent = useFieldActivityLiveStore.getState().agents[9];
    expect(agent.polyline).toHaveLength(2);
    expect(agent.lastPosition).toEqual([3.38, 6.53]);
  });

  it("upserts stops and supports follow/focus modes", () => {
    useFieldActivityLiveStore.getState().appendPoint(3, [3.1, 6.1], {
      sessionId: 12,
      name: "Agent",
    });
    useFieldActivityLiveStore.getState().upsertStop(3, {
      id: 77,
      field_activity_session_id: 12,
      latitude: 6.1,
      longitude: 3.1,
      classification: "pending",
    });

    expect(useFieldActivityLiveStore.getState().agents[3].stops).toHaveLength(1);

    useFieldActivityLiveStore.getState().setFollowUserId(3);
    expect(useFieldActivityLiveStore.getState().followUserId).toBe(3);
    expect(useFieldActivityLiveStore.getState().focusMode).toBe(true);

    useFieldActivityLiveStore.getState().setFollowAll(true);
    expect(useFieldActivityLiveStore.getState().followAll).toBe(true);
    expect(useFieldActivityLiveStore.getState().followUserId).toBeNull();
  });
});
