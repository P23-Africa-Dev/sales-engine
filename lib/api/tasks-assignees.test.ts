import { afterEach, describe, expect, it, vi } from "vitest";

import { listTaskAssignees } from "@/lib/api/tasks";

describe("listTaskAssignees", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests assignable users for the active company", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: "Task assignees fetched successfully.",
        data: { items: [] },
        errors: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listTaskAssignees({ company_id: 12 }, "token-abc");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/tasks\/assignees\?company_id=12$/),
      expect.objectContaining({ method: "GET" }),
    );
  });
});
