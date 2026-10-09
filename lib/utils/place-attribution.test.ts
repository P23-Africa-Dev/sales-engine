import { describe, expect, it } from "vitest";
import { placeAttributionLabel } from "@/lib/utils/place-attribution";

describe("placeAttributionLabel", () => {
  it("formats multi-source badges", () => {
    expect(
      placeAttributionLabel(
        [
          { provider: "foursquare", id: "a" },
          { provider: "geoapify", id: "b" },
        ],
        "foursquare",
        true,
      ),
    ).toBe("via Foursquare · Geoapify");
  });

  it("falls back to canonical provider", () => {
    expect(placeAttributionLabel(undefined, "google", true)).toBe("via Google");
  });

  it("hides when attribution_visible is false", () => {
    expect(
      placeAttributionLabel(
        [{ provider: "foursquare", id: "a" }],
        "foursquare",
        false,
      ),
    ).toBeNull();
  });

  it("dedupes providers case-insensitively", () => {
    expect(
      placeAttributionLabel(
        [
          { provider: "Foursquare", id: "a" },
          { provider: "foursquare", id: "b" },
          { provider: "google", id: "c" },
        ],
        "foursquare",
        true,
      ),
    ).toBe("via Foursquare · Google");
  });
});
