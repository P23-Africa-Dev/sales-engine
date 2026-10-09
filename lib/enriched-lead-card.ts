import type { ChatLead } from "@/lib/api/sales-engine";

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
