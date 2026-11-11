import type { ChatLead, LeadContactSource, LeadFitBreakdownItem } from "@/lib/api/sales-engine";

export function leadEntityType(lead: ChatLead): "person" | "company" {
  return lead.entity_type === "company" ? "company" : "person";
}

export function formatLeadRoleLine(lead: ChatLead): string | null {
  if (leadEntityType(lead) === "company") {
    const location = (lead.location ?? "").trim();
    return location !== "" ? location : null;
  }

  if (!lead.title && !lead.company) {
    return null;
  }

  return [lead.title, lead.company].filter(Boolean).join(" at ");
}

export function formatLeadContactLine(lead: ChatLead): string | null {
  if (leadEntityType(lead) !== "company") {
    return null;
  }

  const contact = (lead.contact_person ?? "").trim();
  if (!contact) {
    return null;
  }

  return lead.title ? `Contact: ${contact} · ${lead.title}` : `Contact: ${contact}`;
}

const PROFILE_HOSTS = ["linkedin.com", "about.me", "crunchbase.com", "xing.com", "wellfound.com", "angel.co"];

/**
 * True for canonical profile pages (LinkedIn /in|/company, about.me, etc.) — never posts/pulse/feed.
 */
export function isDirectProfileUrl(url: string, entity?: "person" | "company"): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (/\/(posts|pulse|feed|recent-activity)\b/i.test(path) || /activity-/i.test(path)) {
    return false;
  }

  if (host.includes("linkedin.com")) {
    if (entity === "person") {
      return /\/in\/[^/]+/i.test(path);
    }
    if (entity === "company") {
      return /\/company\/[^/]+/i.test(path);
    }
    return /\/(in|company)\/[^/]+/i.test(path);
  }

  return PROFILE_HOSTS.some((h) => host.includes(h) && h !== "linkedin.com");
}

/**
 * View Profile must open a direct profile page for that lead.
 * Never fall back to discovery source URLs (often posts/articles) or company websites.
 */
export function primaryProfileUrl(lead: ChatLead): string | null {
  const entity = leadEntityType(lead);
  const candidates = [lead.linkedin_url, ...(lead.profile_urls ?? [])];

  for (const raw of candidates) {
    const normalized = normalizeExternalUrl(raw);
    if (normalized && isDirectProfileUrl(normalized, entity)) {
      return normalized;
    }
  }

  return null;
}

/** Company/person website for a separate Website action — never LinkedIn/profile hosts. */
export function primaryWebsiteUrl(lead: ChatLead): string | null {
  const normalized = normalizeExternalUrl(lead.website);
  if (!normalized) {
    return null;
  }

  let host: string;
  try {
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (PROFILE_HOSTS.some((h) => host.includes(h))) {
    return null;
  }

  return normalized;
}

export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (value === "") {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // Hostnames / bare domains from Serper website fields.
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:].*)?$/i.test(value)) {
    return `https://${value.replace(/^\/+/, "")}`;
  }

  return null;
}

export function leadEntityBadge(lead: ChatLead): "Account" | "Contact" {
  return leadEntityType(lead) === "company" ? "Account" : "Contact";
}

// ── ICP fit / contact provenance (optional fields from newer backends) ─────────

const FIT_STATUS_MARK: Record<string, string> = {
  verified: "✓",
  partial: "~",
  unknown: "?",
  contradicted: "✗",
};

/** `fit_breakdown` rows with a dimension (top-level on chat leads, `meta` on lead resources). */
export function leadFitBreakdown(lead: ChatLead): LeadFitBreakdownItem[] {
  const rows = lead.fit_breakdown ?? lead.meta?.fit_breakdown;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is LeadFitBreakdownItem =>
      Boolean(row) && typeof row === "object" && typeof row.dimension === "string" && row.dimension.trim() !== ""
  );
}

/** Tooltip for the "ICP fit N%" chip: per-dimension evidence, else the relevance reason. */
export function leadFitTooltip(lead: ChatLead, scorePercent: number): string {
  const header = `ICP fit ${scorePercent}%`;
  const rows = leadFitBreakdown(lead);
  if (rows.length > 0) {
    const lines = rows.map((row) => {
      const mark = FIT_STATUS_MARK[String(row.status)] ?? "•";
      const evidence = typeof row.evidence === "string" && row.evidence.trim() !== "" ? `: ${row.evidence.trim()}` : "";
      return `${mark} ${row.dimension} (${row.status})${evidence}`;
    });
    return [header, ...lines].join("\n");
  }
  const reason = (lead.icp_relevance_reason ?? "").trim();
  return reason ? `${header}. ${reason}` : header;
}

export function isLeadPartialMatch(lead: ChatLead): boolean {
  return (lead.partial_match ?? lead.meta?.partial_match) === true;
}

/** True while the backend is still enriching this lead's contact details asynchronously. */
export function isLeadContactSearching(lead: ChatLead): boolean {
  if (lead.contact_status === "searching") return true;
  return lead.meta?.contact_status === "searching";
}

/** "Looking up…" applies to legacy not_attempted leads and to async enrichment in progress. */
export function isLeadContactPending(lead: ChatLead): boolean {
  return lead.contact_status === "not_attempted" || isLeadContactSearching(lead);
}

export type ContactSourceChip = {
  label: string;
  href: string | null;
  title: string;
};

const CONTACT_CONFIDENCE_LABELS: Record<string, string> = {
  on_page: "On website",
  snippet: "Search result",
  pattern: "Likely (pattern)",
  provider: "Provider",
};

/** Small provenance chip for an email/phone value from `contact_sources` (top-level or `meta`). */
export function leadContactSourceChip(lead: ChatLead, field: "email" | "phone"): ContactSourceChip | null {
  const source: LeadContactSource | null | undefined =
    lead.contact_sources?.[field] ?? lead.meta?.contact_sources?.[field];
  if (!source || typeof source !== "object") return null;

  const label =
    source.type === "company_line"
      ? "Company line"
      : source.confidence
        ? CONTACT_CONFIDENCE_LABELS[String(source.confidence)]
        : undefined;
  if (!label) return null;

  const href = normalizeExternalUrl(source.source_url ?? null);
  const details = [
    source.type === "generic" ? "Generic inbox" : null,
    source.method ? `via ${source.method}` : null,
    href ? `source: ${href}` : null,
  ].filter(Boolean);

  return {
    label,
    href,
    title: details.length > 0 ? `${label} · ${details.join(" · ")}` : label,
  };
}
