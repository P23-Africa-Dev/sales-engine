import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerSessionState } from "@/lib/auth/server-session";

describe("server-session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats non-ok profile responses as unauthenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      })
    );

    await expect(getServerSessionState("stale-token")).resolves.toEqual({
      isAuthenticated: false,
      onboardingCompleted: false,
      hasActiveSubscription: false,
      hasPaidSubscription: false,
      billingEnforced: true,
      role: null,
    });
  });

  it("maps a valid profile response into auth and onboarding state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            onboarding_completed: true,
            active_company: {
              role: "owner",
              has_active_subscription: true,
              billing_enforced: false,
            },
            billing: {
              has_active_subscription: true,
              billing_enforced: false,
            },
          },
        }),
      })
    );

    await expect(getServerSessionState("valid-token")).resolves.toEqual({
      isAuthenticated: true,
      onboardingCompleted: true,
      hasActiveSubscription: true,
      hasPaidSubscription: false,
      billingEnforced: false,
      role: "owner",
    });
  });
});
