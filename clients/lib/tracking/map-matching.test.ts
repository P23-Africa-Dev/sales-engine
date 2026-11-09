import { afterEach, describe, expect, it, vi } from "vitest";

import { clearMapMatchingCache, fetchMapMatchingRoute } from "@/lib/tracking/map-matching";

describe("map-matching", () => {
  afterEach(() => {
    clearMapMatchingCache();
    vi.unstubAllGlobals();
  });

  it("returns raw coords when matching is impossible", async () => {
    expect(await fetchMapMatchingRoute([], "token")).toEqual([]);
    expect(await fetchMapMatchingRoute([[3.3, 6.5]], "token")).toEqual([[3.3, 6.5]]);
    expect(await fetchMapMatchingRoute([[3.3, 6.5], [3.31, 6.51]], "")).toEqual([
      [3.3, 6.5],
      [3.31, 6.51],
    ]);
  });

  it("returns raw coords when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 429 })),
    );
    const raw: [number, number][] = [
      [3.3, 6.5],
      [3.31, 6.51],
    ];
    expect(await fetchMapMatchingRoute(raw, "token")).toEqual(raw);
  });

  it("returns snapped geometry on success", async () => {
    const snapped: [number, number][] = [
      [3.3001, 6.5001],
      [3.3101, 6.5101],
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ matchings: [{ geometry: { coordinates: snapped } }] }),
            { status: 200 },
          ),
      ),
    );
    expect(
      await fetchMapMatchingRoute(
        [
          [3.3, 6.5],
          [3.31, 6.51],
        ],
        "token",
      ),
    ).toEqual(snapped);
  });
});
