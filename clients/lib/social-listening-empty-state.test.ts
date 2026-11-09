import { describe, expect, it } from "vitest";

import {
  getSocialListeningEmptyMessage,
  getSocialListeningEmptyState,
} from "@/lib/social-listening-empty-state";
import type { SocialListeningRunStatus } from "@/lib/api/sales-engine";

describe("social-listening-empty-state", () => {
  it("returns null while scanning", () => {
    expect(getSocialListeningEmptyState(null, null, true)).toBeNull();
    expect(getSocialListeningEmptyMessage(null, null, true)).toBe("");
  });

  it("returns no_match_after_scan when completed run has zero signals", () => {
    const latestRun: SocialListeningRunStatus = {
      id: 1,
      status: "completed",
      signals_created: 0,
    };

    const state = getSocialListeningEmptyState(latestRun, "2026-01-01T00:00:00Z", false);

    expect(state?.variant).toBe("no_match_after_scan");
    expect(state?.title).toBeTruthy();
    expect(state?.description).toBeTruthy();
    expect(state?.showActions).toBe(true);
  });

  it("returns filters_no_match when filters are active", () => {
    const state = getSocialListeningEmptyState(null, "2026-01-01T00:00:00Z", false, true);

    expect(state?.variant).toBe("filters_no_match");
    expect(state?.title).toBeTruthy();
    expect(state?.description).toBeTruthy();
    expect(state?.showActions).toBe(false);
  });

  it("names the discrete type and recency window when that filter is empty", () => {
    const state = getSocialListeningEmptyState(null, "2026-01-01T00:00:00Z", false, true, {
      signalTypeLabel: "New Market Entry",
      freshnessWindowDays: 180,
    });

    expect(state?.variant).toBe("filters_no_match");
    expect(state?.title).toBe("No New Market Entry signals in the last 6 months");
  });

  it("returns awaiting_first_scan when no last run exists", () => {
    const state = getSocialListeningEmptyState(null, null, false);

    expect(state?.variant).toBe("awaiting_first_scan");
    expect(state?.title).toBeTruthy();
    expect(state?.description).toBeTruthy();
    expect(state?.showActions).toBe(true);
  });

  it("returns scan_failed with run error message", () => {
    const latestRun: SocialListeningRunStatus = {
      id: 2,
      status: "failed",
      error: "Serper quota exceeded",
    };

    const state = getSocialListeningEmptyState(latestRun, "2026-01-01T00:00:00Z", false);

    expect(state?.variant).toBe("scan_failed");
    expect(state?.description).toContain("Serper quota exceeded");
    expect(state?.showActions).toBe(true);
  });

  it("never returns empty title or description", () => {
    const scenarios = [
      getSocialListeningEmptyState(null, null, false),
      getSocialListeningEmptyState(
        { id: 1, status: "completed", signals_created: 0 },
        "2026-01-01T00:00:00Z",
        false
      ),
      getSocialListeningEmptyState(null, "2026-01-01T00:00:00Z", false, true),
      getSocialListeningEmptyState(
        { id: 2, status: "failed", error: "Network error" },
        "2026-01-01T00:00:00Z",
        false
      ),
    ];

    for (const state of scenarios) {
      expect(state?.title.trim().length).toBeGreaterThan(0);
      expect(state?.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("getSocialListeningEmptyMessage returns description only", () => {
    const message = getSocialListeningEmptyMessage(null, null, false);

    expect(message).toBe(
      "We monitor public posts for buying signals that fit your active ICP."
    );
  });
});
