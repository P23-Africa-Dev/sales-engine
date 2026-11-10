import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  downloadTaskProof,
  formatProofBytes,
  triggerProofBlobDownload,
} from "@/lib/api/tasks";
import { ApiRequestError } from "@/lib/api/onboarding";

describe("downloadTaskProof", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.NEXT_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.test/api/v1";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_BASE_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it("sends Authorization header and company_id query", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => blob,
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await downloadTaskProof(10, 22, { company_id: 99 }, "token-abc");

    expect(result).toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v1/tasks/10/proofs/22?company_id=99",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-abc",
          Accept: "*/*",
        }),
      }),
    );
  });

  it("parses API JSON error messages on failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        message: "Unauthenticated. Please log in to continue.",
        data: null,
        errors: null,
      }),
    }) as typeof fetch;

    await expect(downloadTaskProof(1, 2, { company_id: 3 }, "bad")).rejects.toMatchObject({
      message: "Unauthenticated. Please log in to continue.",
      status: 401,
    } satisfies Partial<ApiRequestError>);
  });
});

describe("triggerProofBlobDownload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a temporary object URL and clicks a download anchor", () => {
    const createObjectURL = vi.fn(() => "blob:proof-1");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    const click = vi.fn();
    const remove = vi.fn();
    const anchor = {
      href: "",
      download: "",
      click,
      remove,
    } as unknown as HTMLAnchorElement;

    const createElement = vi.spyOn(document, "createElement").mockReturnValue(anchor);
    const appendChild = vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);

    triggerProofBlobDownload(new Blob(["x"], { type: "image/jpeg" }), "evidence.jpg");

    expect(createObjectURL).toHaveBeenCalled();
    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe("blob:proof-1");
    expect(anchor.download).toBe("evidence.jpg");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:proof-1");
  });
});

describe("formatProofBytes", () => {
  it("formats byte sizes", () => {
    expect(formatProofBytes(500)).toBe("500 B");
    expect(formatProofBytes(2048)).toBe("2.0 KB");
    expect(formatProofBytes(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(formatProofBytes(null)).toBe("");
  });
});
