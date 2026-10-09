import { describe, expect, it } from "vitest";
import { buildTaskMapUrl, getMapBasePathForRole, parseTaskMapParams } from "./map-navigation";

describe("getMapBasePathForRole", () => {
  it("routes management roles to the management map", () => {
    for (const role of ["owner", "admin", "management", "manager", "supervisor"]) {
      expect(getMapBasePathForRole(role)).toBe("/map");
    }
  });

  it("routes agents and unknown roles to the agent map", () => {
    expect(getMapBasePathForRole("agent")).toBe("/agent/map");
    expect(getMapBasePathForRole(null)).toBe("/agent/map");
    expect(getMapBasePathForRole(undefined)).toBe("/agent/map");
  });
});

describe("buildTaskMapUrl", () => {
  it("builds a URL with taskId and coordinates", () => {
    const url = buildTaskMapUrl(
      { id: 42, latitude: 6.5244, longitude: 3.3792, location: "Ikeja" },
      "agent",
    );
    expect(url).toBe("/agent/map?taskId=42&lat=6.5244&lng=3.3792&title=Ikeja");
  });

  it("uses the management map for admin roles", () => {
    const url = buildTaskMapUrl({ id: "7", latitude: 1, longitude: 2 }, "admin");
    expect(url).toMatch(/^\/map\?/);
  });

  it("returns null when coordinates are missing or invalid", () => {
    expect(buildTaskMapUrl({ id: 1 })).toBeNull();
    expect(buildTaskMapUrl({ id: 1, latitude: null, longitude: null })).toBeNull();
    expect(buildTaskMapUrl({ id: 1, latitude: Number.NaN, longitude: 3 })).toBeNull();
  });

  it("includes address when provided", () => {
    const url = buildTaskMapUrl(
      { id: 1, latitude: 1, longitude: 2, address: "12 Allen Ave" },
      "agent",
    );
    expect(url).toContain("address=12+Allen+Ave");
  });
});

describe("parseTaskMapParams", () => {
  it("round-trips a URL built with buildTaskMapUrl", () => {
    const url = buildTaskMapUrl(
      { id: 42, latitude: 6.5244, longitude: 3.3792, location: "Ikeja", address: "Lagos" },
      "agent",
    );
    const params = new URLSearchParams(url!.split("?")[1]);
    expect(parseTaskMapParams(params)).toEqual({
      taskId: 42,
      lat: 6.5244,
      lng: 3.3792,
      title: "Ikeja",
      address: "Lagos",
    });
  });

  it("returns null when required params are missing", () => {
    expect(parseTaskMapParams(new URLSearchParams(""))).toBeNull();
    expect(parseTaskMapParams(new URLSearchParams("taskId=1"))).toBeNull();
    expect(parseTaskMapParams(new URLSearchParams("taskId=1&lat=abc&lng=3"))).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    expect(parseTaskMapParams(new URLSearchParams("taskId=1&lat=91&lng=3"))).toBeNull();
    expect(parseTaskMapParams(new URLSearchParams("taskId=1&lat=3&lng=181"))).toBeNull();
  });
});
