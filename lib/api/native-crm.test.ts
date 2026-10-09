import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeCrmRequest } from "./native-crm";
import { pushLeadToCrm, syncLeadsBatch } from "./sales-engine";

vi.mock("@/lib/sales-engine/session", () => ({ getSalesEngineOrgId: () => "7", getSalesEngineToken: () => "native-token", clearSalesEngineSession: vi.fn(), setSalesEngineSession: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe("native CRM integration", () => {
  it("uses the native token and organization instead of Factory role-prefixed endpoints", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [] } }) });
    vi.stubGlobal("fetch", fetch);
    await nativeCrmRequest({ method: "GET", path: "/admin/crm/pipelines", token: "factory-token" });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/crm\/pipelines$/), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer native-token", "X-Organization-Id": "7" }) }));
  });

  it("explains an undeployed CRM API without masking a missing lead", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ message: "The route api/v1/crm/pipelines could not be found." }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ message: "Lead not found" }) });
    vi.stubGlobal("fetch", fetch);
    await expect(nativeCrmRequest({ method: "GET", path: "/crm/pipelines" })).rejects.toThrow("Deploy the backend changes");
    await expect(nativeCrmRequest({ method: "GET", path: "/crm/leads/123" })).rejects.toThrow("Lead not found");
  });

  it("splits large confirmed saves into bounded batches and preserves partial errors", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { synced: [{ lead_id: 1 }], errors: ["Lead 2 failed"] } }) }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { synced: [{ lead_id: 26 }], errors: [] } }) });
    vi.stubGlobal("fetch", fetch);
    const result = await syncLeadsBatch(Array.from({ length: 26 }, (_, i) => i + 1), { pipeline_id: "12" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ lead_ids: Array.from({ length: 25 }, (_, i) => i + 1), pipeline_id: "12" });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ lead_ids: [26], pipeline_id: "12" });
    expect(result).toEqual({ synced: [{ lead_id: 1 }, { lead_id: 26 }], errors: ["Lead 2 failed"] });
  });

  it("treats a rejected single save as an error instead of a success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { synced: [], errors: ["Lead not found"] } }) }));
    await expect(pushLeadToCrm(123, { pipeline_id: 12 })).rejects.toThrow("Lead not found");
  });
});
