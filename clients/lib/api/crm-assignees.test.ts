import { afterEach, describe, expect, it, vi } from "vitest";

import { listCrmAssignees } from "@/lib/api/crm";

describe("listCrmAssignees", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests organization CRM assignees from the native Sales Engine API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: "CRM assignees fetched successfully.",
        data: { items: [] },
        errors: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listCrmAssignees(12, "token-abc");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/crm\/assignees\?company_id=12$/),
      expect.objectContaining({ method: "GET" }),
    );
  });
});
