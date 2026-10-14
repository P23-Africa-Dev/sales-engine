import { ONBOARDED_BUSINESSES_DATA } from "./smart-leads";

export const CRM_SNAPSHOT = "2026-10-13";
export const CRM_STAGES = [
  "New",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];
export const CRM_SOURCES = [
  "Smart Leads",
  "Social Listening",
  "Manual / import",
] as const;
export type CrmSource = (typeof CRM_SOURCES)[number];
export type CrmIssue = "Unassigned" | "Missing email" | "Possible duplicate";
export interface CrmBusiness {
  id: string;
  name: string;
  industry: string;
  owner: string;
  team: string[];
  pipeline: string;
  staleDays: number;
}
export interface CrmRecord {
  id: string;
  businessId: string;
  company: string;
  contact: string;
  role: string;
  email: string;
  owner: string;
  stage: CrmStage;
  source: CrmSource;
  value: number;
  created: string;
  updated: string;
  due: string | null;
  nextAction: string;
  archived: boolean;
  duplicateOf: string | null;
  duplicateReviewed: boolean;
  notes: { text: string; date: string; actor: string }[];
}
export interface CrmAudit {
  id: string;
  businessId: string;
  recordId?: string;
  action: string;
  detail: string;
  actor: string;
  date: string;
}
export function daysBefore(days: number) {
  const date = new Date(`${CRM_SNAPSHOT}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
export const CRM_BUSINESSES: CrmBusiness[] = ONBOARDED_BUSINESSES_DATA.map(
  (b) => ({
    id: b.id,
    name: b.company,
    industry: b.industry,
    owner: b.owner,
    team: [b.owner, "Ama Mensah", "Daniel Okafor"],
    pipeline: "Client sales pipeline",
    staleDays: 7,
  }),
);
export const CRM_RECORDS: CrmRecord[] = ONBOARDED_BUSINESSES_DATA.flatMap(
  (b, i) =>
    Array.from({ length: 6 }, (_, j) => {
      const duplicate = i === 1 && j === 5;
      const p = b.prospects[duplicate ? 0 : j % b.prospects.length];
      const stage =
        CRM_STAGES[
          [
            [0, 1, 2, 3, 4, 1],
            [1, 2, 0, 3, 5, 0],
            [0, 1, 2, 4, 3, 0],
            [1, 3, 2, 0, 4, 5],
          ][i % 4][j]
        ];
      const closed = stage === "Won" || stage === "Lost";
      return {
        id: `CRM-${2001 + i * 6 + j}`,
        businessId: b.id,
        company: p.company,
        contact: p.primaryContact.name,
        role: p.primaryContact.title,
        email:
          j === 2 && i % 2 === 0
            ? ""
            : `${p.primaryContact.name.toLowerCase().replaceAll(" ", ".")}@example.com`,
        owner: j === 0 && i !== 0 ? "" : b.owner,
        stage,
        source: CRM_SOURCES[(i + j) % 3],
        value: [18000, 32000, 12500, 46000, 27000, 9500][j] + i * 2500,
        created: daysBefore([13, 10, 7, 5, 3, 1][j] + (i % 2)),
        updated: daysBefore(closed ? i + 1 : j === 1 ? 10 : 2 + i),
        due: closed ? null : daysBefore(j % 3 === 0 ? 2 : j % 3 === 1 ? 0 : -3),
        nextAction: closed
          ? "No follow-up required"
          : [
              "Validate buying authority",
              "Review proposal with client",
              "Confirm procurement timeline",
            ][j % 3],
        archived: false,
        duplicateOf: duplicate ? `CRM-${2001 + i * 6}` : null,
        duplicateReviewed: false,
        notes: [
          {
            text: "Imported into the client CRM workspace. Record ownership and deal value require client validation.",
            date: daysBefore([13, 10, 7, 5, 3, 1][j] + (i % 2)),
            actor: "Client workspace",
          },
        ],
      };
    }),
);
export const CRM_INITIAL_AUDIT: CrmAudit[] = [
  {
    id: "audit-seed",
    businessId: CRM_BUSINESSES[0].id,
    recordId: "CRM-2001",
    action: "Record inspected",
    detail: "Initial sample review; no fields changed.",
    actor: "Kwame Smith",
    date: "13 Oct 2026 · 09:20 WAT",
  },
];
export function isOpen(record: CrmRecord) {
  return !record.archived && record.stage !== "Won" && record.stage !== "Lost";
}
export function issuesFor(record: CrmRecord): CrmIssue[] {
  if (record.archived) return [];
  const issues: CrmIssue[] = [];
  if (!record.owner) issues.push("Unassigned");
  if (!record.email) issues.push("Missing email");
  if (record.duplicateOf && !record.duplicateReviewed)
    issues.push("Possible duplicate");
  return issues;
}
export function isOverdue(record: CrmRecord) {
  return isOpen(record) && Boolean(record.due && record.due < CRM_SNAPSHOT);
}
export function isStale(record: CrmRecord, business: CrmBusiness) {
  return isOpen(record) && record.updated < daysBefore(business.staleDays);
}
export function money(value: number, compact = false) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(value);
}
export function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
