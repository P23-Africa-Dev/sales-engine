import { describe, expect, it } from "vitest";

import type { AppNotification } from "@/lib/api/notifications";
import { resolveWebNotificationUrl } from "./notification-panel";

function note(partial: Partial<AppNotification>): AppNotification {
  return {
    id: 1,
    user_id: 1,
    type: "tracking.task.started",
    category: "tracking",
    title: "Tracking started",
    message: "Agent started",
    priority: "high",
    is_in_app_visible: true,
    is_read: false,
    created_at: "2026-07-27T10:00:00.000Z",
    ...partial,
  };
}

describe("resolveWebNotificationUrl", () => {
  it("maps /map?taskId= deep-links for managers", () => {
    expect(
      resolveWebNotificationUrl(note({ action_url: "/map?taskId=99" }), false),
    ).toBe("/map?taskId=99");
  });

  it("maps tracking types without action_url to Map via metadata", () => {
    expect(
      resolveWebNotificationUrl(
        note({
          action_url: null,
          action_route: null,
          metadata: { task_id: 55 },
          reference_id: 55,
        }),
        false,
      ),
    ).toBe("/map?taskId=55");
  });

  it("rewrites legacy /tasks/{id} tracking links to Map for managers", () => {
    expect(
      resolveWebNotificationUrl(
        note({
          action_url: "/tasks/77",
          type: "tracking.task.started",
          reference_id: 77,
          metadata: { task_id: 77 },
        }),
        false,
      ),
    ).toBe("/map?taskId=77");
  });

  it("keeps task links for agents on tracking notifications", () => {
    expect(
      resolveWebNotificationUrl(
        note({ action_url: "/tasks/77", type: "tracking.task.started" }),
        true,
      ),
    ).toBe("/agent/tasks/77");
  });
});
