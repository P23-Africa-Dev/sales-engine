import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/places", () => ({
  placesNearby: vi.fn(),
}));

vi.mock("@/store/map-credits", () => ({
  ingestCreditMeta: vi.fn(),
}));

import { placesNearby } from "@/lib/api/places";
import { fetchPlacesInArea } from "@/lib/map/poi-search";

describe("fetchPlacesInArea Laravel nearby", () => {
  beforeEach(() => {
    vi.mocked(placesNearby).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps orchestrator nearby results", async () => {
    vi.mocked(placesNearby).mockResolvedValueOnce({
      data: [
        {
          id: "p1",
          name: "Cafe",
          formatted_address: "Lagos",
          provider: "geoapify",
          latitude: 6.5,
          longitude: 3.4,
          categories: ["cafe"],
        },
        {
          id: "p2",
          name: "Bank",
          formatted_address: "Lagos",
          provider: "foursquare",
          latitude: 6.51,
          longitude: 3.41,
          categories: ["bank"],
        },
        {
          id: "p3",
          name: "Hotel",
          formatted_address: "Lagos",
          provider: "google",
          latitude: 6.52,
          longitude: 3.42,
          categories: ["hotel"],
        },
      ],
    });

    const results = await fetchPlacesInArea({
      name: "test",
      center: [3.4, 6.5],
      radiusKm: 1,
    });

    expect(results.length).toBe(3);
    expect(placesNearby).toHaveBeenCalledTimes(1);
  });
});
