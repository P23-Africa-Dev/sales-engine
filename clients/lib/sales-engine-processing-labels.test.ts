import { describe, expect, it } from "vitest";

import { mapDiscoveryStage } from "@/lib/api/sales-engine";
import {
  labelsForFreeformMessage,
  labelsForIntent,
  nextProcessingLabelIndex,
} from "@/lib/sales-engine-processing-labels";

describe("sales-engine-processing-labels", () => {
  it("never includes Queued in intent sequences", () => {
    for (const intent of ["quick_research", "generate_leads", "create_outreach", "freeform"] as const) {
      const labels = labelsForIntent(intent, "Find leads in Lagos", {
        industries: ["FMCG & Retail"],
        territories: ["Lagos, NG"],
      });

      expect(labels.length).toBeGreaterThanOrEqual(6);
      for (const label of labels) {
        expect(label.toLowerCase()).not.toContain("queued");
      }
    }
  });

  it("includes ICP personalization in generate_leads sequence", () => {
    const labels = labelsForIntent("generate_leads", "Find leads", {
      industries: ["Fintech"],
      territories: ["Lagos, NG"],
    });

    expect(labels.some((label) => label.includes("Fintech"))).toBe(true);
    expect(labels.some((label) => label.includes("Lagos, NG"))).toBe(true);
  });

  it("uses research-oriented labels for freeform market questions", () => {
    const labels = labelsForFreeformMessage("What are the market trends for fintech in Nigeria?");

    expect(labels).toContain("Gathering market context…");
    expect(labels).toContain("Cross-referencing sources…");
  });

  it("includes late engagement fillers", () => {
    const labels = labelsForIntent("quick_research", "Research competitors");

    expect(labels).toContain("Cross-checking citations…");
    expect(labels).toContain("Packaging sources…");
    expect(labels.some((label) => /account|prospect|lead/i.test(label))).toBe(false);
  });

  it("grounds quick research in ICP without lead language", () => {
    const labels = labelsForIntent("quick_research", "Are there any upcoming FinTech events?", {
      industries: ["Fintech & Payments"],
      territories: ["Lagos, NG"],
      name: "My Tech ICP",
    });

    expect(labels.some((label) => label.includes("Grounding in Fintech & Payments"))).toBe(true);
    expect(labels.some((label) => /accounts|prospects/i.test(label))).toBe(false);
  });

  it("loops label indexes", () => {
    const labels = labelsForIntent("generate_leads", "Find leads");
    let index = 0;

    for (let step = 0; step < labels.length + 2; step += 1) {
      index = nextProcessingLabelIndex(labels, index);
    }

    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(labels.length);
  });
});

describe("mapDiscoveryStage", () => {
  it("maps queued to intent-specific first step label", () => {
    const info = mapDiscoveryStage(["queued"], "generate_leads");

    expect(info.label.toLowerCase()).not.toContain("queued");
    expect(info.label).toContain("ICP brief");
    expect(info.stepIndex).toBe(0);
    expect(info.totalSteps).toBe(4);
  });

  it("maps searching_sources to step 1", () => {
    const info = mapDiscoveryStage(["analyzing_brief", "searching_sources"], "quick_research");

    expect(info.stepIndex).toBe(1);
    expect(info.label).toContain("Searching sources in parallel");
  });

  it("uses progress step when provided", () => {
    const info = mapDiscoveryStage(["searching_sources"], "generate_leads", {
      step: 3,
      total_steps: 4,
      sources_checked: 2,
      candidates_found: 5,
    });

    expect(info.stepIndex).toBe(2);
    expect(info.progress?.candidates_found).toBe(5);
  });
});
