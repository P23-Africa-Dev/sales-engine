"use client";

import { apiRequest } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument, getCompanyId } from "@/lib/auth/session";
import {
  clearSalesEngineSession,
  getSalesEngineOrgId,
  getSalesEngineToken,
  setSalesEngineSession,
} from "@/lib/sales-engine/session";
import { useAuthStore } from "@/store/auth";
import type { IcpConfig, IcpProfile } from "@/components/sales-engine/icp-builder-modal";

export const SALES_ENGINE_API_BASE_URL =
  process.env.NEXT_PUBLIC_SALES_ENGINE_API_URL ??
  "https://api.salesengine.thefactory23.com/api/v1";

export class SalesEngineApiError extends Error {
  status: number;
  reason?: string | null;

  constructor(message: string, status: number, reason?: string | null) {
    super(message);
    this.status = status;
    this.reason = reason ?? null;
  }
}

type SeAssertionData = {
  assertion: string;
  expires_in: number;
  exchange_url: string;
};

type SeExchangeResponse = {
  token: string;
  token_type: "Bearer";
  organization: { id: number };
};

export type SalesEngineAccessRequestStatus = "none" | "pending" | "approved" | "declined";

export type SalesEngineAccessState =
  | "ready"
  | "needs_access"
  | "pending"
  | "declined"
  | "error";

type SeAccessRequestPayload = {
  status: SalesEngineAccessRequestStatus;
  request: {
    id: number;
    status: string;
    email: string;
    name: string;
    company_name: string | null;
    requested_at: string | null;
    reviewed_at: string | null;
  } | null;
};

const DEFAULT_ICP_CONFIG: IcpConfig = {
  profileName: "",
  description: "",
  industries: [],
  companySizes: [],
  revenueRanges: [],
  territories: [],
  decisionMakers: [],
  minMatchScore: 60,
  autoSyncCrm: false,
  enrichContactDetails: true,
  customPrompt: "",
  searchKeywords: [],
  exclusions: [],
  signalTypePacks: ["default"],
};

// The API returns `lastUpdated` as an ISO timestamp; the UI wants a friendly relative string.
function formatLastUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// Backfills any config fields the API omitted so the form never breaks on a partial profile.
function normalizeSignalTypePacks(packs: unknown): string[] {
  if (!Array.isArray(packs)) return ["default"];
  const values = packs.filter((pack): pack is string => typeof pack === "string" && pack.trim() !== "");
  if (values.includes("none")) return [];
  if (values.length === 0) return ["default"];
  return values;
}

export function mapApiIcpProfile(raw: IcpProfile): IcpProfile {
  const rawConfig = (raw.config ?? {}) as Partial<IcpConfig>;
  const config = { ...DEFAULT_ICP_CONFIG, ...rawConfig };
  return {
    id: raw.id,
    name: raw.name ?? "",
    description: raw.description ?? "",
    isActive: Boolean(raw.isActive),
    leadCount: raw.leadCount ?? 0,
    lastUpdated: formatLastUpdated(raw.lastUpdated),
    config: {
      ...config,
      profileName: (config.profileName || raw.name || "").trim(),
      description: config.description ?? "",
      industries: Array.isArray(config.industries) ? config.industries : [],
      companySizes: Array.isArray(config.companySizes) ? config.companySizes : [],
      revenueRanges: Array.isArray(config.revenueRanges) ? config.revenueRanges : [],
      territories: Array.isArray(config.territories) ? config.territories : [],
      decisionMakers: Array.isArray(config.decisionMakers) ? config.decisionMakers : [],
      customPrompt: config.customPrompt ?? "",
      searchKeywords: Array.isArray(config.searchKeywords) ? config.searchKeywords : [],
      exclusions: Array.isArray(config.exclusions) ? config.exclusions : [],
      signalTypePacks: normalizeSignalTypePacks(rawConfig.signalTypePacks),
    },
  };
}

function resolveAssertionPath(accessRole: string | undefined): string {
  return accessRole === "agent"
    ? "/agent/sales-engine/assertion"
    : "/admin/sales-engine/assertion";
}

function resolveAccessRequestBasePath(accessRole: string | undefined): string {
  return accessRole === "agent"
    ? "/agent/sales-engine/access-requests"
    : "/admin/sales-engine/access-requests";
}

async function fetchFactory23Assertion(): Promise<{
  assertion: string;
  f23Token: string;
}> {
  const f23Token = getAuthTokenFromDocument();
  if (!f23Token) {
    throw new SalesEngineApiError("Factory23 session is not available.", 401);
  }

  const accessRole = useAuthStore.getState().user?.access_role;
  const companyId = resolveCompanyId();

  const assertionRes = await apiRequest<SeAssertionData>({
    method: "POST",
    path: resolveAssertionPath(accessRole),
    token: f23Token,
    body: companyId ? { company_id: companyId } : undefined,
  });

  return { assertion: assertionRes.data.assertion, f23Token };
}

function applyExchangeSession(exchange: SeExchangeResponse): void {
  setSalesEngineSession(exchange.token, exchange.organization.id);
}

