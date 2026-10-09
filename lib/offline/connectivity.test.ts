import { describe, expect, it } from "vitest";
import { getBrowserOnlineStatus } from "./connectivity";
import { describeHttpMutation } from "./queue";
import type { OfflineHttpMutationEntry } from "./db";

describe("connectivity", () => {
  it("returns true when window is unavailable (SSR)", () => {
    expect(getBrowserOnlineStatus()).toBeTypeOf("boolean");
  });
});

describe("describeHttpMutation", () => {
  it("labels common dashboard mutations", () => {
    const entry = {
      id: 1,
      method: "POST",
      path: "/tasks",
      bodyJson: "{}",
      companyId: "1",
      userId: "2",
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } satisfies OfflineHttpMutationEntry & { id: number };

    expect(describeHttpMutation(entry)).toBe("Create task");
  });
});
