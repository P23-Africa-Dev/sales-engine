import type { CrmEntryRow } from "@/lib/api/admin-crm";
import type { AdminOrganization } from "@/lib/api/admin-organizations";

export type CrmIssue = "Unassigned" | "Missing email" | "Possible duplicate";

export type CrmStageOption = {
  id: number;
  name: string;
  slug: string;
};

export type CrmBusiness = {
  id: string;
  name: string;
  industry: string;
  owner: string;
  team: string[];
  pipeline: string;
  staleDays: number;
};

export type CrmRecord = {
  id: string;
  numericId: number;
  businessId: string;
  company: string;
  contact: string;
  role: string;
  email: string;
  owner: string;
  assignedToUserId: number | null;
  stage: string;
  stageId: number | null;
  stageSlug: string | null;
  source: string;
  value: number;
  currency: string;
  created: string;
  updated: string;
  due: string | null;
  nextAction: string;
  archived: boolean;
  duplicateOf: string | null;
  notes: { text: string; date: string; actor: string }[];
};

export type CrmAudit = {
  id: string;
  businessId: string;
  recordId?: string;
  action: string;
  detail: string;
  actor: string;
  date: string;
};

function isoDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function mapOrganizationToBusiness(org: AdminOrganization): CrmBusiness {
  const owner = org.owner?.name || "Invited owner";
  return {
    id: String(org.id),
    name: org.name,
    industry: org.industry || "—",
    owner,
    team: owner ? [owner] : [],
    pipeline: "Client sales pipeline",
    staleDays: org.crm_stale_days ?? 7,
  };
}

export function mapEntryToRecord(entry: CrmEntryRow): CrmRecord {
  return {
    id: String(entry.id),
    numericId: entry.id,
    businessId: String(entry.organization_id),
    company: entry.company || "Untitled company",
    contact: entry.contact || "—",
    role: "",
    email: entry.email || "",
    owner: entry.owner || "",
    assignedToUserId: entry.assigned_to_user_id ?? null,
    stage: entry.stage || entry.stage_slug || "—",
    stageId: entry.stage_id ?? null,
    stageSlug: entry.stage_slug ?? null,
    source: entry.source || "—",
    value: Number(entry.value ?? 0),
    currency: entry.currency || "EUR",
    created: isoDate(entry.created_at),
    updated: isoDate(entry.updated_at),
    due: entry.due ? isoDate(entry.due) : null,
    nextAction: entry.next_action || "No follow-up required",
    archived: Boolean(entry.archived),
    duplicateOf: entry.duplicate_of != null ? String(entry.duplicate_of) : null,
    notes: [],
  };
}

export function stageOptionsFromRecords(records: CrmRecord[]): CrmStageOption[] {
  const map = new Map<string, CrmStageOption>();
  for (const record of records) {
    if (!record.stageId || !record.stage) continue;
    const key = String(record.stageId);
    if (!map.has(key)) {
      map.set(key, {
        id: record.stageId,
        name: record.stage,
        slug: record.stageSlug || record.stage.toLowerCase().replace(/\s+/g, "-"),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function mergeStageOptions(
  ...lists: CrmStageOption[][]
): CrmStageOption[] {
  const map = new Map<string, CrmStageOption>();
  for (const list of lists) {
    for (const stage of list) {
      if (!stage.id || !stage.name) continue;
      map.set(String(stage.id), stage);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBefore(days: number, from = new Date()) {
  const date = new Date(from);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function isClosedStage(record: Pick<CrmRecord, "stage" | "stageSlug">) {
  const slug = (record.stageSlug || record.stage || "").toLowerCase();
  return slug === "won" || slug === "lost";
}

export function isWonStage(record: Pick<CrmRecord, "stage" | "stageSlug">) {
  return (record.stageSlug || record.stage || "").toLowerCase() === "won";
}

export function isOpen(record: CrmRecord) {
  return !record.archived && !isClosedStage(record);
}

export function issuesFor(record: CrmRecord): CrmIssue[] {
  if (record.archived) return [];
  const issues: CrmIssue[] = [];
  if (!record.owner) issues.push("Unassigned");
  if (!record.email) issues.push("Missing email");
  if (record.duplicateOf) issues.push("Possible duplicate");
  return issues;
}

export function isOverdue(record: CrmRecord, today = todayIso()) {
  return isOpen(record) && Boolean(record.due && record.due < today);
}

export function isStale(record: CrmRecord, business: CrmBusiness, today = todayIso()) {
  return isOpen(record) && record.updated < daysBefore(business.staleDays, new Date(`${today}T00:00:00Z`));
}

export function money(value: number, compact = false, currency = "EUR") {
  const code = currency && currency.length === 3 ? currency : "EUR";
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
      ...(compact ? { notation: "compact" as const } : {}),
    }).format(value || 0);
  } catch {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
      ...(compact ? { notation: "compact" as const } : {}),
    }).format(value || 0);
  }
}

export function dateLabel(iso: string) {
  if (!iso) return "—";
  const date = iso.includes("T") ? new Date(iso) : new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatAuditWhen(iso?: string | null) {
  if (!iso) return "—";
  try {
    return (
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Lagos",
      }).format(new Date(iso)) + " WAT"
    );
  } catch {
    return iso;
  }
}