function resolveCompanyId(): number | undefined {
  const fromStorage = getCompanyId();
  if (fromStorage) {
    const parsed = Number(fromStorage);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  const activeCompany = useAuthStore.getState().user?.active_company;
  if (activeCompany?.id) return activeCompany.id;

  return undefined;
}

export async function seRequest<T>({
  method,
  path,
  body,
  token,
  orgId,
  timeoutMs,
}: {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  token?: string;
  orgId?: string | null;
  timeoutMs?: number;
}): Promise<T> {
  const authToken = token ?? getSalesEngineToken();
  if (!authToken) {
    throw new SalesEngineApiError("Sales Engine session is not ready.", 401);
  }

  const organizationId = orgId ?? getSalesEngineOrgId();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (organizationId) {
    headers["X-Organization-Id"] = organizationId;
  }

  const controller = timeoutMs ? new AbortController() : undefined;
  const timeoutId =
    controller && timeoutMs
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  let response: Response;
  try {
    response = await fetch(`${SALES_ENGINE_API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new SalesEngineApiError("Sales Engine request timed out.", 408);
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; data?: T }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Sales Engine request failed (${response.status})`;
    const reason =
      payload &&
      typeof payload === "object" &&
      "reason" in payload &&
      typeof payload.reason === "string"
        ? payload.reason
        : null;
    throw new SalesEngineApiError(message, response.status, reason);
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

export async function ensureSalesEngineSession(): Promise<void> {
  if (getSalesEngineToken()) return;
  throw new SalesEngineApiError("Your Sales Engine session expired. Please sign in again.", 401);
}

export async function fetchSalesEngineAccessRequestStatus(): Promise<SeAccessRequestPayload> {
  const f23Token = getAuthTokenFromDocument();
  if (!f23Token) {
    throw new SalesEngineApiError("Factory23 session is not available.", 401);
  }

  const accessRole = useAuthStore.getState().user?.access_role;
  const res = await apiRequest<SeAccessRequestPayload>({
    method: "GET",
    path: `${resolveAccessRequestBasePath(accessRole)}/status`,
    token: f23Token,
  });

  return res.data;
}

export async function requestSalesEngineAccess(): Promise<SeAccessRequestPayload> {
  const f23Token = getAuthTokenFromDocument();
  if (!f23Token) {
    throw new SalesEngineApiError("Factory23 session is not available.", 401);
  }

  const accessRole = useAuthStore.getState().user?.access_role;
  const companyId = resolveCompanyId();

  const res = await apiRequest<SeAccessRequestPayload>({
    method: "POST",
    path: resolveAccessRequestBasePath(accessRole),
    token: f23Token,
    body: companyId ? { company_id: companyId } : undefined,
  });

  return res.data;
}

/**
 * Log in with existing Sales Engine credentials and link this Factory23 identity.
 * Used when F23 email ≠ SE email (or user prefers explicit SE login).
 */
export async function loginLinkSalesEngineSession(
  email: string,
  password: string,
): Promise<void> {
  const { assertion, f23Token } = await fetchFactory23Assertion();

  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}/auth/factory23/login-link`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assertion,
      email,
      password,
      f23_access_token: f23Token,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | SeExchangeResponse
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Sales Engine login failed (${response.status})`;
    throw new SalesEngineApiError(message, response.status);
  }

  applyExchangeSession(payload as SeExchangeResponse);
  await ensureFactory23CrmLink({ skipSessionRetry: true });
}

/**
 * Resolve whether the current Factory23 user can enter Sales Engine.
 * Prefers an existing local SE session; otherwise attempts exchange / request status.
 */
export async function resolveSalesEngineAccess(): Promise<{
  state: SalesEngineAccessState;
  token: string | null;
  message?: string;
}> {
  if (getSalesEngineToken()) {
    return { state: "ready", token: getSalesEngineToken() };
  }

  try {
    await ensureSalesEngineSession();
    return { state: "ready", token: getSalesEngineToken() };
  } catch (error) {
    if (!(error instanceof SalesEngineApiError) || error.reason !== "access_required") {
      return {
        state: "error",
        token: null,
        message: error instanceof Error ? error.message : "Could not connect to Sales Engine.",
      };
    }
  }

  try {
    const statusPayload = await fetchSalesEngineAccessRequestStatus();
    if (statusPayload.status === "pending") {
      return { state: "pending", token: null };
    }
    if (statusPayload.status === "declined") {
      return { state: "declined", token: null };
    }
    if (statusPayload.status === "approved") {
      // Approved but exchange still failed — treat as needs_access so user can retry/login.
      return { state: "needs_access", token: null };
    }
    return { state: "needs_access", token: null };
  } catch (error) {
    return {
      state: "error",
      token: null,
      message: error instanceof Error ? error.message : "Could not load access status.",
    };
  }
}

/** Bridges the signed-in Factory23 session to Sales Engine CRM sync (no manual API tokens). */
export async function ensureFactory23CrmLink(options?: {
  skipSessionRetry?: boolean;
}): Promise<Factory23IntegrationStatus> {
  const f23Token = getAuthTokenFromDocument();
  if (!f23Token) {
    throw new SalesEngineApiError("Factory23 session is not available.", 401);
  }

  const request = () =>
    seRequest<{
      linked: boolean;
      token_registered: boolean;
      status: Factory23IntegrationStatus;
    }>({
      method: "POST",
      path: "/integrations/factory23/ensure",
      body: { f23_access_token: f23Token },
    });

  const result = options?.skipSessionRetry ? await request() : await withSessionRetry(request);

  return result.status;
}

/** Surface expiry through native authentication without reconnecting to Factory. */
async function withSessionRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SalesEngineApiError && error.status === 401) {
      clearSalesEngineSession();
      await ensureSalesEngineSession();
      return await fn();
    }
    throw error;
  }
}

export type IcpProfilePayload = {
  name: string;
  description?: string;
  config: IcpConfig;
};

export function searchGeoPlaces(
  query: string,
  limit = 20
): Promise<Array<{ label: string; type: string; country: string; gl: string }>> {
  return withSessionRetry(async () => {
    const data = await seRequest<Array<{ label: string; type: string; country: string; gl: string }>>({
      method: "GET",
      path: `/geo/places?q=${encodeURIComponent(query)}&limit=${limit}`,
    });
    return data ?? [];
  });
}

export function fetchIcpProfiles(): Promise<IcpProfile[]> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile[]>({ method: "GET", path: "/icp-profiles" });
    return (data ?? []).map(mapApiIcpProfile);
  });
}

/** @deprecated kept for compatibility — same as {@link fetchIcpProfiles}, which now retries on 401 itself. */
export const refreshSalesEngineProfiles = fetchIcpProfiles;

export function createIcpProfile(payload: IcpProfilePayload): Promise<IcpProfile> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile>({ method: "POST", path: "/icp-profiles", body: payload });
    return mapApiIcpProfile(data);
  });
}

export function updateIcpProfile(id: string, payload: Partial<IcpProfilePayload>): Promise<IcpProfile> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile>({
      method: "PATCH",
      path: `/icp-profiles/${id}`,
      body: payload,
    });
    return mapApiIcpProfile(data);
  });
}

export function deleteIcpProfile(id: string): Promise<null> {
  return withSessionRetry(async () => {
    await seRequest<null>({ method: "DELETE", path: `/icp-profiles/${id}` });
    return null;
  });
}

export function activateIcpProfile(id: string): Promise<IcpProfile> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile>({ method: "POST", path: `/icp-profiles/${id}/activate` });
    return mapApiIcpProfile(data);
  });
}

export function duplicateIcpProfile(id: string): Promise<IcpProfile> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpProfile>({ method: "POST", path: `/icp-profiles/${id}/duplicate` });
    return mapApiIcpProfile(data);
  });
}

export type IcpSearchBriefSuggestMode = "generate" | "improve" | "regenerate";

export type IcpSearchBriefSuggestResult = {
  brief: string;
  keywords: string[];
  source: "glm" | "heuristic" | string;
  industries?: string[];
  decisionMakers?: string[];
  companySizes?: string[];
  exclusions?: string[];
  minMatchScore?: number;
};

