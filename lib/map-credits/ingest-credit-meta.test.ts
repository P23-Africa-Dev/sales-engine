import { beforeEach, describe, expect, it } from "vitest";
import { ingestCreditMeta, useMapCreditStore } from "@/store/map-credits";

describe("ingestCreditMeta", () => {
  beforeEach(() => {
    useMapCreditStore.setState({ lastMeta: null, lastEventAt: 0 });
  });

  it("stores a full credit meta signal and bumps the event timestamp", () => {
    const before = Date.now();
    ingestCreditMeta({ metered: true, low: true, blocked: false, balance: 123.45 });

    const state = useMapCreditStore.getState();
    expect(state.lastMeta).toEqual({
      metered: true,
      low: true,
      blocked: false,
      balance: 123.45,
    });
    expect(state.lastEventAt).toBeGreaterThanOrEqual(before);
  });

  it("normalizes a non-numeric balance to null and coerces flags", () => {
    ingestCreditMeta({ metered: 1, blocked: "yes" });

    expect(useMapCreditStore.getState().lastMeta).toEqual({
      metered: true,
      low: false,
      blocked: true,
      balance: null,
    });
  });

  it("ignores payloads without any credit fields", () => {
    ingestCreditMeta({ results: [], enabled: true });
    expect(useMapCreditStore.getState().lastMeta).toBeNull();

    ingestCreditMeta(null);
    ingestCreditMeta("nope");
    expect(useMapCreditStore.getState().lastMeta).toBeNull();
  });

  it("keeps only the most recent signal", () => {
    ingestCreditMeta({ metered: true, low: false, blocked: false, balance: 500 });
    ingestCreditMeta({ metered: true, low: true, blocked: false, balance: 40 });

    expect(useMapCreditStore.getState().lastMeta?.balance).toBe(40);
    expect(useMapCreditStore.getState().lastMeta?.low).toBe(true);
  });
});
