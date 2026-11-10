import {
  arePoiResultsAcceptable,
  areSuggestResultsAcceptable,
} from "@/lib/map/place-result-quality";

describe("areSuggestResultsAcceptable", () => {
  it("rejects empty results", () => {
    expect(areSuggestResultsAcceptable([])).toBe(false);
  });

  it("accepts Mapbox results with name + formatted address", () => {
    expect(
      areSuggestResultsAcceptable([
        {
          name: "Tesco",
          placeFormatted: "High Street, London",
          featureType: "poi",
        },
      ]),
    ).toBe(true);
  });

  it("rejects results missing placeFormatted", () => {
    expect(
      areSuggestResultsAcceptable([{ name: "Tesco", placeFormatted: "" }]),
    ).toBe(false);
  });

  it("requires address-ish results for address-like queries", () => {
    expect(
      areSuggestResultsAcceptable(
        [
          {
            name: "London",
            placeFormatted: "United Kingdom",
            featureType: "place",
          },
        ],
        { query: "12 High Street" },
      ),
    ).toBe(false);

    expect(
      areSuggestResultsAcceptable(
        [
          {
            name: "12 High Street",
            placeFormatted: "12 High Street, London, SW1A 1AA",
            featureType: "address",
          },
        ],
        { query: "12 High Street" },
      ),
    ).toBe(true);
  });
});

describe("arePoiResultsAcceptable", () => {
  it("requires minCount POIs with coords and names", () => {
    expect(
      arePoiResultsAcceptable(
        [
          { lat: 51.5, lng: -0.1, name: "A" },
          { lat: 51.51, lng: -0.11, name: "B" },
        ],
        { minCount: 3 },
      ),
    ).toBe(false);

    expect(
      arePoiResultsAcceptable(
        [
          { lat: 51.5, lng: -0.1, name: "A" },
          { lat: 51.51, lng: -0.11, name: "B" },
          { lat: 51.52, lng: -0.12, name: "C" },
        ],
        { minCount: 3 },
      ),
    ).toBe(true);
  });
});