export function suggestIcpSearchBrief(payload: {
  mode?: IcpSearchBriefSuggestMode;
  profileName?: string;
  customPrompt?: string;
  description?: string;
  industries?: string[];
  territories?: string[];
  decisionMakers?: string[];
  companySizes?: string[];
  minMatchScore?: number;
}): Promise<IcpSearchBriefSuggestResult> {
  return withSessionRetry(async () => {
    const data = await seRequest<IcpSearchBriefSuggestResult>({
      method: "POST",
      path: "/icp-profiles/suggest-search-brief",
      body: payload,
      timeoutMs: 30000,
    });
    const asStrings = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
        : [];
    return {
      brief: typeof data?.brief === "string" ? data.brief : "",
      keywords: asStrings(data?.keywords),
      source: typeof data?.source === "string" ? data.source : "heuristic",
      industries: asStrings(data?.industries),
      decisionMakers: asStrings(data?.decisionMakers),
      companySizes: asStrings(data?.companySizes),
      exclusions: asStrings(data?.exclusions),
      minMatchScore: typeof data?.minMatchScore === "number" ? data.minMatchScore : undefined,
    };
  });
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export type ChatIntent = "freeform" | "quick_research" | "generate_leads" | "generate_more_leads" | "create_outreach";

export type ChatLead = {
  id: number;
  name: string;
  source: string;
  score: number;
  summary: string;
  entity_type?: "person" | "company" | null;
  title?: string | null;
  company?: string | null;
  contact_person?: string | null;
  location?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  profile_urls?: string[] | null;
  contact_ready?: boolean;
  contact_status?: "not_attempted" | "found" | "not_found" | string | null;
  contact_enrichment_tier?: string | null;
  contact_enrichment_provider?: string | null;
  next_action?: string | null;
  source_url?: string | null;
  save_status?: "draft" | "saved";
  crm_synced?: boolean;
  native_crm_saved?: boolean;
  native_crm_lead_id?: number | null;
  crm_duplicate?: boolean;
  crm_duplicate_reason?: string | null;
  crm_fields_updated?: string[] | null;
  f23_lead_id?: string | number | null;
  low_confidence?: boolean;
  icp_recommended?: boolean;
  icp_fit_score?: number;
  intent_score?: number;
  query_relevance_score?: number;
  query_match?: boolean;
  icp_relevance_reason?: string | null;
  location_status?: "unknown" | "confirmed" | "resolved" | "outside_territory" | string | null;
};

export type ChatMessageApi = {
  id: number;
  role: "user" | "assistant";
  body: string;
  intent?: ChatIntent;
  leads?: ChatLead[] | null;
  meta?: Record<string, unknown> | null;
  created_at?: string;
};

export type SendChatMessageResult = {
  user_message: ChatMessageApi;
  assistant_message?: ChatMessageApi | null;
  discovery_run_id?: number | null;
  status?: "processing" | "completed";
  pending?: boolean;
};

export type ChatSessionApi = {
  id: number;
  title?: string | null;
  icp_profile_id?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type DiscoveryRunProgress = {
  step?: number;
  total_steps?: number;
  sources_checked?: number;
  candidates_found?: number;
};

export type DiscoveryRunApi = {
  id: number;
  status: string;
  query?: string | null;
  intent?: string | null;
  stages?: string[] | null;
  result_summary?: unknown;
  progress?: DiscoveryRunProgress | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type DiscoveryStageInfo = {
  label: string;
  stepIndex: number;
  totalSteps: number;
  stageKey: string;
  progress?: DiscoveryRunProgress | null;
};

const ASYNC_CHAT_INTENTS: ChatIntent[] = ["quick_research", "generate_leads", "generate_more_leads"];
const CHAT_OUTREACH_TIMEOUT_MS =
  Number(process.env.NEXT_PUBLIC_CHAT_OUTREACH_TIMEOUT_MS) || 120_000;
const CHAT_POLL_INTERVAL_MS = 2_000;
const CHAT_POLL_MAX_MS = 600_000;
/** Quick Research should feel fast — fail over to background well before lead-gen's 10m ceiling. */
export const CHAT_QUICK_RESEARCH_POLL_MAX_MS = 90_000;

const DISCOVERY_STAGE_LABELS: Record<string, string> = {
  analyzing_brief: "Analyzing your brief…",
  analyzing_icp: "Analyzing your ICP…",
  searching_sources: "Scanning web & social signals…",
  extracting: "Extracting buying intent…",
  enriching: "Enriching signal data…",
  synthesizing: "Synthesizing insights…",
  compiling_results: "Compiling ranked results…",
  completed: "Finalizing results…",
};

const STAGE_TO_STEP: Record<string, number> = {
  queued: 0,
  analyzing_brief: 0,
  analyzing_icp: 0,
  searching_sources: 1,
  extracting: 2,
  enriching: 2,
  synthesizing: 2,
  compiling_results: 3,
  completed: 3,
};

const TOTAL_PIPELINE_STEPS = 4;

function humanizeStageKey(stageKey: string, intent?: ChatIntent): string {
  if (stageKey === "queued") {
    if (intent === "quick_research") return "Reviewing your question…";
    if (intent === "generate_leads" || intent === "generate_more_leads") return "Parsing your ICP brief…";
    if (intent === "create_outreach") return "Reading target context…";
    return "Starting your request…";
  }

  if (intent === "quick_research") {
    if (stageKey === "searching_sources") return "Searching sources in parallel…";
    if (stageKey === "synthesizing") return "Writing your brief…";
    if (stageKey === "compiling_results") return "Packaging citations…";
  }

  return (
    DISCOVERY_STAGE_LABELS[stageKey] ??
    stageKey.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) + "…"
  );
}

export function mapDiscoveryStage(
  stages?: string[] | null,
  intent?: ChatIntent,
  progress?: DiscoveryRunProgress | null
): DiscoveryStageInfo {
  const stageKey = stages?.length ? stages[stages.length - 1] : "analyzing_brief";
  const stepIndex =
    typeof progress?.step === "number"
      ? Math.min(Math.max(progress.step - 1, 0), TOTAL_PIPELINE_STEPS - 1)
      : (STAGE_TO_STEP[stageKey] ?? 0);

  return {
    label: humanizeStageKey(stageKey, intent),
    stepIndex,
    totalSteps: progress?.total_steps ?? TOTAL_PIPELINE_STEPS,
    stageKey,
    progress: progress ?? null,
  };
}

/** @deprecated Use mapDiscoveryStage for structured stage info. */
export function formatDiscoveryStage(stages?: string[] | null, intent?: ChatIntent): string {
  return mapDiscoveryStage(stages, intent).label;
}

export function createChatSession(icpProfileId?: string): Promise<ChatSessionApi> {
  return withSessionRetry(async () =>
    seRequest<ChatSessionApi>({
      method: "POST",
      path: "/chat/sessions",
      body: icpProfileId ? { icp_profile_id: Number(icpProfileId) } : {},
    })
  );
}

export function fetchCurrentChatSession(icpProfileId?: string): Promise<ChatSessionApi | null> {
  return withSessionRetry(async () => {
    const query = icpProfileId ? `?icp_profile_id=${encodeURIComponent(icpProfileId)}` : "";

    return seRequest<ChatSessionApi | null>({
      method: "GET",
      path: `/chat/sessions/current${query}`,
    });
  });
}

export function clearChatMessages(sessionId: number): Promise<{ cleared: boolean }> {
  return withSessionRetry(async () =>
    seRequest<{ cleared: boolean }>({
      method: "DELETE",
      path: `/chat/sessions/${sessionId}/messages`,
    })
  );
}

export function fetchDiscoveryRun(id: number): Promise<DiscoveryRunApi> {
  return withSessionRetry(async () =>
    seRequest<DiscoveryRunApi>({ method: "GET", path: `/discovery/runs/${id}` })
  );
}

export function cancelDiscoveryRun(id: number): Promise<{ id: number; status: string; cancelled: boolean }> {
  return withSessionRetry(async () =>
    seRequest<{ id: number; status: string; cancelled: boolean }>({
      method: "POST",
      path: `/discovery/runs/${id}/cancel`,
    })
  );
}

export async function pollDiscoveryRunUntilComplete(
  runId: number,
  options?: {
    onStage?: (info: DiscoveryStageInfo) => void;
    onPartial?: (info: {
      leads: ChatLead[];
      progressMessage: string | null;
      count?: number;
      requested?: number;
    }) => void;
    intent?: ChatIntent;
    maxMs?: number;
    /** Mutable extension — Continue waiting can bump this without restarting the poll. */
    extraWaitMsRef?: { current: number };
    signal?: AbortSignal;
  }
): Promise<{ run: DiscoveryRunApi; timedOut: boolean; aborted?: boolean }> {
  const baseMaxMs = options?.maxMs ?? CHAT_POLL_MAX_MS;
  const started = Date.now();

  while (Date.now() - started < baseMaxMs + (options?.extraWaitMsRef?.current ?? 0)) {
    if (options?.signal?.aborted) {
      const run = await fetchDiscoveryRun(runId);
      return { run, timedOut: true, aborted: true };
    }

    const run = await fetchDiscoveryRun(runId);
    const intent = options?.intent ?? (run.intent as ChatIntent | undefined);
    const stageInfo = mapDiscoveryStage(run.stages, intent, run.progress ?? null);
    const summary =
      run.result_summary && typeof run.result_summary === "object"
        ? (run.result_summary as Record<string, unknown>)
        : null;
    const progressMessage =
      typeof summary?.progress_message === "string" ? summary.progress_message : null;
    options?.onStage?.({
      ...stageInfo,
      label: progressMessage || stageInfo.label,
    });
    if (typeof options?.onPartial === "function" && Array.isArray(summary?.partial_leads)) {
      options.onPartial({
        leads: summary.partial_leads as ChatLead[],
        progressMessage,
        count: typeof summary.partial_lead_count === "number" ? summary.partial_lead_count : undefined,
        requested:
          typeof summary.requested_lead_count === "number" ? summary.requested_lead_count : undefined,
      });
    }

    if (run.status === "completed") {
      return { run, timedOut: false };
    }

    if (run.status === "cancelled") {
      return { run, timedOut: false, aborted: true };
    }

    if (run.status === "failed") {
      // Soft-complete / job-fail races can briefly mark failed then flip to completed
      // with leads. Re-check once before surfacing an error to the user.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (options?.signal?.aborted) {
        const latest = await fetchDiscoveryRun(runId);
        return { run: latest, timedOut: true, aborted: true };
      }
      const rechecked = await fetchDiscoveryRun(runId);
      if (rechecked.status === "completed") {
        return { run: rechecked, timedOut: false };
      }
      if (rechecked.status === "cancelled") {
        return { run: rechecked, timedOut: false, aborted: true };
      }
      if (rechecked.status !== "failed") {
        continue;
      }

      // Soft failure: keep polling so the UI can offer continue/stop. Timeout is last
      // (maxMs). The live worker may still complete and overwrite the soft-fail.
      const softWait =
        Boolean((rechecked as DiscoveryRunApi & { error?: string | null }).error) &&
        /taking longer|interrupted|attempted too many times|timed out/i.test(
          String(rechecked.error ?? "")
        );
      if (softWait) {
        options?.onStage?.({
          ...mapDiscoveryStage(rechecked.stages, intent, rechecked.progress ?? null),
          label: "Still searching. You can keep waiting or stop anytime.",
        });
        await new Promise((resolve) => window.setTimeout(resolve, CHAT_POLL_INTERVAL_MS));
        continue;
      }

      // Not a validation/ICP 422 — use 502 so UI does not treat this as "select an ICP".
      throw new SalesEngineApiError(rechecked.error ?? "Discovery run failed.", 502);
    }

    if (options?.signal?.aborted) {
      return { run, timedOut: true, aborted: true };
    }

    await new Promise((resolve) => window.setTimeout(resolve, CHAT_POLL_INTERVAL_MS));
  }

  const run = await fetchDiscoveryRun(runId);
  return { run, timedOut: true };
}

function findLatestAssistantMessage(messages: ChatMessageApi[]): ChatMessageApi | undefined {
  return [...messages].reverse().find((message) => message.role === "assistant");
}

export function listChatMessages(sessionId: number): Promise<ChatMessageApi[]> {
  return withSessionRetry(async () =>
    seRequest<ChatMessageApi[]>({
      method: "GET",
      path: `/chat/sessions/${sessionId}/messages`,
    })
  );
}

export async function sendChatMessage(
  sessionId: number,
  payload: { body: string; intent: ChatIntent },
  options?: {
    onStage?: (info: DiscoveryStageInfo) => void;
    onDiscoveryRun?: (runId: number) => void;
    onPartial?: (info: {
      leads: ChatLead[];
      progressMessage: string | null;
      count?: number;
      requested?: number;
    }) => void;
    icpContext?: { industries?: string[]; territories?: string[]; name?: string };
    signal?: AbortSignal;
    extraWaitMsRef?: { current: number };
  }
): Promise<SendChatMessageResult> {
  return withSessionRetry(async () => {
    const timeoutMs = payload.intent === "create_outreach" ? CHAT_OUTREACH_TIMEOUT_MS : undefined;

    const initial = await seRequest<SendChatMessageResult>({
      method: "POST",
      path: `/chat/sessions/${sessionId}/messages`,
      body: payload,
      timeoutMs,
    });

    if (
      ASYNC_CHAT_INTENTS.includes(payload.intent) &&
      initial.status === "processing" &&
      initial.discovery_run_id
    ) {
      options?.onDiscoveryRun?.(initial.discovery_run_id);

      let messages = await listChatMessages(sessionId);
      const placeholder = findLatestAssistantMessage(messages);

      const pollResult = await pollDiscoveryRunUntilComplete(initial.discovery_run_id, {
        intent: payload.intent,
        onStage: options?.onStage,
        onPartial: options?.onPartial,
        signal: options?.signal,
        extraWaitMsRef: options?.extraWaitMsRef,
        maxMs:
          payload.intent === "quick_research" ? CHAT_QUICK_RESEARCH_POLL_MAX_MS : CHAT_POLL_MAX_MS,
      });

      messages = await listChatMessages(sessionId);
      const assistantMessage =
        findLatestAssistantMessage(messages.filter((message) => !message.meta?.pending)) ??
        findLatestAssistantMessage(messages) ??
        placeholder;

      if (pollResult.aborted) {
        return {
          ...initial,
          assistant_message: assistantMessage ?? null,
          status: "processing",
          pending: true,
        };
      }

      if (pollResult.timedOut && pollResult.run.status !== "completed") {
        return {
          ...initial,
          assistant_message: assistantMessage ?? null,
          status: "processing",
          pending: true,
        };
      }

      if (!assistantMessage || assistantMessage.meta?.pending) {
        throw new SalesEngineApiError("Assistant response was not found after processing.", 500);
      }

      return {
        ...initial,
        assistant_message: assistantMessage,
        status: "completed",
        pending: false,
      };
    }

    if (!initial.assistant_message) {
      throw new SalesEngineApiError("Assistant response was missing from the server.", 500);
    }

    return initial;
  });
}

// ── Metrics ─────────────────────────────────────────────────────────────────

export type SalesEngineMetrics = {
  leads_discovered: number;
  leads_pending_review: number;
  leads_in_crm: number;
  qualified_leads: number;
  companies_cached: number;
  outreach_drafts: number;
  pipeline: Record<string, number>;
};

export function fetchMetrics(): Promise<SalesEngineMetrics> {
  return withSessionRetry(async () =>
    seRequest<SalesEngineMetrics>({ method: "GET", path: "/metrics" })
  );
}

// ── Outreach ────────────────────────────────────────────────────────────────

export type OutreachDeliveryStatus =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "dropped"
  | "spam"
  | "unsubscribed"
  | null;

export type OutreachActivity = {
  id: number;
  name: string;
  channel: string;
  preview: string;
  accentBg: string;
  accentIcon: string;
  occurred_at: string;
  updated_at?: string | null;
  delivery_status?: OutreachDeliveryStatus;
  last_event_at?: string | null;
  bounce_reason?: string | null;
};

/** Newest action: send, edit, or delivery event — not original draft time. */
export function outreachActivitySortTime(item: Pick<OutreachActivity, "occurred_at" | "updated_at" | "last_event_at">): number {
  const times = [item.updated_at, item.last_event_at, item.occurred_at]
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime())
    .filter((n) => !Number.isNaN(n));
  return times.length ? Math.max(...times) : 0;
}

