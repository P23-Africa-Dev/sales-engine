import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChatMessageRequestBody, sendChatMessage } from "./sales-engine";

vi.mock("@/lib/sales-engine/session", () => ({
  getSalesEngineOrgId: () => "7",
  getSalesEngineToken: () => "native-token",
  clearSalesEngineSession: vi.fn(),
  setSalesEngineSession: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

function okJson(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

describe("sendChatMessage payload", () => {
  it("sends entity_mode and count as JSON fields and leaves the prompt untouched", async () => {
    const fetch = vi.fn().mockResolvedValue(
      okJson({
        user_message: { id: 10, role: "user", body: "logistics operators in Lagos" },
        assistant_message: { id: 11, role: "assistant", body: "Here are your prospects." },
        status: "completed",
      })
    );
    vi.stubGlobal("fetch", fetch);

    await sendChatMessage(42, {
      body: "logistics operators in Lagos",
      intent: "generate_leads",
      entity_mode: "companies",
      count: 25,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/chat\/sessions\/42\/messages$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      body: "logistics operators in Lagos",
      intent: "generate_leads",
      entity_mode: "companies",
      count: 25,
    });
    expect(JSON.parse(init.body).body).not.toMatch(/only\)|give me \d+/i);
  });

  it("omits the optional fields when they are not provided (older-backend compatible)", async () => {
    const fetch = vi.fn().mockResolvedValue(
      okJson({
        user_message: { id: 1, role: "user", body: "hello" },
        assistant_message: { id: 2, role: "assistant", body: "hi" },
      })
    );
    vi.stubGlobal("fetch", fetch);

    await sendChatMessage(5, { body: "hello", intent: "freeform" });

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ body: "hello", intent: "freeform" });
  });

  it("drops invalid counts and rounds valid ones", () => {
    expect(buildChatMessageRequestBody({ body: "x", intent: "generate_leads", count: 0 })).toEqual({
      body: "x",
      intent: "generate_leads",
    });
    expect(
      buildChatMessageRequestBody({ body: "x", intent: "generate_leads", count: 12.4, entity_mode: "both" })
    ).toEqual({ body: "x", intent: "generate_leads", count: 12, entity_mode: "both" });
  });
});
