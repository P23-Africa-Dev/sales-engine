import type { ChatLead } from "@/lib/api/sales-engine";

/** Round a 0–100 score for display; returns null when missing. */
export function scorePercent(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(Number(value))) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

export function leadScoreBreakdown(lead: ChatLead): {
  overall: number;
  search: number | null;
  icp: number | null;
  intent: number | null;
} {
  return {
    overall: scorePercent(lead.score) ?? 0,
    search: scorePercent(lead.query_relevance_score),
    icp: scorePercent(lead.icp_fit_score),
    intent: scorePercent(lead.intent_score),
  };
}