export function fetchRecentOutreach(): Promise<OutreachActivity[]> {
  return withSessionRetry(async () =>
    seRequest<OutreachActivity[]>({ method: "GET", path: "/outreach/recent" })
  );
}

export function sendOutreachActivity(
  activityId: number,
  payload: { to_email: string; subject?: string; body: string; inbox_id?: number }
): Promise<{
  message_id: string | null;
  sent: boolean;
  queued?: boolean;
  delivery_status?: string;
  activity_id: number;
}> {
  return withSessionRetry(async () =>
    seRequest<{
      message_id: string | null;
      sent: boolean;
      queued?: boolean;
      delivery_status?: string;
      activity_id: number;
    }>({
      method: "POST",
      path: `/outreach/activities/${activityId}/send`,
      body: payload,
    })
  );
}

export function fetchOutreachActivity(
  id: number
): Promise<OutreachDraft & { activity_id: number }> {
  return withSessionRetry(async () =>
    seRequest<OutreachDraft & { activity_id: number }>({
      method: "GET",
      path: `/outreach/activities/${id}`,
    })
  );
}

export function regenerateOutreachActivity(
  id: number,
  payload?: { instructions?: string; channel?: "email" | "whatsapp" }
): Promise<OutreachDraft & { activity_id: number; regeneration_count?: number }> {
  return withSessionRetry(async () =>
    seRequest<OutreachDraft & { activity_id: number; regeneration_count?: number }>({
      method: "POST",
      path: `/outreach/activities/${id}/regenerate`,
      body: payload ?? {},
    })
  );
}

