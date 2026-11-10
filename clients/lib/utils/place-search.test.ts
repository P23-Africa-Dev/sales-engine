import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/places", () => ({
  placesAutocomplete: vi.fn(),
  placesDetails: vi.fn(),
}));

import { placesAutocomplete, placesDetails } from "@/lib/api/places";
import {
  __resetPlaceSearchCachesForTests,
  getPlacesAttributionVisible,
  retrievePlace,
  suggestPlaces,
} from "@/lib/utils/place-search";

describe("suggestPlaces Laravel client", () => {
  beforeEach(() => {
    __resetPlaceSearchCachesForTests();
    vi.mocked(placesAutocomplete).mockReset();
    vi.mocked(placesDetails).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps Laravel autocomplete results", async () => {
    vi.mocked(placesAutocomplete).mockResolvedValueOnce({
      data: [
        {
          id: "1",
          name: "Shoprite",
          formatted_address: "Lekki",
          provider: "geoapify",
          latitude: 6.4,
          longitude: 3.4,
        },
      ],
      meta: { provider: "geoapify", cache_hit: false },
    });

    const results = await suggestPlaces("shoprite", { sessionToken: "s1" });
    expect(results).toHaveLength(1);
    expect(results[0]?.provider).toBe("geoapify");
    expect(placesAutocomplete).toHaveBeenCalledTimes(1);
  });

  it("serves client cache on repeat query", async () => {
    vi.mocked(placesAutocomplete).mockResolvedValue({
      data: [
        {
          id: "2",
          name: "Ikeja",
          formatted_address: "Lagos",
          provider: "geoapify",
        },
      ],
    });

    await suggestPlaces("ikeja", { sessionToken: "a" });
    await suggestPlaces("ikeja", { sessionToken: "b" });
    expect(placesAutocomplete).toHaveBeenCalledTimes(1);
  });

  it("dedupes in-flight suggests", async () => {
    let resolveFn!: (v: unknown) => void;
    vi.mocked(placesAutocomplete).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }) as Promise<{ data: [] }>,
    );

    const p1 = suggestPlaces("hotel", { sessionToken: "s1" });
    const p2 = suggestPlaces("hotel", { sessionToken: "s2" });
    resolveFn({
      data: [{ id: "h1", name: "Hotel", formatted_address: "Lagos", provider: "foursquare" }],
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1[0]?.id).toBe("h1");
    expect(r2[0]?.id).toBe("h1");
    expect(placesAutocomplete).toHaveBeenCalledTimes(1);
  });

  it("does not cache empty autocomplete responses", async () => {
    vi.mocked(placesAutocomplete)
      .mockResolvedValueOnce({ data: [], meta: { provider: null, status: "empty" } })
      .mockResolvedValueOnce({
        data: [
          {
            id: "j1",
            name: "Jara Mall",
            formatted_address: "Lagos",
            provider: "foursquare",
          },
        ],
      });

    const empty = await suggestPlaces("jara mall", { sessionToken: "a" });
    expect(empty).toHaveLength(0);

    const filled = await suggestPlaces("jara mall", { sessionToken: "b" });
    expect(filled).toHaveLength(1);
    expect(filled[0]?.provider).toBe("foursquare");
    expect(placesAutocomplete).toHaveBeenCalledTimes(2);
  });

  it("retrievePlace calls Laravel details", async () => {
    vi.mocked(placesDetails).mockResolvedValueOnce({
      data: [
        {
          id: "1",
          name: "Shoprite",
          formatted_address: "Lekki Phase 1",
          provider: "geoapify",
          latitude: 6.45,
          longitude: 3.47,
        },
      ],
    });

    const place = await retrievePlace({
      id: "1",
      name: "Shoprite",
      placeFormatted: "Lekki",
      provider: "geoapify",
      category: null,
      sessionToken: "s",
    });

    expect(place?.lat).toBe(6.45);
    expect(placesDetails).toHaveBeenCalledWith("1", "geoapify");
  });

  it("retrievePlace skips details when suggestion already has coords", async () => {
    const place = await retrievePlace({
      id: "f1",
      name: "Jara Mall",
      placeFormatted: "Ikeja",
      provider: "foursquare",
      category: null,
      sessionToken: "s",
      latitude: 6.601,
      longitude: 3.351,
    });

    expect(place?.lat).toBe(6.601);
    expect(place?.lng).toBe(3.351);
    expect(place?.provider).toBe("foursquare");
    expect(placesDetails).not.toHaveBeenCalled();
  });

  it("maps sources and attribution_visible from Laravel meta", async () => {
    vi.mocked(placesAutocomplete).mockResolvedValueOnce({
      data: [
        {
          id: "fsq_1",
          name: "Shoprite",
          formatted_address: "Ikeja",
          provider: "foursquare",
          sources: [
            { provider: "foursquare", id: "fsq_1" },
            { provider: "geoapify", id: "geo_1" },
          ],
        },
      ],
      meta: { attribution_visible: false, provider: "foursquare" },
    });

    const results = await suggestPlaces("shoprite", { sessionToken: "s1" });
    expect(results[0]?.sources).toHaveLength(2);
    expect(results[0]?.attributionVisible).toBe(false);
    expect(getPlacesAttributionVisible()).toBe(false);
  });
});
