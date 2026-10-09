import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("offline-shell", () => {
  const offlineHtml = readFileSync(
    join(process.cwd(), "public", "offline.html"),
    "utf8",
  );

  it("includes offline animation keyframes", () => {
    expect(offlineHtml).toContain("@keyframes pulseRing");
    expect(offlineHtml).toContain("@keyframes bounceDot");
  });

  it("does not expose dashboard navigation links", () => {
    expect(offlineHtml).not.toContain('href="/dashboard"');
    expect(offlineHtml).not.toContain('href="/tasks"');
    expect(offlineHtml).not.toContain('href="/projects"');
    expect(offlineHtml).not.toContain('href="/operations"');
    expect(offlineHtml).not.toContain("Dashboard");
    expect(offlineHtml).not.toContain("Operations");
  });

  it("includes retry and reconnect behavior", () => {
    expect(offlineHtml).toContain("Try again");
    expect(offlineHtml).toContain('addEventListener("online"');
    expect(offlineHtml).toContain("/manifest.webmanifest");
  });
});
