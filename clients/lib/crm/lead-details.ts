export type LeadDetailSource = {
  name?: string | null | unknown;
  email?: string | null | unknown;
  phone?: string | null | unknown;
  location?: string | null | unknown;
  company_name?: string | null | unknown;
  website?: string | null | unknown;
  position?: string | null | unknown;
  profile_urls?: string[] | null | unknown;
  source?: string | null | unknown;
  status?: string | null | unknown;
  priority?: string | null | unknown;
  budget_amount?: number | null;
  budget_currency?: string | null;
  budget?: string | null;
  next_action?: string | null | unknown;
  last_interaction?: string | null | unknown;
  last_interaction_at?: string | null | unknown;
  converted_at?: string | null | unknown;
  created_at?: string | null | unknown;
  updated_at?: string | null | unknown;
  linked_to_map?: boolean | null;
  meta?: Record<string, unknown> | null;
  creator?: { name?: string | null | unknown } | null;
  assignee?: { name?: string | null | unknown } | null;
  pipeline?: { name?: string | null | unknown; currency_code?: string | null | unknown } | null;
};

export type LeadDetailDisplay = {
  name: string;
  email: string;
  phone: string;
  location: string;
  companyName: string;
  website: string;
  position: string;
  profileUrls: string[];
  pipelineName: string;
  status: string;
  source: string;
  priority: string;
  budget: string;
  assigneeName: string;
  creatorName: string;
  nextAction: string;
  lastInteraction: string;
  lastInteractionAt: string;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
  mapLinkState: string;
  mapLocationLabel: string;
};

const NA = "N/A";
const NONE = "None";

export function toTrimmedString(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = toTrimmedString(item);
      if (resolved) {
        return resolved;
      }
    }
    return "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["email", "address", "value", "name", "label", "text"]) {
      if (key in record) {
        const resolved = toTrimmedString(record[key]);
        if (resolved) {
          return resolved;
        }
      }
    }
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function resolveBudgetAmount(lead: Pick<LeadDetailSource, "budget_amount" | "meta">): number {
  if (typeof lead.budget_amount === "number" && !Number.isNaN(lead.budget_amount)) {
    return lead.budget_amount;
  }
  if (typeof lead.meta?.value === "number" && !Number.isNaN(lead.meta.value)) {
    return lead.meta.value;
  }
  return 0;
}

export function formatLeadDetailDate(value?: unknown): string {
  if (!value || (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date))) {
    return NA;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return NA;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatLeadDetailDateOnly(value?: unknown): string {
  if (!value || (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date))) {
    return NA;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return NA;
  }

  return date.toLocaleDateString();
}

export function formatLeadMapLinkState(linkedToMap?: boolean | null): string {
  return linkedToMap ? "Linked" : "Not linked";
}

export function formatLeadDetailBudget(lead: LeadDetailSource): string {
  const amount = resolveBudgetAmount(lead);
  if (amount <= 0 && lead.budget_amount == null && !lead.budget) {
    return NA;
  }

  const currency = lead.budget_currency ?? (toTrimmedString(lead.pipeline?.currency_code) || "USD");
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function getLeadDetailDisplay(lead: LeadDetailSource): LeadDetailDisplay {
  const location = toTrimmedString(lead.location);

  return {
    name: toTrimmedString(lead.name) || NA,
    email: toTrimmedString(lead.email) || NA,
    phone: toTrimmedString(lead.phone) || NA,
    location: location || NA,
    companyName: toTrimmedString(lead.company_name) || NA,
    website: toTrimmedString(lead.website) || NA,
    position: toTrimmedString(lead.position) || NA,
    profileUrls: (Array.isArray(lead.profile_urls) ? lead.profile_urls : [])
      .map(toTrimmedString)
      .filter(Boolean),
    pipelineName: toTrimmedString(lead.pipeline?.name) || NA,
    status: toTrimmedString(lead.status) || NA,
    source: toTrimmedString(lead.source) || "Unknown",
    priority: toTrimmedString(lead.priority) || "Medium",
    budget: formatLeadDetailBudget(lead),
    assigneeName: toTrimmedString(lead.assignee?.name) || "Unassigned",
    creatorName: toTrimmedString(lead.creator?.name) || "System",
    nextAction: toTrimmedString(lead.next_action) || NONE,
    lastInteraction: toTrimmedString(lead.last_interaction) || NONE,
    lastInteractionAt: formatLeadDetailDate(lead.last_interaction_at),
    convertedAt: lead.converted_at ? formatLeadDetailDate(lead.converted_at) : null,
    createdAt: formatLeadDetailDateOnly(lead.created_at),
    updatedAt: formatLeadDetailDate(lead.updated_at),
    mapLinkState: formatLeadMapLinkState(lead.linked_to_map),
    mapLocationLabel: location || "No location",
  };
}