export function deleteOutreachActivity(
  id: number
): Promise<{ deleted: boolean; id: number }> {
  return withSessionRetry(async () =>
    seRequest<{ deleted: boolean; id: number }>({
      method: "DELETE",
      path: `/outreach/activities/${id}`,
    })
  );
}

/**
 * Move a leading "Subject: …" line out of the message body into the subject field.
 * Keeps Review outreach (and copy/send) consistent when models embed the subject in body.
 */
export function normalizeOutreachSubjectBody(
  body: string,
  existingSubject?: string | null
): { subject: string; body: string } {
  const trimmedBody = body.trim();
  const match = trimmedBody.match(/^\s*subject\s*:\s*(.+?)\s*(?:\r?\n)+([\s\S]*)$/i);
  if (match) {
    const peeledSubject = match[1].trim();
    return {
      subject: peeledSubject || (existingSubject ?? "").trim(),
      body: match[2].trim(),
    };
  }

  return {
    subject: (existingSubject ?? "").trim(),
    body: trimmedBody,
  };
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

/** True when posted_at is within the last 48 hours (fresh opportunity window). */
export function isFreshSignal(iso: string | null | undefined, withinHours = 48): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const ageMs = Date.now() - date.getTime();
  return ageMs >= 0 && ageMs <= withinHours * 60 * 60 * 1000;
}

// ── Social Listening ────────────────────────────────────────────────────────

export type RecommendedActionApi = { title: string; detail: string };

/** Stage 1 (ICP Filter) audit trail — see docs/backend_implementation_plan.md. Null/absent on signals created before this shipped. */
export type SocialSignalIcpFilter = {
  passed: boolean;
  reasons: Record<string, boolean>;
};

export type SocialSignalEnrichmentStatus = "not_attempted" | "attempted_found" | "attempted_not_found";

export type EnrichmentContact = {
  personName: string | null;
  foundEmail: boolean;
  foundPhone: boolean;
  provider: string | null;
  tier: string | null;
};

export type SocialSignalEnrichment = {
  status: SocialSignalEnrichmentStatus;
  attemptedAt?: string | null;
  contacts?: EnrichmentContact[];
};

