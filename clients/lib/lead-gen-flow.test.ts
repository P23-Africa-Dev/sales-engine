import { describe, expect, it } from "vitest";

import {
  labelsForIntent,
} from "@/lib/sales-engine-processing-labels";

describe("lead gen api types", () => {
  it("generate leads labels never include queued", () => {
    const labels = labelsForIntent("generate_leads", "Give me 5 important people in tech");
    for (const label of labels) {
      expect(label.toLowerCase()).not.toContain("queued");
    }
  });
});
