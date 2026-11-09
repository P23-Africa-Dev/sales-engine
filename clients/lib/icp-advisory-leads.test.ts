import { describe, expect, it } from "vitest";

import type { ChatLead } from "@/lib/api/sales-engine";
import { leadScoreBreakdown, scorePercent } from "@/lib/icp-advisory-leads";

const sampleLead: ChatLead = {
  id: 1,
  name: "Acme Distributors",
  source: "serper",
  score: 79.4,
  summary: "Tech distributor",
  icp_fit_score: 74,
  intent_score: 68,
  query_relevance_score: 82,
};

describe("lead score display helpers", () => {
  it("rounds score percents into 0–100", () => {
    expect(scorePercent(79.4)).toBe(79);
    expect(scorePercent(null)).toBeNull();
    expect(scorePercent(undefined)).toBeNull();
  });

  it("builds Overall / Search / ICP / Intent breakdown", () => {
    expect(leadScoreBreakdown(sampleLead)).toEqual({
      overall: 79,
      search: 82,
      icp: 74,
      intent: 68,
    });
  });
});