export type SocialSignalApi = {
  id: number;
  signal: string;
  summary?: string;
  source: string;
  sourceIcon: string;
  persona: string;
  company: string;
  location: string;
  intent: string;
  intentColor: string;
  description: string;
  score: number;
  profile: string;
  author_profile_url?: string | null;
  platform?: string | null;
  reasons: string[];
  signalType: string;
  buyingStage: string;
  problem: string;
  urgency: string;
  suggestedMessage: string;
  /** Object shape from newer API responses; string tolerated for defensive/cached-response compatibility. */
  recommendedAction?: RecommendedActionApi | string;
  whyThisMattersToYou?: string;
  benefits?: string[];
  personalRecommendedAction?: RecommendedActionApi | string;
  status?: string;
  posted_at?: string | null;
  post_url?: string | null;
  lead_id?: number | null;
  native_crm_saved?: boolean;
  f23_lead_id?: number | null;
  entityType?: "company" | "individual";
  industry?: string;
  keyTopics?: string[];
  competitors?: string[];
  followUpStrategy?: string;
  /** Stage 1/2/3 fields from the signal-detection rebuild — absent/null on legacy signals. */
  icpFilter?: SocialSignalIcpFilter | null;
  discreteSignalType?: string | null;
  territory?: string | null;
  namedPeople?: string[];
  enrichment?: SocialSignalEnrichment | null;
};

/** Normalizes recommendedAction/personalRecommendedAction, which may arrive as an object or a legacy plain string. */
export function normalizeRecommendedAction(
  value: RecommendedActionApi | string | null | undefined
): RecommendedActionApi {
  if (!value) return { title: "", detail: "" };
  if (typeof value === "string") return { title: value, detail: "" };
  return { title: value.title ?? "", detail: value.detail ?? "" };
}

/**
 * Structured since the Stage 1/2 pipeline rebuild (backend_implementation_plan.md
 * Phase 6). Runs created before that ship a plain human-readable string in this
 * field instead — always check the shape before reading nested fields.
 */
export type SocialListeningRunResultSummary = {
  totalChecked: number;
  qualified: number;
  rejected: {
    icpMismatch: number;
    missingSourceUrl: number;
    missingSourceDate: number;
    stale: number;
    typeMismatch?: number;
    belowMinScore?: number;
    duplicate?: number;
    total: number;
  };
  enrichment?: {
    pending?: number;
    found?: number;
    notFound?: number;
  };
  unlabeled?: number;
  budget_exhausted?: boolean;
  sources?: SocialSourceHealthItem[];
};

export type SocialSourceHealthItem = {
  key: string;
  label: string;
  status: string;
  attempts?: number;
  hits?: number;
  last_status?: number | null;
  reason?: string | null;
};

export type SocialListeningRunStatus = {
  id: number;
  status: string;
  stages?: string[] | null;
  signals_created?: number | null;
  /** Structured object on runs from the rebuilt pipeline; a plain string on legacy runs; null/absent otherwise. */
  result_summary?: SocialListeningRunResultSummary | string | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

/** Type guard: true only for the new structured shape, never the legacy string. */
export function isStructuredRunSummary(
  value: SocialListeningRunStatus["result_summary"]
): value is SocialListeningRunResultSummary {
  return typeof value === "object" && value !== null && "rejected" in value;
}

export type SocialListeningMetrics = {
  signals_detected: number;
  high_opportunities: number;
  added_to_crm: number;
  percent_change: number;
  last_run_at?: string | null;
  cadence_days?: number | null;
  freshness_window_days?: number | null;
  source_health?: SocialSourceHealthItem[];
  latest_run?: SocialListeningRunStatus | null;
};

export type FreshnessWindowDays = 7 | 14 | 30 | 90 | 180;

export type SocialListeningSettings = {
  enabled_sources: string[];
  meta_page_ids: string[];
  cadence_days: 14 | 30;
  min_score: number;
  freshness_window_days: FreshnessWindowDays;
  intent_filters: string[];
  crm_destination: "qualified_pipeline" | "human_review";
  outreach_channel_default: "email" | "human_follow_up";
  sender_mode: "platform" | "organization";
  org_verified_from_email?: string | null;
  org_verified_domain?: string | null;
  verification_status: "pending" | "verified" | "failed";
  last_run_at?: string | null;
  source_health?: SocialSourceHealthItem[];
};

export type OutreachSenderMode = "platform" | "organization";

export type OutreachIntegrityCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

export type OutreachQuotaSnapshot = {
  sender_type: string;
  used: number;
  limit: number;
  remaining: number;
};

export type OutreachInbox = {
  id: number;
  email: string;
  display_name?: string | null;
  status: "pending" | "confirmed";
  is_default: boolean;
  confirmed_at?: string | null;
  confirmation_sent_at?: string | null;
};

export type OutreachSetupStatus = {
  can_send: boolean;
  can_send_platform?: boolean;
  can_send_organization?: boolean;
  recommended_mode?: OutreachSenderMode;
  domain_connected: boolean;
  domain_verified: boolean;
  integrity_status?: string | null;
  confirmed_inbox_count: number;
  blocking_reasons: string[];
};

export type OutreachSetupRequest = {
  id: number;
  domain?: string | null;
  note?: string | null;
  status: string;
  failing_checks?: OutreachIntegrityCheck[];
  created_at?: string | null;
};

export type OutreachSenderSettings = {
  sender_mode: OutreachSenderMode;
  reply_to_email: string;
  org_verified_from_email?: string | null;
  org_verified_domain?: string | null;
  verification_status: "pending" | "verified" | "failed";
  org_connection_status: "not_connected" | "pending" | "failed" | "verified";
  platform_from_email?: string | null;
  integrity_status?: "pass" | "warn" | "fail" | null;
  integrity_checks?: OutreachIntegrityCheck[];
  integrity_checked_at?: string | null;
  default_inbox?: OutreachInbox | null;
  setup?: OutreachSetupStatus | null;
  support_request?: { id: number; status: string; domain?: string | null; created_at?: string | null } | null;
  quota?: OutreachQuotaSnapshot | null;
};

export type OutreachDnsRecord = {
  label: string;
  host: string;
  type: string;
  data: string;
  valid: boolean;
};

export type OutreachDomainAuthentication = {
  domain: string;
  from_email: string | null;
  dns_records: OutreachDnsRecord[];
  verification_status: "pending" | "verified" | "failed";
  valid: boolean;
  verified_at?: string | null;
  last_checked_at?: string | null;
  integrity_status?: "pass" | "warn" | "fail" | null;
  integrity_checks?: OutreachIntegrityCheck[];
  integrity_checked_at?: string | null;
} | null;

export type OutreachDraft = {
  channel: "email" | "whatsapp";
  subject?: string | null;
  body: string;
  sent: boolean;
  to_email?: string | null;
  activity_id?: number | null;
  target_lead_ids?: number[];
  activity_ids?: number[];
  icp_alignment_note?: string;
  regeneration_count?: number;
  name?: string | null;
  social_signal_id?: number | null;
  leads?: Array<{ id: number; name: string; email?: string | null; phone?: string | null; [key: string]: unknown }>;
};

export type PaginatedMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type PaginatedSocialSignals = {
  items: SocialSignalApi[];
  meta: PaginatedMeta;
};

type PaginatedResponse<T> = {
  data: T[];
  meta: PaginatedMeta;
};

async function seRequestPaginated<T>({
  method,
  path,
  body,
  token,
  orgId,
}: {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  token?: string;
  orgId?: string | null;
}): Promise<PaginatedResponse<T>> {
  const authToken = token ?? getSalesEngineToken();
  if (!authToken) {
    throw new SalesEngineApiError("Sales Engine session is not ready.", 401);
  }

  const organizationId = orgId ?? getSalesEngineOrgId();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (organizationId) {
    headers["X-Organization-Id"] = organizationId;
  }

  const response = await fetch(`${SALES_ENGINE_API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; data?: T[]; meta?: PaginatedMeta }
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Sales Engine request failed (${response.status})`;
    const reason =
      payload &&
      typeof payload === "object" &&
      "reason" in payload &&
      typeof payload.reason === "string"
        ? payload.reason
        : null;
    throw new SalesEngineApiError(message, response.status, reason);
  }

  return {
    data: (payload?.data ?? []) as T[],
    meta: payload?.meta ?? { current_page: 1, last_page: 1, per_page: 10, total: 0 },
  };
}

export function fetchSocialSignals(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  source?: string;
  signal_type?: string;
  buying_stage?: string;
}): Promise<PaginatedSocialSignals> {
  return withSessionRetry(async () => {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.per_page) query.set("per_page", String(params.per_page));
    if (params?.search) query.set("search", params.search);
    if (params?.source && params.source !== "all") query.set("source", params.source);
    if (params?.signal_type && params.signal_type !== "all") query.set("signal_type", params.signal_type);
    if (params?.buying_stage && params.buying_stage !== "all") query.set("buying_stage", params.buying_stage);

    const qs = query.toString();
    const result = await seRequestPaginated<SocialSignalApi>({
      method: "GET",
      path: `/social-listening/signals${qs ? `?${qs}` : ""}`,
    });
    return { items: result.data, meta: result.meta };
  });
}

