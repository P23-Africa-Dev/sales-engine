import { describe, expect, it } from "vitest";

import {
  labelsForSocialScanStage,
  mapSocialListeningStage,
  signalsFoundLabel,
} from "@/lib/social-listening-processing-labels";

describe("social-listening-processing-labels", () => {
  it("never exposes raw queued label to UI", () => {
    const info = mapSocialListeningStage(["queued"]);
    expect(info.label.toLowerCase()).not.toContain("queued");
    expect(info.stepIndex).toBe(0);
  });

  it("maps enriching stage to score step", () => {
    const info = mapSocialListeningStage(["analyzing_icp", "searching_sources", "enriching"]);
    expect(info.stepIndex).toBe(2);
    expect(info.label).toContain("Scoring");
  });

  it("personalizes search stage with ICP context", () => {
    const info = mapSocialListeningStage(["searching_sources"], {
      industries: ["Fintech"],
      territories: ["Lagos, NG"],
    });

    expect(info.label).toContain("Fintech");
    expect(info.label).toContain("Lagos, NG");
  });

  it("includes enabled sources in rotation labels", () => {
    const labels = labelsForSocialScanStage("searching_sources", undefined, ["linkedin", "reddit"]);

    expect(labels.some((label) => label.includes("LinkedIn"))).toBe(true);
    expect(labels.some((label) => label.includes("Reddit"))).toBe(true);
  });

  it("never includes Queued in stage rotation sequences", () => {
    for (const stage of ["queued", "analyzing_icp", "searching_sources", "enriching"]) {
      const labels = labelsForSocialScanStage(stage);
      for (const label of labels) {
        expect(label.toLowerCase()).not.toContain("queued");
      }
    }
  });

  it("formats signals found secondary label", () => {
    expect(signalsFoundLabel(0)).toBeNull();
    expect(signalsFoundLabel(1)).toBe("Found 1 potential match so far…");
    expect(signalsFoundLabel(5)).toBe("Found 5 potential matches so far…");
  });
});
