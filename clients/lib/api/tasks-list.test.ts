import { afterEach, describe, expect, it, vi } from "vitest";

import { listTasks } from "@/lib/api/tasks";

describe("listTasks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests only the authenticated user's assignments when selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: "Tasks fetched successfully.",
        data: {
          items: [],
          pagination: { next_page_url: null, prev_page_url: null, per_page: 20 },
        },
        errors: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listTasks({ company_id: 12, assigned_to_me: true }, "token-abc");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/tasks\?company_id=12&assigned_to_me=1$/),
      expect.objectContaining({ method: "GET" }),
    );
  });
});