export function fetchSocialSignal(id: number): Promise<SocialSignalApi> {
  return withSessionRetry(async () =>
    seRequest<SocialSignalApi>({ method: "GET", path: `/social-listening/signals/${id}` })
  );
}

export type SignalTypeDefinitionApi = {
  key: string;
  label: string;
  pack: string;
  triggerDescription?: string;
  feedsEnrichment?: boolean;
  recencyWindowDays?: number;
};

export function listSignalTypes(icpProfileId?: string): Promise<SignalTypeDefinitionApi[]> {
  return withSessionRetry(async () => {
    const query = new URLSearchParams();
    if (icpProfileId) query.set("icpProfileId", icpProfileId);
    const qs = query.toString();
    const data = await seRequest<SignalTypeDefinitionApi[]>({
      method: "GET",
      path: `/signal-types${qs ? `?${qs}` : ""}`,
    });
    return data ?? [];
  });
}

export function fetchSocialListeningMetrics(): Promise<SocialListeningMetrics> {
  return withSessionRetry(async () =>
    seRequest<SocialListeningMetrics>({ method: "GET", path: "/social-listening/metrics" })
  );
}

export function fetchSocialListeningSettings(): Promise<SocialListeningSettings> {
  return withSessionRetry(async () =>
    seRequest<SocialListeningSettings>({ method: "GET", path: "/social-listening/settings" })
  );
}

export function updateSocialListeningSettings(
  payload: Partial<SocialListeningSettings>
): Promise<SocialListeningSettings> {
  return withSessionRetry(async () =>
    seRequest<SocialListeningSettings>({
      method: "PUT",
      path: "/social-listening/settings",
      body: payload,
    })
  );
}

export function triggerSocialListeningRun(force = false): Promise<{ id: number; status: string }> {
  return withSessionRetry(async () =>
    seRequest<{ id: number; status: string }>({
      method: "POST",
      path: "/social-listening/runs",
      body: force ? { force: true } : {},
    })
  );
}

export function bootstrapSocialListeningRun(force = false): Promise<{
  id: number;
  status: string;
  bootstrapped: boolean;
  latest_run?: SocialListeningRunStatus | null;
}> {
  return withSessionRetry(async () =>
    seRequest<{
      id: number;
      status: string;
      bootstrapped: boolean;
      latest_run?: SocialListeningRunStatus | null;
    }>({
      method: "POST",
      path: "/social-listening/runs/bootstrap",
      body: force ? { force: true } : {},
    })
  );
}

export function fetchSocialListeningRun(id: number): Promise<SocialListeningRunStatus> {
  return withSessionRetry(async () =>
    seRequest<SocialListeningRunStatus>({ method: "GET", path: `/social-listening/runs/${id}` })
  );
}

export function createSignalOutreach(
  id: number,
  opts?: { send?: boolean; to_email?: string }
): Promise<{
  subject?: string | null;
  body: string;
  to_email?: string | null;
  activity_id?: number;
  sent?: boolean;
  channel?: "email" | "whatsapp";
}> {
  return withSessionRetry(async () =>
    seRequest<{
      subject?: string | null;
      body: string;
      to_email?: string | null;
      activity_id?: number;
      sent?: boolean;
      channel?: "email" | "whatsapp";
    }>({
      method: "POST",
      path: `/social-listening/signals/${id}/outreach`,
      body: opts ?? {},
    })
  );
}

export function setSignalReminder(
  id: number,
  payload?: { remind_at?: string; note?: string }
): Promise<{ id: number; remind_at: string }> {
  return withSessionRetry(async () =>
    seRequest<{ id: number; remind_at: string }>({
      method: "POST",
      path: `/social-listening/signals/${id}/reminder`,
      body: payload ?? {},
    })
  );
}

export async function syncSignalToCrm(id: number, opts?: { pipeline_id?: number | string }): Promise<{ lead_id: number; signal_id?: number; crm_lead_id?: number }> {
  const result = await withSessionRetry(() => seRequest<NativeSaveBatch>({ method: "POST", path: "/crm/leads/from-social-signal", body: { signal_ids: [id], pipeline_id: opts?.pipeline_id } }));
  if (!result.synced[0]) throw new SalesEngineApiError(result.errors[0] || "Could not save this signal.", 422);
  return result.synced[0];
}

export function dismissSignal(id: number): Promise<SocialSignalApi> {
  return withSessionRetry(async () =>
    seRequest<SocialSignalApi>({
      method: "POST",
      path: `/social-listening/signals/${id}/dismiss`,
    })
  );
}

