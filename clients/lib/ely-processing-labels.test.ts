import { describe, expect, it } from "vitest";

import {
  LATE_ENGAGEMENT_LABELS,
  labelsForMessage,
  nextProcessingLabelIndex,
} from "@/lib/ely-processing-labels";

describe("ely-processing-labels", () => {
  it("returns default sequence with late engagement fillers", () => {
    const labels = labelsForMessage("Hello ELY");

    expect(labels[0]).toBe("Thinking...");
    expect(labels).toContain("Analyzing your request...");
    for (const filler of LATE_ENGAGEMENT_LABELS) {
      expect(labels).toContain(filler);
    }
  });

  it("uses task list sequence for list-by-agent phrasing", () => {
    const labels = labelsForMessage("Give me the list of tasks created by Agent John");

    expect(labels[0]).toBe("Thinking...");
    expect(labels).toContain("Looking up tasks...");
    expect(labels).toContain("Almost there...");
  });

  it("uses task create sequence for explicit create phrasing", () => {
    const labels = labelsForMessage("Create a task and assign it to John");

    expect(labels).toContain("Preparing task...");
    expect(labels).toContain("Validating details...");
  });

  it("uses CRM sequence for lead follow-up phrasing", () => {
    const labels = labelsForMessage("Who needs a CRM follow-up?");

    expect(labels).toContain("Scanning CRM records...");
    expect(labels).toContain("Sorting leads...");
  });

  it("loops label indexes so status never freezes", () => {
    const labels = labelsForMessage("Hello");
    let index = 0;

    for (let step = 0; step < labels.length + 3; step += 1) {
      index = nextProcessingLabelIndex(labels, index);
    }

    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(labels.length);
    expect(labels[index]).toBeTruthy();
  });
});
