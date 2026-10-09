import { describe, expect, it, vi } from "vitest";

import { resolveMeetingTimezone, resolveUserTimezone } from "@/lib/meeting-timezone";

describe("meeting-timezone", () => {
  it("resolveUserTimezone returns an IANA timezone string", () => {
    const timezone = resolveUserTimezone();
    expect(timezone.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: timezone })).not.toThrow();
  });

  it("resolveMeetingTimezone prefers explicit timezone when valid", () => {
    const timezone = resolveMeetingTimezone("Europe/Berlin", ["UTC", "Europe/Berlin"]);
    expect(timezone).toBe("Europe/Berlin");
  });

  it("resolveMeetingTimezone falls back to device timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/Los_Angeles" }),
    } as Intl.DateTimeFormat);

    const timezone = resolveMeetingTimezone(undefined, ["UTC", "America/Los_Angeles"]);
    expect(timezone).toBe("America/Los_Angeles");
  });
});
