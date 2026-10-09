import { describe, expect, it } from "vitest";
import { formatProfileUrlsForExport, isValidUrl, normalizeWebsite, parseProfileUrls } from "./lead-fields";

describe("lead-fields", () => {
  it("parses comma-separated profile urls", () => {
    expect(parseProfileUrls("https://a.com, https://b.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("normalizes website without scheme", () => {
    expect(normalizeWebsite("acme.com")).toBe("https://acme.com");
  });

  it("validates urls", () => {
    expect(isValidUrl("https://linkedin.com/in/jane")).toBe(true);
    expect(isValidUrl("not-a-url")).toBe(false);
    expect(isValidUrl("")).toBe(true);
  });

  it("formats profile urls for export", () => {
    expect(formatProfileUrlsForExport(["https://a.com", "https://b.com"])).toBe(
      "https://a.com, https://b.com"
    );
  });
});
