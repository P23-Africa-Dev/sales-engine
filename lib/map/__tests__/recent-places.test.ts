import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
});

vi.mock("@/lib/auth/session", () => ({
  getAuthTokenFromDocument: () => null,
}));

import {
  getLocalRecentPlaces,
  saveLocalRecentPlace,
} from "@/lib/map/recent-places";

describe("recent-places local cache", () => {
  beforeEach(() => {
    store.clear();
  });

  it("saves and returns recent places newest-first", () => {
    saveLocalRecentPlace({
      name: "Jara Mall",
      address: "Ikeja",
      latitude: 6.6,
      longitude: 3.35,
      provider: "foursquare",
      provider_place_id: "f1",
    });
    saveLocalRecentPlace({
      name: "Shoprite",
      latitude: 6.5,
      longitude: 3.4,
      provider: "geoapify",
      provider_place_id: "g1",
    });

    const items = getLocalRecentPlaces();
    expect(items[0]?.name).toBe("Shoprite");
    expect(items[1]?.name).toBe("Jara Mall");
  });

  it("dedupes by provider place id", () => {
    saveLocalRecentPlace({
      name: "Jara Mall",
      latitude: 6.6,
      longitude: 3.35,
      provider: "foursquare",
      provider_place_id: "f1",
    });
    saveLocalRecentPlace({
      name: "Jara Mall Ikeja",
      latitude: 6.601,
      longitude: 3.351,
      provider: "foursquare",
      provider_place_id: "f1",
    });

    expect(getLocalRecentPlaces()).toHaveLength(1);
    expect(getLocalRecentPlaces()[0]?.name).toBe("Jara Mall Ikeja");
  });
});
