import { describe, expect, it } from "vitest";

import {
  getAgentPresenceLabels,
  mapApiPresence,
} from "@/lib/agent-presence";

describe("agent-presence", () => {
  it("maps map-active + session online to map badge and online subtext", () => {
    const labels = getAgentPresenceLabels(
      mapApiPresence({
        is_session_online: true,
        is_map_active: true,
        last_seen_at: new Date().toISOString(),
      }),
      { onboardingStatus: "active", isActive: true },
    );

    expect(labels.badgeLabel).toBe("Active (View on Map)");
    expect(labels.subtextLabel).toBe("Online");
    expect(labels.isMapActive).toBe(true);
    expect(labels.isSessionOnline).toBe(true);
  });

  it("maps session online only to active badge and online subtext", () => {
    const labels = getAgentPresenceLabels(
      mapApiPresence({
        is_session_online: true,
        is_map_active: false,
      }),
      { onboardingStatus: "active", isActive: true },
    );

    expect(labels.badgeLabel).toBe("Active");
    expect(labels.subtextLabel).toBe("Online");
    expect(labels.isMapActive).toBe(false);
    expect(labels.isSessionOnline).toBe(true);
  });

  it("maps both false to offline badge and subtext", () => {
    const labels = getAgentPresenceLabels(
      mapApiPresence({
        is_session_online: false,
        is_map_active: false,
      }),
      { onboardingStatus: "active", isActive: true },
    );

    expect(labels.badgeLabel).toBe("Offline");
    expect(labels.subtextLabel).toBe("Offline");
  });

  it("overrides live presence when onboarding is pending", () => {
    const labels = getAgentPresenceLabels(
      mapApiPresence({
        is_session_online: true,
        is_map_active: true,
      }),
      { onboardingStatus: "pending_onboarding", isActive: true },
    );

    expect(labels.badgeLabel).toBe("Pending onboarding");
    expect(labels.subtextLabel).toBe("Pending onboarding");
    expect(labels.isMapActive).toBe(false);
    expect(labels.isSessionOnline).toBe(false);
  });

  it("shows last seen subtext when map active without session", () => {
    const seenAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const labels = getAgentPresenceLabels(
      mapApiPresence({
        is_session_online: false,
        is_map_active: true,
        last_seen_at: seenAt,
      }),
      { onboardingStatus: "active", isActive: true },
    );

    expect(labels.badgeLabel).toBe("Active (View on Map)");
    expect(labels.subtextLabel).toBe("Last seen 5 min ago");
  });
});
