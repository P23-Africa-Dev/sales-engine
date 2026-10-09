import { describe, expect, it } from "vitest";
import { resolveCrmPipelineId } from "./resolve-pipeline";

describe("resolveCrmPipelineId", () => {
  const pipelines = [
    { id: 10, is_default: false, sort_order: 2 },
    { id: 20, is_default: true, sort_order: 1 },
    { id: 30, is_default: false, sort_order: 0 },
  ];

  it("prefers the personal preferred pipeline", () => {
    expect(resolveCrmPipelineId(pipelines, 10, 20)).toBe(10);
  });

  it("falls back to the company default when preferred is missing", () => {
    expect(resolveCrmPipelineId(pipelines, 999, 20)).toBe(20);
    expect(resolveCrmPipelineId(pipelines, null, null)).toBe(20);
  });

  it("falls back to the first sorted pipeline when no defaults exist", () => {
    const withoutDefaults = pipelines.map((pipeline) => ({
      ...pipeline,
      is_default: false,
    }));
    expect(resolveCrmPipelineId(withoutDefaults, null, null)).toBe(30);
  });

  it("returns null for an empty list", () => {
    expect(resolveCrmPipelineId([], 1, 2)).toBeNull();
  });
});
