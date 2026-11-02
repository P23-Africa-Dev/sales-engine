export const SOURCES = ["LinkedIn", "Reddit", "Web", "Meta"] as const;
export type Source = (typeof SOURCES)[number];
export type ReviewStatus = "Needs review" | "Approved" | "Suppressed";

export const SOURCE_KEY_BY_LABEL: Record<Source, string> = {
  LinkedIn: "linkedin_public",
  Reddit: "reddit",
  Web: "x_mentions",
  Meta: "meta_pages",
};

export const SOURCE_LABEL_BY_KEY: Record<string, Source> = {
  linkedin_public: "LinkedIn",
  reddit: "Reddit",
  reddit_native: "Reddit",
  x_mentions: "Web",
  x_native: "Web",
  youtube: "Web",
  meta_pages: "Meta",
  meta_graph_pages: "Meta",
};

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
  settingsLoaded: boolean;
}

export interface Signal {
  id: string;
  businessId: string;
  company: string;
  author: string;
  source: Source | string;
  title: string;
  quote: string;
  reason: string;
  score: number;
  stage: string;
  status: ReviewStatus | string;
  issue: string | null;
  crm: boolean;
  date: string;
}

export interface Scan {
  id: string;
  businessId: string;
  status: "Completed" | "Failed" | "Queued" | "Running" | string;
  source: string;
  found: number;
  date: string;
  error?: string;
  rawStatus?: string;
}

export interface AuditEntry {
  id: string;
  businessId: string;
  action: string;
  detail: string;
  time: string;
  actor: string;
}

export const REVIEW_TO_API: Record<
  ReviewStatus,
  "reviewed" | "dismissed" | "new"
> = {
  Approved: "reviewed",
  Suppressed: "dismissed",
  "Needs review": "new",
};

export function normalizeSourceLabel(raw: string | null | undefined): Source | string {
  if (!raw) return "Web";
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  if (SOURCE_LABEL_BY_KEY[key]) return SOURCE_LABEL_BY_KEY[key];
  if (key.includes("linkedin")) return "LinkedIn";
  if (key.includes("reddit")) return "Reddit";
  if (key.includes("meta") || key.includes("facebook") || key.includes("instagram"))
    return "Meta";
  if (
    key.includes("web") ||
    key === "x" ||
    key.includes("twitter") ||
    key.includes("youtube") ||
    key.includes("serper")
  )
    return "Web";
  const titled = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (SOURCES as readonly string[]).includes(titled) ? (titled as Source) : raw;
}

export function sourcesFromEnabledKeys(keys: unknown): Source[] {
  if (!Array.isArray(keys)) return [...SOURCES];
  const mapped = keys
    .map((key) => SOURCE_LABEL_BY_KEY[String(key)] ?? normalizeSourceLabel(String(key)))
    .filter((label): label is Source =>
      (SOURCES as readonly string[]).includes(label as string),
    );
  return mapped.length ? Array.from(new Set(mapped)) : [];
}

export function enabledKeysFromSources(sources: Source[]): string[] {
  return sources.map((s) => SOURCE_KEY_BY_LABEL[s]);
}

export function formatRunStatus(status: string | null | undefined): string {
  const raw = (status ?? "").toLowerCase();
  if (raw === "queued") return "Queued";
  if (raw === "running" || raw === "processing") return "Running";
  if (raw === "completed" || raw === "complete" || raw === "succeeded")
    return "Completed";
  if (raw === "failed" || raw === "error") return "Failed";
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function isActiveRunStatus(status: string | null | undefined): boolean {
  const raw = (status ?? "").toLowerCase();
  return raw === "queued" || raw === "running" || raw === "processing";
}

export function formatRunDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Lagos",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