export function fetchOutreachSenderSettings(): Promise<OutreachSenderSettings> {
  return withSessionRetry(async () =>
    seRequest<OutreachSenderSettings>({ method: "GET", path: "/outreach/sender-settings" })
  );
}

export function updateOutreachSenderSettings(payload: {
  sender_mode?: OutreachSenderMode;
  default_inbox_id?: number | null;
  reply_to_email?: string | null;
}): Promise<OutreachSenderSettings> {
  return withSessionRetry(async () =>
    seRequest<OutreachSenderSettings>({
      method: "PUT",
      path: "/outreach/sender-settings",
      body: payload,
    })
  );
}

export function fetchOutreachDomain(): Promise<OutreachDomainAuthentication> {
  return withSessionRetry(async () =>
    seRequest<OutreachDomainAuthentication>({ method: "GET", path: "/outreach/domain" })
  );
}

export function authenticateOutreachDomain(payload: {
  domain: string;
  from_email: string;
}): Promise<OutreachDomainAuthentication> {
  return withSessionRetry(async () =>
    seRequest<OutreachDomainAuthentication>({
      method: "POST",
      path: "/outreach/domain",
      body: payload,
    })
  );
}

export function verifyOutreachDomain(): Promise<OutreachDomainAuthentication> {
  return withSessionRetry(async () =>
    seRequest<OutreachDomainAuthentication>({ method: "POST", path: "/outreach/domain/verify" })
  );
}

export function deleteOutreachDomain(): Promise<void> {
  return withSessionRetry(async () => {
    await seRequest<null>({ method: "DELETE", path: "/outreach/domain" });
  });
}

export function recheckOutreachDomainIntegrity(): Promise<
  NonNullable<OutreachDomainAuthentication>
> {
  return withSessionRetry(async () =>
    seRequest<NonNullable<OutreachDomainAuthentication>>({
      method: "POST",
      path: "/outreach/domain/integrity-recheck",
    })
  );
}

export function fetchOutreachInboxes(): Promise<OutreachInbox[]> {
  return withSessionRetry(async () =>
    seRequest<OutreachInbox[]>({ method: "GET", path: "/outreach/inboxes" })
  );
}

export function createOutreachInbox(payload: {
  email: string;
  display_name?: string;
}): Promise<OutreachInbox> {
  return withSessionRetry(async () =>
    seRequest<OutreachInbox>({ method: "POST", path: "/outreach/inboxes", body: payload })
  );
}

export function confirmOutreachInbox(id: number, code: string): Promise<OutreachInbox> {
  return withSessionRetry(async () =>
    seRequest<OutreachInbox>({
      method: "POST",
      path: `/outreach/inboxes/${id}/confirm`,
      body: { code },
    })
  );
}

export function resendOutreachInboxConfirmation(id: number): Promise<OutreachInbox> {
  return withSessionRetry(async () =>
    seRequest<OutreachInbox>({ method: "POST", path: `/outreach/inboxes/${id}/resend` })
  );
}

export function setDefaultOutreachInbox(id: number): Promise<OutreachInbox> {
  return withSessionRetry(async () =>
    seRequest<OutreachInbox>({ method: "POST", path: `/outreach/inboxes/${id}/default` })
  );
}

export function deleteOutreachInbox(id: number): Promise<void> {
  return withSessionRetry(async () => {
    await seRequest<null>({ method: "DELETE", path: `/outreach/inboxes/${id}` });
  });
}

export function fetchOutreachSetupRequest(): Promise<OutreachSetupRequest | null> {
  return withSessionRetry(async () =>
    seRequest<OutreachSetupRequest | null>({ method: "GET", path: "/outreach/setup-request" })
  );
}

export function createOutreachSetupRequest(payload: {
  note?: string;
  domain?: string;
}): Promise<OutreachSetupRequest> {
  return withSessionRetry(async () =>
    seRequest<OutreachSetupRequest>({
      method: "POST",
      path: "/outreach/setup-request",
      body: payload,
    })
  );
}

export type Factory23IntegrationStatus = {
  configured: boolean;
  global_enabled: boolean;
  organization_enabled: boolean;
  f23_company_id?: string | number | null;
  linked: boolean;
  token_linked?: boolean;
  can_sync: boolean;
  block_reason?: string | null;
  block_message?: string | null;
};

export function fetchFactory23IntegrationStatus(): Promise<Factory23IntegrationStatus> {
  return withSessionRetry(async () =>
    seRequest<Factory23IntegrationStatus>({
      method: "GET",
      path: "/integrations/factory23/status",
    })
  );
}

export async function fetchFactory23IntegrationStatusWithAutoEnsure(): Promise<Factory23IntegrationStatus> {
  let status = await fetchFactory23IntegrationStatus();
  if (!status.can_sync && status.block_reason === "not_configured") {
    try {
      status = await ensureFactory23CrmLink();
    } catch {
      return status;
    }
  }

  return status;
}

export type NativeSaveResult = { lead_id: number; crm_lead_id?: number; pipeline_id?: number; save_status?: string; synced?: boolean; already_synced?: boolean; updated?: boolean; fields_updated?: string[]; crm_duplicate?: boolean; crm_duplicate_reason?: string | null; crm_fields_updated?: string[] };
export type NativeSaveBatch = { synced: NativeSaveResult[]; errors: string[] };

export async function pushLeadToCrm(leadId: number, opts?: { pipeline_id?: number | string }): Promise<NativeSaveResult> {
  const result = await syncLeadsBatch([leadId], opts);
  if (!result.synced[0]) throw new SalesEngineApiError(result.errors[0] || "Could not save this lead.", 422);
  return result.synced[0];
}

export async function syncLeadsBatch(leadIds: number[], options?: { pipeline_id?: number | string }): Promise<NativeSaveBatch> {
  const result: NativeSaveBatch = { synced: [], errors: [] };
  for (let offset = 0; offset < leadIds.length; offset += 25) {
    const batch = await withSessionRetry(() => seRequest<NativeSaveBatch>({ method: "POST", path: "/crm/leads/from-discovery", body: { lead_ids: leadIds.slice(offset, offset + 25), pipeline_id: options?.pipeline_id } }));
    result.synced.push(...batch.synced);
    result.errors.push(...batch.errors);
  }
  return result;
}

export async function fetchPendingReviewLeads(icpProfileId?: string): Promise<ChatLead[]> {
  return withSessionRetry(async () => {
    const items: ChatLead[] = [];
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ page: String(page), per_page: "100" });
      if (icpProfileId && icpProfileId !== "all") query.set("icp_profile_id", icpProfileId);
      const result = await seRequest<{ items: ChatLead[]; last_page: number }>({ method: "GET", path: `/crm/discovery-pending?${query}` });
      items.push(...result.items);
      if (page >= result.last_page) break;
    }
    return items;
  });
}
