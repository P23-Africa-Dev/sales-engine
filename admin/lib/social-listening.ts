import { ONBOARDED_BUSINESSES_DATA } from "./smart-leads";

export const SOURCES = ["LinkedIn", "Reddit", "Web", "Meta"] as const;
export type Source = (typeof SOURCES)[number];
export type ReviewStatus = "Needs review" | "Approved" | "Suppressed";
export interface ListeningBusiness {
  id: string;
  name: string;
  owner: string;
  industry: string;
  paused: boolean;
  sources: Source[];
  cadence: 14 | 30;
  minScore: number;
  freshness: number;
  destination: "human_review" | "qualified_pipeline";
  keywords: string;
  icp: string;
}
export interface Signal {
  id: string;
  businessId: string;
  company: string;
  author: string;
  source: Source;
  title: string;
  quote: string;
  reason: string;
  score: number;
  stage: string;
  status: ReviewStatus;
  issue: string | null;
  crm: boolean;
  date: string;
}
export interface Scan {
  id: string;
  businessId: string;
  status: "Completed" | "Failed" | "Queued";
  source: Source;
  found: number;
  date: string;
  error?: string;
}
export interface AuditEntry {
  id: string;
  businessId: string;
  action: string;
  detail: string;
  time: string;
  actor: string;
}
export const INITIAL_BUSINESSES: ListeningBusiness[] =
  ONBOARDED_BUSINESSES_DATA.map((b, i) => ({
    id: b.id,
    name: b.company,
    owner: b.owner,
    industry: b.industry,
    paused: i === 2,
    sources: i === 2 ? ["Web", "Meta"] : ["LinkedIn", "Reddit", "Web"],
    cadence: i % 2 ? 30 : 14,
    minScore: 65,
    freshness: 30,
    destination: "human_review",
    keywords: [
      "automation, vendor replacement, procurement",
      "supply chain, expansion, new facility",
      "medical equipment, tender, diagnostics",
      "AI infrastructure, data platform, migration",
    ][i % 4],
    icp: `${b.industry} businesses · 50–500 employees · Europe`,
  }));
const templates = [
  {
    title: "Actively evaluating a new vendor",
    quote:
      "We are reviewing vendors for our next phase of growth. Looking for recommendations from teams who have made the switch recently.",
    stage: "Decision",
    reason:
      "Explicit vendor evaluation and a near-term purchasing need align with the client's ideal customer profile.",
  },
  {
    title: "Expansion creates a new buying window",
    quote:
      "Our new facility opens next quarter. We need to rethink the systems supporting our operations before the launch.",
    stage: "Consideration",
    reason:
      "A new facility creates a time-bound need for additional operational capacity.",
  },
  {
    title: "Current solution is becoming a bottleneck",
    quote:
      "Anyone else struggling to scale their current setup? We are spending too much time on manual work and exploring alternatives.",
    stage: "Awareness",
    reason:
      "A clear operational pain point is present, but purchasing authority still needs validation.",
  },
  {
    title: "Procurement opportunity announced",
    quote:
      "Inviting qualified partners to submit proposals for our upcoming modernization project. Initial discussions start this month.",
    stage: "Decision",
    reason:
      "A public request for proposals indicates a defined purchasing process.",
  },
];
export const INITIAL_SIGNALS: Signal[] = ONBOARDED_BUSINESSES_DATA.flatMap(
  (b, i) =>
    b.prospects.slice(0, 4).map((p, j) => ({
      id: `SIG-${1001 + i * 4 + j}`,
      businessId: b.id,
      company: p.company,
      author: p.primaryContact.name,
      source: SOURCES[(i + j) % 4],
      ...templates[j],
      score: [92, 81, 54, 88][j] - i,
      status:
        j === 2
          ? "Needs review"
          : j === 3
            ? "Suppressed"
            : j === 1
              ? "Approved"
              : "Needs review",
      issue:
        j === 2
          ? "Low confidence"
          : j === 0 && i === 1
            ? "Possible duplicate"
            : null,
      crm: j === 1,
      date: `2026-10-0${
        [
          [9, 8, 6, 3],
          [9, 7, 5, 2],
          [8, 7, 4, 1],
          [9, 6, 5, 3],
        ][i % 4][j]
      }`,
    })),
);
export const INITIAL_SCANS: Scan[] = INITIAL_BUSINESSES.flatMap(
  (b, i) =>
    [
      {
        id: `RUN-${410 + i * 2}`,
        businessId: b.id,
        source: b.sources[0],
        status: i === 1 ? ("Failed" as const) : ("Completed" as const),
        found: i === 1 ? 0 : 4,
        date: "09 Oct 2026 · 09:20",
        ...(i === 1
          ? {
              error:
                "Source rate limit reached. Retry after the provider cooldown; previously collected signals are unaffected.",
            }
          : {}),
      },
      {
        id: `RUN-${411 + i * 2}`,
        businessId: b.id,
        source: b.sources[1],
        status: "Completed" as const,
        found: 3,
        date: "08 Oct 2026 · 14:10",
      },
    ] as Scan[],
);
export const INITIAL_AUDIT: AuditEntry[] = [
  {
    id: "audit-1",
    businessId: INITIAL_BUSINESSES[2].id,
    action: "Monitoring paused",
    detail: "Client requested a temporary pause while their ICP is reviewed.",
    time: "09 Oct 2026 · 08:45",
    actor: "Kwame Smith",
  },
  {
    id: "audit-2",
    businessId: INITIAL_BUSINESSES[0].id,
    action: "Signal approved",
    detail: "SIG-1002 · Evidence reviewed; retained in client workspace.",
    time: "08 Oct 2026 · 16:30",
    actor: "Ama Mensah",
  },
];
