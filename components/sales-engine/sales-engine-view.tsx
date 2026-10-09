"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { PAGE_SIZE, ProspectPagination } from "@/components/ui/prospect-pagination";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ProcessingPanel } from "./processing-panel";
import { ResearchProcessingPanel } from "./research-processing-panel";
import { IcpBuilderModal, type IcpProfile } from "./icp-builder-modal";
import { IcpSetupPromptModal } from "./icp-setup-prompt-modal";
import { OutreachPreviewModal } from "./outreach-preview-modal";
import { OutreachSettingsModal } from "./outreach-settings-modal";
import {
  AddToCrmPipelineModal,
  CreateOutreachConfirmModal,
  SetReminderConfirmModal,
  type CrmPipelineOption,
} from "./crm-action-modals";
import { SocialScanPanel } from "./social-scan-panel";
import { ScanRunSummaryPanel } from "./scan-run-summary-panel";
import {
  SocialOpportunityEmptyState,
  SocialSignalsEmptyState,
} from "./social-listening-empty-states";
import {
  SocialOpportunityDetailSkeleton,
  SocialSignalsTableSkeleton,
} from "./social-scan-skeletons";
import { ChatMessageBody } from "./chat-message-body";
import {
  ResearchSourcesList,
  researchSourcesFromMeta,
} from "./research-sources-list";
import { SearchableSelect, type SelectOption } from "@/components/ui/searchable-select";
import { useActivateIcpProfile, useActiveIcpProfile, useIcpProfiles } from "@/hooks/use-sales-engine-icp";
import {
  composeIcpQualifySummary,
  composeIcpSearchBrief,
  composeIcpSearchQueries,
  composeSearchGeoCaption,
  entityModeLabel,
  isInsufficientIcpSearchBrief,
  withEntityModeCue,
  withProspectCountCue,
  type GenerateEntityMode,
  type GenerateProspectCount,
} from "@/lib/sales-engine/icp-search-brief";
import { shouldShowIcpConfirmCard } from "@/lib/sales-engine/is-generic-lead-request";
import { useSyncLeadToCrm, useSyncLeadsBatchToCrm } from "@/hooks/use-sync-leads-to-crm";
import { usePendingChatDiscovery } from "@/hooks/use-pending-chat-discovery";
import {
  isForegroundChatWaiting,
  isMissingActiveIcp,
  mapApiMessagesToUi,
  SALES_ENGINE_CHAT_KEYS,
  useChatHistory,
  useClearChatHistory,
  useSendChatMessage,
} from "@/hooks/use-sales-engine-chat";
import { useQueryClient } from "@tanstack/react-query";
import { useSalesEngineMetrics } from "@/hooks/use-sales-engine-metrics";
import { useSalesEngineOutreach, useDeleteOutreachActivity } from "@/hooks/use-sales-engine-outreach";
import {
  useCreateSignalOutreach,
  useDismissSignal,
  useSetSignalReminder,
  useSignalTypes,
  useSocialListeningBootstrap,
  useSocialListeningSignals,
  useSyncSignalToCrm,
  useTriggerSocialListeningRun,
} from "@/hooks/use-sales-engine-social-listening";
import { getSocialListeningEmptyState } from "@/lib/social-listening-empty-state";
import {
  useSocialListeningSettings,
  useUpdateSocialListeningSettings,
} from "@/hooks/use-sales-engine-social-settings";
import { useCrmPipelines, useCrmPreferences } from "@/hooks/use-crm";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { resolveCrmPipelineId } from "@/lib/crm/resolve-pipeline";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { ApiRoleBasePath } from "@/lib/api/crm";
import { leadScoreBreakdown } from "@/lib/icp-advisory-leads";
import {
  formatLeadContactLine,
  formatLeadRoleLine,
  leadEntityBadge,
  primaryProfileUrl,
  primaryWebsiteUrl,
} from "@/lib/enriched-lead-card";
import {
  cancelDiscoveryRun,
  fetchOutreachActivity,
  formatRelativeTime,
  isFreshSignal,
  normalizeOutreachSubjectBody,
  normalizeRecommendedAction,
  outreachActivitySortTime,
  type ChatIntent,
  type ChatLead,
  type FreshnessWindowDays,
  type OutreachActivity,
  type OutreachDraft,
  type SocialListeningSettings,
  type SocialSignalApi,
  type SocialSignalIcpFilter,
} from "@/lib/api/sales-engine";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Copy,
  Expand,
  ExternalLink,
  Eye,
  Globe2,
  LayoutGrid,
  Lightbulb,
  List,
  Loader2,
  Mail,
  MessageCircle,
  Minimize2,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  AlertTriangle,
  User,
  UserPlus,
  UsersRound,
  ListChecks,
  X,
} from "lucide-react";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  body: string;
  intent?: ChatIntent;
  leads?: ChatLead[];
  meta?: Record<string, unknown> | null;
  /** Renders an inline ICP confirmation card instead of the normal chat bubble. */
  kind?: "confirm-icp";
  /** Resolved prospect target shown as a caption under a "generate_leads" user bubble. */
  targetCount?: number;
  /** Entity mix for generate caption (both / companies / people). */
  entityMode?: GenerateEntityMode;
  /** Search brief echoed under the user bubble when ICP brief path is used. */
  searchCaption?: string;
  /** True when the outbound send for this user prompt failed and can be retried. */
  failed?: boolean;
};

type OutreachPreviewState = {
  activityId: number | null;
  channel: "email" | "whatsapp";
  subject?: string | null;
  body: string;
  toEmail?: string;
  contextLabel?: string;
  alignmentNote?: string;
  /** Chat message id — used to mark the transcript draft as sent. */
  messageId?: number;
  /** Social signal id — used to show Sent badge in the detail panel. */
  signalId?: number;
};

type SearchUsage = { used: number; limit: number };

const SEARCH_USAGE_STORAGE_KEY = "sales_engine_search_usage_v1";
const DEFAULT_SEARCH_USAGE_LIMIT = 500;
const MAX_PROSPECT_COUNT = 150;
const LEADS_PER_PAGE = 20;
const EXPLICIT_COUNT_PATTERN = /\b(\d{1,3})\b/;
const USAGE_QUESTION_PATTERN =
  /how many (search|token|credit)(es)?|(search|token|credit)(es)?\s+(left|remaining)|remaining\s+(search|token)/i;

/** "new_market_entry" -> "New Market Entry". Discrete signal types are stored as snake_case keys. */
function formatSignalTypeKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function leadLocationCaption(lead: ChatLead): string | null {
  const loc = (lead.location ?? "").trim();
  if (loc) return loc;
  if (lead.location_status === "outside_territory") return "Outside territory";
  if (lead.location_status === "unknown") return "Location not confirmed.";
  return null;
}

function formatPostedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}


const INTENT_COLORS = [
  "#7525B7", // Purple
  "#B73D22", // Reddish brown
  "#2270AB", // Blue
  "#4B9B20", // Green
];

function getIntentColor(intentLabel: string): string {
  let hash = 0;
  for (let i = 0; i < intentLabel.length; i++) {
    hash = intentLabel.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % INTENT_COLORS.length;
  return INTENT_COLORS[index];
}

function primarySignalTypeLabel(signal: SocialSignalApi): string {
  if (signal.discreteSignalType) return formatSignalTypeKey(signal.discreteSignalType);
  return signal.intent || signal.signalType || "Signal";
}

function matchedIcpFieldLabels(filter?: SocialSignalIcpFilter | null): string[] {
  if (!filter?.reasons) return [];
  const labels: Record<string, string> = {
    industry: "industry",
    territory: "territory",
    companySize: "company size",
    revenue: "revenue",
  };
  return Object.entries(filter.reasons)
    .filter(([, passed]) => passed)
    .map(([field]) => labels[field] ?? field);
}

function readSearchUsage(): SearchUsage {
  if (typeof window === "undefined") return { used: 0, limit: DEFAULT_SEARCH_USAGE_LIMIT };
  try {
    const raw = window.localStorage.getItem(SEARCH_USAGE_STORAGE_KEY);
    if (!raw) return { used: 0, limit: DEFAULT_SEARCH_USAGE_LIMIT };
    const parsed = JSON.parse(raw) as Partial<SearchUsage>;
    return {
      used: typeof parsed.used === "number" ? parsed.used : 0,
      limit: typeof parsed.limit === "number" ? parsed.limit : DEFAULT_SEARCH_USAGE_LIMIT,
    };
  } catch {
    return { used: 0, limit: DEFAULT_SEARCH_USAGE_LIMIT };
  }
}

function writeSearchUsage(usage: SearchUsage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEARCH_USAGE_STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // ignore quota errors
  }
}

/** Resolves the outgoing generate_leads prompt. Only preserves an explicit user count — never injects a default. */
function resolveGenerateLeadsPrompt(prompt: string): { body: string; targetCount: number | null; apiBody: string } {
  const hasParseableCount =
    /\b(?:give me|find|get|show|list|need|want)\s+\d{1,3}\b/i.test(prompt) ||
    /\b\d{1,3}\s+(?:people|persons|leads|prospects|contacts|names|executives|companies|accounts|men|women)\b/i.test(
      prompt
    ) ||
    /\btop\s+\d{1,3}\b/i.test(prompt);

  const match = hasParseableCount ? prompt.match(EXPLICIT_COUNT_PATTERN) : null;
  const targetCount = match
    ? Math.min(MAX_PROSPECT_COUNT, Math.max(1, Number(match[1])))
    : null;

  // When the user did not ask for a count, send the prompt as-is and let the backend default apply.
  const apiBody = prompt.trim();

  return {
    body: prompt,
    targetCount,
    apiBody,
  };
}

type ActionIntent = Exclude<ChatIntent, "freeform">;
type SalesEngineTab = "smart-lead" | "social-listening";

type SocialSignal = SocialSignalApi;

type SocialStatCard = {
  title: string;
  value: string;
  percent: string;
  unit: string;
  active?: boolean;
};

import { useSalesEngineCrmPipelines } from "@/hooks/use-sales-engine-pipelines";

const INTENT_PLACEHOLDERS: Record<ChatIntent, string> = {
  freeform: "Ask or search anything",
  quick_research: "Research market trends, competitors, or industry signals…",
  generate_leads: "Find people or companies that match your ICP…",
  generate_more_leads: "Find more prospects like the ones above…",
  create_outreach: "Draft a follow up email or WhatsApp message for…",
};

const INTENT_MODE_CONFIG: Record<
  ActionIntent,
  { label: string; tint: string; chipTint: string; icon: ReactNode }
> = {
  quick_research: {
    label: "Quick Research",
    tint: "bg-[#e6a5ee]",
    chipTint: "bg-[#c860d2] text-[#09232d]",
    icon: <Globe2 size={12} className="shrink-0" />,
  },
  generate_leads: {
    label: "Generate New Prospects",
    tint: "bg-[#e4faff]",
    chipTint: "bg-[#c8f0ff] text-[#09232d]",
    icon: <UsersRound size={12} className="shrink-0" />,
  },
  generate_more_leads: {
    label: "Generate More Prospects",
    tint: "bg-[#e4faff]",
    chipTint: "bg-[#c8f0ff] text-[#09232d]",
    icon: <UsersRound size={12} className="shrink-0" />,
  },
  create_outreach: {
    label: "Create Outreach",
    tint: "bg-[#f2ffe9]",
    chipTint: "bg-[#dfffc8] text-[#09232d]",
    icon: <Lightbulb size={12} className="shrink-0" />,
  },
};

const weekDays = ["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"];
const SOURCE_SETTING_OPTIONS = [
  { key: "linkedin_public", label: "LinkedIn public index" },
  { key: "x_mentions", label: "X/Twitter mentions" },
  { key: "reddit", label: "Reddit communities" },
  { key: "meta_pages", label: "Meta business pages" },
  { key: "meta_graph_pages", label: "Meta pages (direct monitoring)" },
] as const;

const INTENT_SETTING_OPTIONS = [
  { key: "recommendation", label: "Recommendations" },
  { key: "switching", label: "Switching" },
  { key: "pricing", label: "Pricing questions" },
  { key: "hiring_expansion", label: "Hiring or expansion" },
  { key: "investment_opportunity", label: "Investment opportunities" },
  { key: "funding_event", label: "Funding events" },
  { key: "market_signal", label: "Market signals" },
  { key: "partnership_opportunity", label: "Partnership opportunities" },
  { key: "competitive_move", label: "Competitive moves" },
  { key: "regulatory_change", label: "Regulatory changes" },
] as const;

const sourceFilterOptions: SelectOption[] = [
  { value: "all", label: "All Sources" },
  { value: "LinkedIn Post", label: "LinkedIn Post" },
  { value: "X/Twitter Post", label: "X/Twitter Post" },
  { value: "Reddit Post", label: "Reddit Post" },
  { value: "Google Search", label: "Google Search" },
  { value: "Meta Page Post", label: "Meta Page Post" },
];

const legacySignalTypeFilterOptions: SelectOption[] = [
  { value: "all", label: "All Signal Type" },
  { value: "Recommendation", label: "Recommendation" },
  { value: "Switching", label: "Switching" },
  { value: "Price", label: "Price" },
  { value: "Investment Opportunity", label: "Investment Opportunity" },
  { value: "Funding Event", label: "Funding Event" },
  { value: "Market Signal", label: "Market Signal" },
  { value: "Partnership Opportunity", label: "Partnership Opportunity" },
  { value: "Competitive Move", label: "Competitive Move" },
  { value: "Regulatory Change", label: "Regulatory Change" },
];

const intentFilterOptions: SelectOption[] = [
  { value: "all", label: "All Intent" },
  { value: "Consideration", label: "Consideration" },
  { value: "Vendor Evaluation", label: "Vendor Evaluation" },
  { value: "Research", label: "Research" },
];

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    body:
      "Welcome to Sales Engine.\n\nI'm your AI powered assistant built to help you discover high quality prospects, craft personalized outreach messages, and develop smart follow up strategies that improve response rates.\n\nWhether you're looking to identify companies in a specific industry, refine your targeting, write compelling sales emails, or understand why certain prospects aren't responding, I'm here to guide you through the process step by step.\n\nYou can ask me to generate new prospects, analyze your outreach performance, suggest improvements, or create follow up messages based on engagement activity. The more details you provide about your target audience, location, or offer, the more precise and effective my recommendations will be.\n\nLet's start building smarter outreach.\n\nWhat would you like to work on today?",
  },
];

function MetricCard({
  title,
  value,
  percent,
  active = false,
  unit = "Leads",
  isScanning = false,
  href,
  onClick,
  actionLabel,
}: {
  title: string;
  value: string;
  percent: string;
  active?: boolean;
  unit?: string;
  isScanning?: boolean;
  href?: string;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const isInteractive = Boolean(href || onClick);

  const cardContent = (
    <section
      className={`se-stat-card relative h-[126px] overflow-hidden rounded-[15px] border border-[rgba(179,179,179,0.2)] px-5 py-3 shadow-[0_1px_3px_1px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] transition-all ${
        active ? "bg-[#0b242e] text-white" : "bg-white text-[#0b242e]"
      } ${isScanning ? "ring-1 ring-[#16b37d]/30" : ""} ${
        isInteractive
          ? "cursor-pointer hover:scale-[1.015] hover:shadow-md active:scale-[0.99]"
          : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-[14px] font-light leading-[19px] ${active ? "text-white" : "text-[#293e46]"}`}>
          {title}
        </p>
        {isInteractive && (
          <span
            className={`text-[10px] font-medium flex items-center gap-0.5 transition-colors ${
              active ? "text-white/70 group-hover:text-white" : "text-[#09232d]/70 group-hover:text-[#09232d]"
            }`}
          >
            {actionLabel ?? (href?.includes("crm") ? "View in CRM →" : "View →")}
          </span>
        )}
      </div>

      <div className="absolute left-5 top-[48px]">
        <div className="flex items-end gap-1">
          <p className="text-[32px] font-semibold leading-[43px]">{value}</p>
          <p className={`pb-2 text-[9px] font-semibold ${active ? "text-white" : "text-[#0b242e]"}`}>
            {unit}
          </p>
        </div>
        <p className={`mt-[-4px] text-[8px] leading-[16px] ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {isScanning ? "Scan in progress…" : `${percent}% increase this week`}
        </p>
      </div>
      <div className="absolute right-[17px] top-[19px] grid size-[108px] place-items-center">
        <div
          className={`absolute size-[84px] rounded-full border-[7px] ${
            active ? "border-[#2ae9c9]" : "border-[#c974f4]"
          } border-l-transparent rotate-[-24deg] ${isScanning ? "sales-gauge-spin" : ""}`}
        />
        <div className={`absolute size-[49px] rounded-full ${active ? "bg-[#14343e]" : "bg-[#f9f9f9]"}`} />
        <p className={`relative text-[8px] font-semibold ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {isScanning ? "…" : `${percent}%`}
        </p>
      </div>
    </section>
  );

  if (href) {
    return (
      <Link href={href} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#09232d]">
        {cardContent}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#09232d]"
      >
        {cardContent}
      </button>
    );
  }

  return cardContent;
}

function TrendChart() {
  return (
    <section className="se-chart relative flex h-[126px] min-w-[420px] flex-1 flex-col overflow-hidden rounded-[20px] !px-5 !pt-3.5 !pb-2.5 max-lg:min-w-0">
      <div className="grid grid-cols-6 text-[12px] font-medium leading-none text-[#f8f8f8]">
        {weekDays.map((day) => (
          <span key={day} className="text-center">
            {day}
          </span>
        ))}
      </div>
      <div className="relative mt-2 flex-1 w-full min-h-0">
        <div className="absolute inset-0 grid grid-cols-6 pointer-events-none" aria-hidden="true">
          {weekDays.map((day, index) => (
            <div key={day} className="relative h-full">
              <span
                className={`absolute left-1/2 top-0 bottom-1.5 -translate-x-1/2 border-l border-dashed ${
                  index === 4 ? "border-[#c974f4]" : "border-[#6b9bb0]"
                }`}
              />
            </div>
          ))}
        </div>
        <svg
          viewBox="0 0 430 112"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-hidden"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sales-trend-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2ae9c9" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2ae9c9" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 54 C8 42 18 42 27 53 C37 64 45 38 56 51 C69 64 79 34 92 47 C105 58 118 42 130 45 C145 49 154 23 167 34 C181 47 192 20 207 31 C221 42 226 68 239 76 C254 93 270 68 284 76 C297 84 309 67 323 73 C337 79 348 54 362 68 C379 84 394 77 410 83 C421 87 427 81 430 84"
            fill="none"
            stroke="#2ae9c9"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d="M0 54 C8 42 18 42 27 53 C37 64 45 38 56 51 C69 64 79 34 92 47 C105 58 118 42 130 45 C145 49 154 23 167 34 C181 47 192 20 207 31 C221 42 226 68 239 76 C254 93 270 68 284 76 C297 84 309 67 323 73 C337 79 348 54 362 68 C379 84 394 77 410 83 C421 87 427 81 430 84 L430 112 L0 112 Z"
            fill="url(#sales-trend-fill)"
          />
          <path d="M318 83 H382" stroke="#2ae9c9" strokeDasharray="6 6" strokeLinecap="round" />
        </svg>
        <div className="absolute right-2 top-1 flex h-5 items-center gap-1 rounded-[12px] border border-[#e4e4e9] bg-white px-2.5 shadow-[0_12px_17px_rgba(11,36,46,0.15)] whitespace-nowrap pointer-events-none">
          <span className="text-[11px] font-medium text-[#022228]">+27%</span>
          <span className="text-[10px] text-[#09232d]/70">Performance higher this week</span>
        </div>
      </div>
    </section>
  );
}

function IntentModeChip({
  intent,
  onClear,
  compact = false,
}: {
  intent: ActionIntent | string;
  onClear?: () => void;
  compact?: boolean;
}) {
  const mode = INTENT_MODE_CONFIG[intent as ActionIntent];
  if (!mode) return null;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-semibold ${mode.chipTint} ${
        compact ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[9px]"
      }`}
    >
      {mode.icon}
      <span className="truncate">{mode.label}</span>
      {onClear && (
        <button
          type="button"
          aria-label={`Clear ${mode.label} mode`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClear();
          }}
          className="ml-0.5 grid size-4 shrink-0 place-items-center rounded-full transition hover:bg-black/10"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

function PromptButton({
  icon,
  label,
  tint,
  active = false,
  onSelect,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  tint: string;
  active?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      disabled={disabled}
      aria-pressed={active}
      className={`flex h-[32px] items-center gap-2 rounded-[18px] border px-4 text-[9px] font-medium text-[#09232d] shadow-[0_1px_2px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:opacity-50 ${tint} ${
        active ? "border-[#09232d] ring-2 ring-[#09232d]/20" : "border-black/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function LeadInlineResults({
  leads,
  onLeadsChange,
  onNotRelevant,
}: {
  leads: ChatLead[];
  onLeadsChange?: (leads: ChatLead[]) => void;
  onNotRelevant?: (lead: ChatLead) => void;
}) {
  const syncLead = useSyncLeadToCrm();
  const syncBatch = useSyncLeadsBatchToCrm();
  const { pipelines, isLoading: pipelinesLoading, isError: pipelinesError, refetch: retryPipelines } = useSalesEngineCrmPipelines();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [displayCount, setDisplayCount] = useState(LEADS_PER_PAGE);
  const [crmModalState, setCrmModalState] = useState<
    | { mode: "single"; lead: ChatLead }
    | { mode: "batch"; leadIds: number[] }
    | null
  >(null);
  const canSyncToCrm = true;
  const crmBlockMessage =
    "CRM is unavailable. Sign in again or retry loading your pipelines.";
  const unsavedIds = leads
    .filter((lead) => !lead.native_crm_saved && !lead.native_crm_lead_id)
    .map((lead) => lead.id);
  const visibleLeads = leads.slice(0, displayCount);
  const hasMore = displayCount < leads.length;
  const remaining = Math.max(leads.length - displayCount, 0);

  function markSynced(
    ids: number[],
    extras?: Partial<Pick<ChatLead, "crm_duplicate" | "crm_duplicate_reason" | "crm_fields_updated">>
  ) {
    onLeadsChange?.(
      leads.map((lead) =>
        ids.includes(lead.id)
          ? {
              ...lead,
              crm_synced: true,
              native_crm_saved: true,
              save_status: "saved" as const,
              ...(extras ?? {}),
            }
          : lead
      )
    );
  }

  function handleConfirmCrmSave(pipelineId: string) {
    if (!crmModalState) return;

    if (crmModalState.mode === "single") {
      const lead = crmModalState.lead;
      syncLead.mutate(
        { leadId: lead.id, pipeline_id: pipelineId },
        {
          onSuccess: (result) => {
            const updatedFields = Array.isArray(result.crm_fields_updated)
              ? result.crm_fields_updated
              : Array.isArray(result.fields_updated)
                ? result.fields_updated
                : [];
            markSynced([lead.id], {
              crm_duplicate: Boolean(result.crm_duplicate),
              crm_duplicate_reason: result.crm_duplicate_reason ?? null,
              crm_fields_updated: updatedFields,
            });
            if (result.updated && updatedFields.length > 0) {
              toast.success(`Updated existing CRM lead with new ${updatedFields.join(", ")}.`);
            } else if (result.crm_duplicate || result.already_synced) {
              toast.success(`"${lead.name}" is already in CRM.`);
            } else {
              toast.success(`Saved "${lead.name}" to CRM.`);
            }
            setCrmModalState(null);
          },
          onError: (error) => toast.error(getApiErrorMessage(error, "Could not save lead to CRM.")),
        }
      );
    } else if (crmModalState.mode === "batch") {
      const ids = crmModalState.leadIds;
      syncBatch.mutate(
        { leadIds: ids, pipeline_id: pipelineId },
        {
          onSuccess: (result) => {
            const syncedIds = result.synced.map((item) => item.lead_id);
            markSynced(syncedIds);
            toast.success(`Saved ${syncedIds.length} lead${syncedIds.length === 1 ? "" : "s"} to CRM.`);
            if (result.errors.length > 0) {
              toast.error(result.errors[0]);
            }
            setCrmModalState(null);
          },
          onError: (error) => {
            toast.error(getApiErrorMessage(error, "Could not save leads to CRM."));
          },
        }
      );
    }
  }

  function renderLeadActions(lead: ChatLead, isSynced: boolean, fieldsUpdated: string[]) {
    const profileUrl = primaryProfileUrl(lead);
    const websiteUrl = primaryWebsiteUrl(lead);

    let crmControl: ReactNode;
    if (lead.crm_duplicate) {
      crmControl = (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[8px] font-semibold text-[#92400e]"
          title={lead.crm_duplicate_reason ?? "This company already exists in CRM"}
        >
          <AlertTriangle size={10} />
          Duplicate in CRM
        </span>
      );
    } else if (isSynced) {
      crmControl = (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[#16b37d]/10 px-2 py-0.5 text-[8px] font-semibold text-[#087652]"
          title={
            fieldsUpdated.length > 0
              ? `Updated in CRM: ${fieldsUpdated.join(", ")}`
              : "Already saved in CRM"
          }
        >
          <CircleCheck size={10} />
          {fieldsUpdated.length > 0
            ? `Updated in CRM (${fieldsUpdated.join(", ")})`
            : "In CRM"}
        </span>
      );
    } else {
      crmControl = (
        <button
          type="button"
          disabled={syncLead.isPending || syncBatch.isPending || !canSyncToCrm}
          title={!canSyncToCrm ? crmBlockMessage : undefined}
          onClick={() => setCrmModalState({ mode: "single", lead })}
          className="rounded-full border border-[#09232d]/15 px-2.5 py-0.5 text-[8px] font-semibold text-[#09232d] transition-colors hover:bg-[#09232d]/5 disabled:opacity-60"
        >
          Save to CRM
        </button>
      );
    }

    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open lead profile"
            className="inline-flex items-center gap-1 rounded-full border border-[#09232d]/15 bg-white px-2.5 py-0.5 text-[8px] font-semibold text-[#09232d] transition-colors hover:bg-[#09232d]/5"
          >
            <ExternalLink size={10} className="shrink-0 opacity-80" />
            View Profile
          </a>
        ) : null}
        {websiteUrl ? (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open company website"
            className="inline-flex items-center gap-1 rounded-full border border-[#09232d]/15 bg-white px-2.5 py-0.5 text-[8px] font-semibold text-[#09232d] transition-colors hover:bg-[#09232d]/5"
          >
            <ExternalLink size={10} className="shrink-0 opacity-80" />
            Website
          </a>
        ) : null}
        {onNotRelevant ? (
          <button
            type="button"
            onClick={() => onNotRelevant(lead)}
            className="rounded-full border border-[#09232d]/12 px-2.5 py-0.5 text-[8px] font-semibold text-[#616263] transition-colors hover:bg-[#09232d]/5"
            title="Hide and exclude from the next generate more run"
          >
            Not relevant
          </button>
        ) : null}
        {crmControl}
      </div>
    );
  }

  return (
    <div className="mt-3 w-full">
      {!canSyncToCrm && (
        <p className="mb-2 rounded-[12px] bg-[#fef2f2] px-3 py-2 text-[8px] leading-[11px] text-[#991b1b]">
          {crmBlockMessage}
        </p>
      )}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[9px] font-medium text-[#616263]">
          {unsavedIds.length > 0
            ? `Showing ${visibleLeads.length} of ${leads.length} leads. Save the ones you want in CRM.`
            : `Showing ${visibleLeads.length} of ${leads.length} leads`}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {unsavedIds.length > 0 && (
            <button
              type="button"
              disabled={syncBatch.isPending || syncLead.isPending || !canSyncToCrm}
              title={!canSyncToCrm ? crmBlockMessage : undefined}
              onClick={() => setCrmModalState({ mode: "batch", leadIds: unsavedIds })}
              className="se-primary shrink-0 rounded-full bg-[#09232d] px-3 py-1 text-[8px] font-semibold text-white transition-colors hover:bg-[#09232d]/90 disabled:opacity-60"
            >
              {syncBatch.isPending ? "Saving…" : "Save all"}
            </button>
          )}
          <div className="flex items-center rounded-lg border border-[#09232d]/10 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view"
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`rounded-md p-1 transition-colors ${
                viewMode === "list"
                  ? "bg-[#09232d] text-white"
                  : "text-[#09232d]/50 hover:bg-[#09232d]/5 hover:text-[#09232d]"
              }`}
            >
              <List size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              className={`rounded-md p-1 transition-colors ${
                viewMode === "grid"
                  ? "bg-[#09232d] text-white"
                  : "text-[#09232d]/50 hover:bg-[#09232d]/5 hover:text-[#09232d]"
              }`}
            >
              <LayoutGrid size={13} />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="flex flex-col gap-1.5">
          {visibleLeads.map((lead) => {
            const isSynced = lead.native_crm_saved || Boolean(lead.native_crm_lead_id);
            const fieldsUpdated = lead.crm_fields_updated ?? [];
            const { overall } = leadScoreBreakdown(lead);
            const roleLine = formatLeadRoleLine(lead);
            const contactLine = formatLeadContactLine(lead);
            const entityBadge = leadEntityBadge(lead);

            return (
              <div
                key={lead.id ?? lead.name}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-[#09232d]/10 bg-white px-3 py-2 shadow-sm transition hover:border-[#09232d]/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[10px] font-bold text-[#09232d]">{lead.name}</p>
                    <span className="rounded-full bg-[#09232d]/8 px-1.5 py-0.5 text-[7px] font-semibold text-[#09232d]/70">
                      {entityBadge}
                    </span>
                    <span
                      className="rounded-full bg-[#16b37d]/10 px-1.5 py-0.5 text-[7px] font-bold text-[#087652]"
                      title={
                        lead.icp_relevance_reason
                          ? `Score: ${overall}%. ${lead.icp_relevance_reason}`
                          : "Overall priority score"
                      }
                    >
                      Overall {overall}%
                    </span>
                    {lead.low_confidence && (
                      <span className="text-[7px] font-medium text-[#b45309]">Lower confidence</span>
                    )}
                  </div>
                  {lead.icp_relevance_reason && (
                    <p className="mt-0.5 text-[8px] leading-[11px] text-[#616263]">
                      {lead.icp_relevance_reason}
                    </p>
                  )}

                  {(roleLine || contactLine || lead.email || lead.phone || lead.contact_status) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8px]">
                      {roleLine && (
                        <span className="truncate max-w-[300px] font-medium text-[#09232d]/70">
                          {roleLine}
                        </span>
                      )}
                      {!roleLine && contactLine && (
                        <span className="truncate max-w-[300px] font-medium text-[#09232d]/70">
                          {contactLine}
                        </span>
                      )}
                      {leadLocationCaption(lead) && (
                        <span className="text-[#09232d]/50">· {leadLocationCaption(lead)}</span>
                      )}
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="inline-flex items-center gap-0.5 font-medium text-[#087652] underline"
                          title={lead.email}
                        >
                          <Mail size={8} className="shrink-0 opacity-80" />
                          <span className="truncate max-w-[150px]">{lead.email}</span>
                        </a>
                      )}
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="inline-flex items-center gap-0.5 font-medium text-[#087652] underline"
                          title={lead.phone}
                        >
                          <Phone size={8} className="shrink-0 opacity-80" />
                          <span>{lead.phone}</span>
                        </a>
                      )}
                      {!lead.email && !lead.phone && lead.contact_status === "not_attempted" && (
                        <span className="font-medium text-[#09232d]/45">Looking up…</span>
                      )}
                      {!lead.email && !lead.phone && lead.contact_status === "not_found" && (
                        <span className="font-medium text-[#09232d]/45">Not published</span>
                      )}
                      {lead.contact_enrichment_tier && lead.contact_enrichment_tier !== "seed" && (
                        <span
                          className="inline-flex w-fit rounded-full bg-[#eef6f2] px-1 py-0.2 text-[6.5px] font-semibold text-[#087652]"
                          title={
                            lead.contact_enrichment_provider
                              ? `Contact via ${lead.contact_enrichment_provider}`
                              : "Contact enrichment source"
                          }
                        >
                          {lead.contact_enrichment_tier === "tier1"
                            ? "Web"
                            : lead.contact_enrichment_tier === "tier2"
                              ? "Enriched"
                              : "Verified"}
                        </span>
                      )}
                    </div>
                  )}

                  {lead.summary && (
                    <p className="mt-0.5 line-clamp-1 text-[8px] leading-[11px] text-[#09232d]/65">
                      {lead.summary}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {renderLeadActions(lead, isSynced, fieldsUpdated)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {visibleLeads.map((lead) => {
            const isSynced = lead.native_crm_saved || Boolean(lead.native_crm_lead_id);
            const fieldsUpdated = lead.crm_fields_updated ?? [];
            const { overall } = leadScoreBreakdown(lead);
            const roleLine = formatLeadRoleLine(lead);
            const contactLine = formatLeadContactLine(lead);
            const entityBadge = leadEntityBadge(lead);

            return (
              <div
                key={lead.id ?? lead.name}
                className="flex flex-col justify-between rounded-[14px] border border-[#09232d]/10 bg-white px-3 py-2.5 shadow-sm transition hover:border-[#09232d]/20"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <p className="truncate text-[10px] font-bold text-[#09232d]">{lead.name}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-[#09232d]/8 px-1.5 py-0.5 text-[7px] font-semibold text-[#09232d]/70">
                        {entityBadge}
                      </span>
                      <span
                        className="rounded-full bg-[#16b37d]/10 px-1.5 py-0.5 text-[7px] font-bold text-[#087652]"
                        title={
                          lead.icp_relevance_reason
                            ? `Score: ${overall}%. ${lead.icp_relevance_reason}`
                            : "Overall priority score"
                        }
                      >
                        Overall {overall}%
                      </span>
                    </div>
                  </div>
                  {roleLine && (
                    <p className="mt-1 line-clamp-1 text-[8px] font-medium text-[#09232d]/70">{roleLine}</p>
                  )}
                  {contactLine && (
                    <p className="mt-0.5 line-clamp-1 text-[8px] font-medium text-[#09232d]/65">{contactLine}</p>
                  )}
                  {leadLocationCaption(lead) && (
                    <p className="mt-0.5 text-[8px] text-[#09232d]/55">{leadLocationCaption(lead)}</p>
                  )}
                  {(lead.email || lead.phone) && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="inline-flex max-w-full items-center gap-1 truncate text-[8px] font-medium text-[#087652] underline"
                          title={lead.email}
                        >
                          <Mail size={9} className="shrink-0 opacity-80" />
                          <span className="truncate">{lead.email}</span>
                        </a>
                      )}
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="inline-flex max-w-full items-center gap-1 truncate text-[8px] font-medium text-[#087652] underline"
                          title={lead.phone}
                        >
                          <Phone size={9} className="shrink-0 opacity-80" />
                          <span className="truncate">{lead.phone}</span>
                        </a>
                      )}
                      {lead.contact_enrichment_tier && lead.contact_enrichment_tier !== "seed" && (
                        <span
                          className="mt-0.5 inline-flex w-fit rounded-full bg-[#eef6f2] px-1.5 py-0.5 text-[7px] font-semibold text-[#087652]"
                          title={
                            lead.contact_enrichment_provider
                              ? `Contact via ${lead.contact_enrichment_provider}`
                              : "Contact enrichment source"
                          }
                        >
                          {lead.contact_enrichment_tier === "tier1"
                            ? "Contact from web"
                            : lead.contact_enrichment_tier === "tier2"
                              ? "Contact enriched"
                              : "Contact verified"}
                        </span>
                      )}
                    </div>
                  )}
                  {lead.contact_ready === false && (
                    <p className="mt-1 text-[7px] font-medium text-[#616263]">No direct contact yet</p>
                  )}
                  {lead.contact_ready !== false && !lead.email && !lead.phone && (
                    <p className="mt-1 text-[7px] font-medium text-[#616263]">
                      Profile found. Email or phone still missing
                    </p>
                  )}
                  {lead.summary && (
                    <p className="mt-1 line-clamp-2 text-[8px] leading-[10px] text-[#09232d]/65">{lead.summary}</p>
                  )}
                  {lead.icp_relevance_reason && (
                    <p className="mt-1 line-clamp-2 text-[7px] italic leading-[9px] text-[#616263]">
                      {lead.icp_relevance_reason}
                    </p>
                  )}
                  {lead.source && (
                    <p className="mt-1 text-[8px] text-[#09232d]/50">{lead.source}</p>
                  )}
                  {lead.low_confidence && (
                    <p className="mt-1 text-[7px] font-medium text-[#b45309]">Lower confidence match</p>
                  )}
                </div>
                <div className="mt-2.5 border-t border-[#09232d]/5 pt-2">
                  {renderLeadActions(lead, isSynced, fieldsUpdated)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={() => setDisplayCount((prev) => prev + LEADS_PER_PAGE)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-[#09232d]/15 bg-white px-3 py-2 text-[10px] font-semibold text-[#09232d] transition-colors hover:bg-[#f8f8f8]"
        >
          See {Math.min(LEADS_PER_PAGE, remaining)} more lead
          {Math.min(LEADS_PER_PAGE, remaining) === 1 ? "" : "s"}
          <ChevronDown size={14} className="opacity-70" />
        </button>
      )}
      <AddToCrmPipelineModal
        key={
          crmModalState?.mode === "single"
            ? `crm-lead-${crmModalState.lead.id}`
            : crmModalState?.mode === "batch"
              ? `crm-batch-${crmModalState.leadIds.join("-")}`
              : "smart-lead-crm-modal"
        }
        isOpen={crmModalState != null}
        onClose={() => setCrmModalState(null)}
        prospectName={
          crmModalState?.mode === "single"
            ? crmModalState.lead.name
            : crmModalState?.mode === "batch"
              ? `${crmModalState.leadIds.length} leads`
              : null
        }
        pipelines={pipelines}
        isLoading={pipelinesLoading} isError={pipelinesError} onRetry={() => { void retryPipelines(); }}
        isConfirming={syncLead.isPending || syncBatch.isPending}
        onConfirm={handleConfirmCrmSave}
      />
    </div>
  );
}

function ChatOutreachReviewCard({
  draft,
  onReview,
}: {
  draft: OutreachDraft;
  onReview: () => void;
}) {
  if (draft.sent) {
    return (
      <div className="mt-2 max-w-[420px] rounded-[14px] border border-[#cdeee0] bg-[#f0fdf7] px-3.5 py-2.5">
        <p className="text-[9px] font-semibold text-[#087652]">✓ Outreach sent</p>
      </div>
    );
  }

  const leadNames = draft.leads?.map((lead) => lead.name).filter(Boolean).slice(0, 2).join(", ");
  const preview = draft.body.trim().slice(0, 120);

  return (
    <div className="mt-2 max-w-[420px] rounded-[14px] border border-[#dbe7ff] bg-[#f5f8ff] px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-bold leading-[12px] text-[#09232d]">
            {draft.channel === "whatsapp" ? "WhatsApp draft ready" : "Email draft ready"}
          </p>
          {leadNames && (
            <p className="mt-0.5 text-[8px] text-[#616263]">For {leadNames}</p>
          )}
          {preview && (
            <p className="mt-1 line-clamp-2 text-[8px] leading-[11px] text-[#616263]">{preview}{draft.body.length > 120 ? "…" : ""}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onReview}
          className="se-primary h-7 shrink-0 rounded-[8px] bg-[#09232d] px-3 text-[9px] font-semibold text-white transition hover:bg-[#0f3340]"
        >
          Review &amp; Send
        </button>
      </div>
    </div>
  );
}

function buildChatOutreachPreview(
  messageId: number,
  draft: OutreachDraft
): OutreachPreviewState {
  const activityId = draft.activity_id ?? draft.activity_ids?.[0] ?? null;
  const lead = draft.leads?.find((item) => Boolean(item.email)) ?? draft.leads?.[0];
  const leadNames = draft.leads?.map((item) => item.name).filter(Boolean).slice(0, 2).join(", ");
  const normalized = normalizeOutreachSubjectBody(draft.body, draft.subject);

  return {
    activityId,
    channel: draft.channel === "whatsapp" ? "whatsapp" : "email",
    subject: normalized.subject,
    body: normalized.body,
    toEmail: draft.to_email ?? lead?.email ?? "",
    contextLabel: leadNames ? `For ${leadNames}` : undefined,
    alignmentNote: draft.icp_alignment_note,
    messageId,
  };
}

function IcpConfirmationCard({
  icpProfiles,
  isLoading,
  isSwitching,
  switchingId,
  isConfirming,
  entityMode,
  onEntityModeChange,
  prospectCount,
  onProspectCountChange,
  onSelectIcp,
  onConfirm,
  onManageIcps,
}: {
  icpProfiles: IcpProfile[];
  isLoading: boolean;
  isSwitching: boolean;
  switchingId?: string;
  isConfirming: boolean;
  entityMode: GenerateEntityMode;
  onEntityModeChange: (mode: GenerateEntityMode) => void;
  prospectCount: GenerateProspectCount;
  onProspectCountChange: (count: GenerateProspectCount) => void;
  onSelectIcp: (id: string) => void;
  onConfirm: () => void;
  onManageIcps: () => void;
}) {
  const activeIcp = icpProfiles.find((profile) => profile.isActive);
  const searchBrief = activeIcp
    ? composeIcpSearchBrief({
        customPrompt: activeIcp.config.customPrompt,
        description: activeIcp.description || activeIcp.config.description,
        industries: activeIcp.config.industries,
      })
    : "";
  const searchQueries = activeIcp
    ? composeIcpSearchQueries({
        customPrompt: activeIcp.config.customPrompt,
        description: activeIcp.description || activeIcp.config.description,
        industries: activeIcp.config.industries,
      })
    : [];
  const qualifySummary = activeIcp
    ? composeIcpQualifySummary({
        industries: activeIcp.config.industries,
        territories: activeIcp.config.territories,
        companySizes: activeIcp.config.companySizes,
        revenueRanges: activeIcp.config.revenueRanges,
      })
    : "";
  const geoCaption = activeIcp
    ? composeSearchGeoCaption(activeIcp.config.territories)
    : "";
  const filterChips = activeIcp
    ? [
        ...(activeIcp.config.industries ?? []).slice(0, 4),
        ...(activeIcp.config.territories ?? []).slice(0, 3),
        ...(activeIcp.config.companySizes ?? []).slice(0, 2),
      ].filter(Boolean)
    : [];

  return (
    <div className="max-w-[480px] rounded-[18px] bg-[#f8f8f8] px-4 py-3 text-[#09232d] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.04)]">
      <p className="text-[11px] font-semibold">Before I generate prospects…</p>
      <p className="mt-1 text-[10px] leading-[14px] text-[#09232d]/70">
        {activeIcp ? (
          <>
            I&apos;ll use the <strong>{activeIcp.name}</strong> ICP build. Confirm to proceed, or pick a different
            one below.
          </>
        ) : (
          "No ICP build is active yet. Select one below to continue."
        )}
      </p>

      {activeIcp && (
        <div className="mt-2.5 space-y-2 rounded-[14px] border border-[#09232d]/08 bg-white px-3 py-2.5">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#09232d]/45">
              We will search
            </p>
            {searchQueries.length > 1 ? (
              <ul className="mt-0.5 space-y-0.5">
                {searchQueries.map((q) => (
                  <li key={q} className="text-[10px] leading-[14px] text-[#09232d]/85">
                    “{q}”
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-[10px] leading-[14px] text-[#09232d]/85">
                {searchQueries[0] || searchBrief}
              </p>
            )}
            {geoCaption ? (
              <p className="mt-1 text-[10px] leading-[14px] text-[#09232d]/70">{geoCaption}</p>
            ) : null}
            <p className="mt-1 text-[9px] leading-[13px] text-[#09232d]/50">
              Each selected country is searched. Other countries are excluded. Unconfirmed locations are marked.
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#09232d]/45">Mode</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(
                [
                  ["both", "Both"],
                  ["companies", "Companies"],
                  ["people", "People"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onEntityModeChange(value)}
                  className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold transition ${
                    entityMode === value
                      ? "bg-[#09232d] text-white"
                      : "border border-[#d7d7d7] bg-[#f8f8f8] text-[#09232d]/75 hover:bg-[#09232d]/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[9px] text-[#09232d]/55">
              Default is accounts + people. Change only if you want one entity type.
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#09232d]/45">Count</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {([12, 25, 40] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onProspectCountChange(value)}
                  className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold transition ${
                    prospectCount === value
                      ? "bg-[#09232d] text-white"
                      : "border border-[#d7d7d7] bg-[#f8f8f8] text-[#09232d]/75 hover:bg-[#09232d]/5"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[9px] text-[#09232d]/55">
              First page size. Use Generate more for leftover matches.
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#09232d]/45">
              Then qualify with
            </p>
            {filterChips.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {filterChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-[#d7d7d7] bg-[#f8f8f8] px-2 py-0.5 text-[9px] font-medium text-[#09232d]/75"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-0.5 text-[10px] text-[#09232d]/55">{qualifySummary}</p>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="mt-2 text-[10px] text-[#09232d]/50">Loading ICP builds…</p>
      ) : icpProfiles.length === 0 ? (
        <p className="mt-2 text-[10px] text-[#09232d]/50">No ICP builds yet. Create one to continue.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {icpProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              disabled={isSwitching}
              onClick={() => onSelectIcp(profile.id)}
              className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold transition disabled:opacity-60 ${
                profile.isActive
                  ? "border-[#09232d] bg-[#09232d] text-white"
                  : "border-[#d7d7d7] bg-white text-[#09232d] hover:bg-gray-100"
              }`}
            >
              {isSwitching && switchingId === profile.id ? "Switching…" : profile.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!activeIcp || isConfirming}
          className="se-primary h-7 rounded-full bg-[#09232d] px-3 text-[9px] font-semibold text-white transition disabled:opacity-50"
        >
          {isConfirming ? "Generating…" : "Confirm & Generate"}
        </button>
        <button
          type="button"
          onClick={onManageIcps}
          className="text-[9px] font-semibold text-[#09232d]/60 underline underline-offset-2 hover:text-[#09232d]"
        >
          Manage ICP Builds
        </button>
      </div>
    </div>
  );
}

function ChatWorkspace({
  expanded,
  onToggleExpanded,
  onOpenIcpBuilder,
  onOpenOutreachSettings,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenIcpBuilder: (opts?: { tightenProfileId?: string }) => void;
  onOpenOutreachSettings?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: activeProfile } = useActiveIcpProfile();
  const activeIcpId = activeProfile?.id;
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [selectedIntent, setSelectedIntent] = useState<ChatIntent>("freeform");
  const [isIcpMenuOpen, setIsIcpMenuOpen] = useState(false);
  const [usage, setUsage] = useState<SearchUsage>(() => readSearchUsage());
  const [pendingGenerateRequest, setPendingGenerateRequest] = useState<{ prompt: string } | null>(null);
  const [generateEntityMode, setGenerateEntityMode] = useState<GenerateEntityMode>("both");
  const [generateProspectCount, setGenerateProspectCount] = useState<GenerateProspectCount>(12);
  const [isSyntheticThinking, setIsSyntheticThinking] = useState(false);
  const [outreachPreview, setOutreachPreview] = useState<OutreachPreviewState | null>(null);
  const [icpMenuPosition, setIcpMenuPosition] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<number[]>([]);
  const nextMessageIdRef = useRef(2);
  const pendingUserMessageIdRef = useRef<number | null>(null);
  function nextMessageId() {
    return nextMessageIdRef.current++;
  }
  const [backgroundRunIds, setBackgroundRunIds] = useState<Set<number>>(new Set());
  const icpMenuRef = useRef<HTMLDivElement>(null);
  const icpTriggerRef = useRef<HTMLButtonElement>(null);

  const { data: icpProfiles = [], isLoading: isIcpProfilesLoading } = useIcpProfiles();
  const { data: chatHistory, isLoading: isHistoryLoading } = useChatHistory(activeIcpId);
  const clearChatHistory = useClearChatHistory(activeIcpId);

  const activateIcpProfile = useActivateIcpProfile({
    onSuccess: (profile) => toast.success(`Switched active ICP to "${profile.name}"`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to switch ICP build.")),
  });

  useEffect(() => {
    if (!activeIcpId || isHistoryLoading) return;

    /* eslint-disable react-hooks/set-state-in-effect -- hydrate chat from query result */
    if (!chatHistory || chatHistory.messages.length === 0) {
      setMessages(initialMessages);
      nextMessageIdRef.current = 2;

      return;
    }

    setMessages(mapApiMessagesToUi(chatHistory.messages));
    nextMessageIdRef.current = chatHistory.messages.length + 2;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeIcpId, chatHistory, isHistoryLoading]);

  const hasPendingDiscovery = useMemo(
    () => chatHistory?.messages.some((message) => Boolean(message.meta?.pending)) ?? false,
    [chatHistory]
  );

  usePendingChatDiscovery(activeIcpId, chatHistory?.messages, ({ intent }) => {
    toast.success(
      intent === "quick_research" ? "Research results are ready." : "Lead results are ready."
    );
  });

  useLayoutEffect(() => {
    if (!isIcpMenuOpen || !icpTriggerRef.current) return;
    const rect = icpTriggerRef.current.getBoundingClientRect();
    setIcpMenuPosition({ top: rect.bottom + 8, left: rect.left, width: Math.max(rect.width, 260) });
  }, [isIcpMenuOpen]);

  useEffect(() => {
    if (!isIcpMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        icpMenuRef.current &&
        !icpMenuRef.current.contains(target) &&
        icpTriggerRef.current &&
        !icpTriggerRef.current.contains(target)
      ) {
        setIsIcpMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isIcpMenuOpen]);

  const sendMessage = useSendChatMessage(activeIcpId, {
    onSuccess: ({ assistant_message, pending }) => {
      const pendingUserId = pendingUserMessageIdRef.current;
      pendingUserMessageIdRef.current = null;
      if (pendingUserId != null) {
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingUserId ? { ...message, failed: false } : message
          )
        );
      }

      if (!assistant_message) return;

      setMessages((current) => {
        const alreadyPresent = current.some(
          (message) =>
            message.role === "assistant" &&
            message.body === assistant_message.body &&
            (pending ? true : Boolean(message.leads?.length))
        );
        if (alreadyPresent) return current;

        const createdMessageId = nextMessageId();
        const nextMessages = [
          ...current,
          {
            id: createdMessageId,
            role: "assistant" as const,
            body: assistant_message.body,
            intent: assistant_message.intent,
            leads: assistant_message.leads ?? undefined,
            meta: assistant_message.meta ?? undefined,
          },
        ];

        if (
          assistant_message.intent === "create_outreach" &&
          assistant_message.meta?.outreach
        ) {
          const draft = assistant_message.meta.outreach as OutreachDraft;
          if (!draft.sent) {
            // Defer so we don't update another component during this setState.
            queueMicrotask(() => {
              setOutreachPreview(buildChatOutreachPreview(createdMessageId, draft));
            });
          }
        }

        return nextMessages;
      });
    },
    onError: (error) => {
      const pendingUserId = pendingUserMessageIdRef.current;
      pendingUserMessageIdRef.current = null;
      if (pendingUserId != null) {
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingUserId ? { ...message, failed: true } : message
          )
        );
      } else {
        setMessages((current) => {
          for (let i = current.length - 1; i >= 0; i -= 1) {
            if (current[i].role === "user") {
              return current.map((message, index) =>
                index === i ? { ...message, failed: true } : message
              );
            }
          }
          return current;
        });
      }
      toast.error(
        isMissingActiveIcp(error)
          ? "Select an active ICP profile first. Open ICP Builder to create or activate one."
          : getApiErrorMessage(error, "Sales Engine couldn't process that request.")
      );
    },
  });

  function handleDetachToBackground() {
    const runId = sendMessage.detachToBackground();
    if (typeof runId === "number") {
      setBackgroundRunIds((current) => new Set(current).add(runId));
    }
    toast.info("Processing in background. You can keep chatting, and we'll notify you when results are ready.");
  }

  async function handleStopSearching() {
    await sendMessage.stopSearching();
    toast.message("Lead search stopped.");
  }

  function handleContinueWaiting() {
    sendMessage.continueWaiting();
    toast.message("Still searching... hang tight. You can stop anytime.");
  }

  const isThinking = isForegroundChatWaiting(sendMessage.isPending, sendMessage.waitMode) || isSyntheticThinking;
  const showWelcomeMessage = messages.length > 0 && messages[0]?.id === 1;

  function selectIntent(intent: ActionIntent) {
    setSelectedIntent((current) => (current === intent ? "freeform" : intent));
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearIntent() {
    setSelectedIntent("freeform");
    inputRef.current?.focus();
  }

  function handleSend(prompt: string, intent: ChatIntent = selectedIntent) {
    const trimmed = prompt.trim();
    if (!trimmed || isThinking) return;

    // Item 3: token/search usage lookup — answered locally, no real request sent.
    if (USAGE_QUESTION_PATTERN.test(trimmed)) {
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: "user", body: trimmed, intent },
      ]);
      setDraft("");
      setIsSyntheticThinking(true);
      const timer = window.setTimeout(() => {
        setIsSyntheticThinking(false);
        const remaining = Math.max(usage.limit - usage.used, 0);
        setMessages((current) => [
          ...current,
          {
            id: nextMessageId(),
            role: "assistant",
            body: `You've used ${usage.used} of ${usage.limit} searches this billing cycle. ${remaining} remaining.`,
          },
        ]);
      }, 900);
      timersRef.current.push(timer);
      return;
    }

    // Vague generate asks → ICP confirm card. Specific niche asks → search user text immediately.
    if (shouldShowIcpConfirmCard(intent, trimmed)) {
      const { targetCount } = resolveGenerateLeadsPrompt(trimmed);
      setGenerateEntityMode("both");
      setGenerateProspectCount(
        targetCount === 25 || targetCount === 40 ? targetCount : 12
      );
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "user",
          body: trimmed,
          intent: "generate_leads",
          ...(targetCount != null ? { targetCount } : {}),
        },
        { id: nextMessageId(), role: "assistant", body: "", kind: "confirm-icp" },
      ]);
      setDraft("");
      setPendingGenerateRequest({ prompt: trimmed });
      return;
    }

    if (intent === "generate_leads") {
      const { apiBody, targetCount } = resolveGenerateLeadsPrompt(trimmed);
      const userMessageId = nextMessageId();
      pendingUserMessageIdRef.current = userMessageId;
      setMessages((current) => [
        ...current,
        {
          id: userMessageId,
          role: "user",
          body: trimmed,
          intent,
          searchCaption: trimmed,
          entityMode: "both",
          ...(targetCount != null ? { targetCount } : {}),
        },
      ]);
      setDraft("");
      setSelectedIntent("freeform");
      setUsage((current) => {
        const next = { used: current.used + 1, limit: current.limit };
        writeSearchUsage(next);
        return next;
      });
      sendMessage.mutate({ body: apiBody, intent: "generate_leads" });
      return;
    }

    const userMessageId = nextMessageId();
    pendingUserMessageIdRef.current = userMessageId;
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", body: trimmed, intent },
    ]);
    setDraft("");
    sendMessage.mutate({ body: trimmed, intent });
  }

  function handleRetryFailedPrompt(message: ChatMessage) {
    if (!message.failed || isThinking) return;
    const intent = message.intent ?? "freeform";
    pendingUserMessageIdRef.current = message.id;
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, failed: false } : item))
    );
    const body =
      intent === "generate_leads"
        ? resolveGenerateLeadsPrompt(message.body).apiBody
        : message.body;
    sendMessage.mutate({ body, intent });
  }

  function confirmGenerateLeads() {
    if (isThinking || !pendingGenerateRequest) return;
    const activeIcp = icpProfiles.find((profile) => profile.isActive);
    if (!activeIcp) {
      toast.error("Select an ICP profile first.");
      return;
    }

    const { apiBody, targetCount } = resolveGenerateLeadsPrompt(pendingGenerateRequest.prompt);
    const countedBody = withProspectCountCue(apiBody, generateProspectCount);
    const modeAwareBody = withEntityModeCue(countedBody, generateEntityMode);
    const searchBrief = composeIcpSearchBrief({
      customPrompt: activeIcp.config.customPrompt,
      description: activeIcp.description || activeIcp.config.description,
      industries: activeIcp.config.industries,
    });
    const largeRequestHint =
      targetCount != null && targetCount >= 50
        ? " Searching multiple sources. This may take 30 to 60 seconds."
        : "";

    let lastUserId: number | null = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        lastUserId = messages[i].id;
        break;
      }
    }
    pendingUserMessageIdRef.current = lastUserId;

    setMessages((current) =>
      current.map((message) => {
        if (lastUserId != null && message.id === lastUserId) {
          return {
            ...message,
            entityMode: generateEntityMode,
            searchCaption: searchBrief,
          };
        }
        if (message.kind === "confirm-icp") {
          return {
            ...message,
            kind: undefined,
            body: `Using **${activeIcp.name}**. Generating prospects…${largeRequestHint}`,
            intent: "generate_leads" as const,
          };
        }
        return message;
      })
    );
    setPendingGenerateRequest(null);
    // Clear the intent chip so a follow-up reply (e.g. "yes") is treated as freeform
    // instead of re-triggering the ICP confirmation gate.
    setSelectedIntent("freeform");
    setUsage((current) => {
      const next = { used: current.used + 1, limit: current.limit };
      writeSearchUsage(next);
      return next;
    });

    sendMessage.mutate({ body: modeAwareBody, intent: "generate_leads" });
  }

  function scrollTranscriptToBottom() {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => {
    if (messages.length === 1 && !isThinking) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTranscriptToBottom();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isThinking, sendMessage.processingState]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    },
    []
  );


  return (
    <>
    <section
      className={`se-surface relative flex flex-col overflow-hidden rounded-[35px] bg-white shadow-[0_8px_6px_rgba(0,0,0,0.15),0_4px_2px_rgba(0,0,0,0.3)] transition-[height] duration-300 ${
        expanded ? "h-[calc(100vh-112px)] min-h-[720px]" : "h-[600px]"
      }`}
    >
      <header className="mx-6 mt-5 flex h-[48px] shrink-0 items-center justify-between rounded-[24px] bg-[#09232d] px-6 text-white shadow-[0_6px_6px_rgba(0,0,0,0.18)] max-sm:mx-4">
        <button
          ref={icpTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isIcpMenuOpen}
          onClick={() => setIsIcpMenuOpen((current) => !current)}
          className="flex items-center gap-3 rounded-full px-2 py-1 transition hover:bg-white/10"
        >
          <Sparkles size={18} className="shrink-0" />
          <span className="max-w-[220px] truncate text-[21px] font-semibold">
            {icpProfiles.find((profile) => profile.isActive)?.name ?? "Sales Engine"}
          </span>
          <ChevronDown
            size={14}
            className={`text-white/50 transition-transform ${isIcpMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          aria-label={expanded ? "Minimize Sales Engine" : "Expand Sales Engine"}
          onClick={onToggleExpanded}
          className="grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          {expanded ? <Minimize2 size={18} /> : <Expand size={18} />}
        </button>
      </header>

      {isIcpMenuOpen &&
        icpMenuPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={icpMenuRef}
            role="menu"
            style={{ top: icpMenuPosition.top, left: icpMenuPosition.left, width: icpMenuPosition.width }}
            className="fixed z-50 max-h-[320px] overflow-y-auto rounded-[16px] border border-black/5 bg-white p-1.5 text-[#09232d] shadow-[0_16px_32px_rgba(9,35,45,0.18)]"
          >
            <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              ICP Builds
            </p>
            {isIcpProfilesLoading && (
              <p className="px-2.5 py-2 text-[12px] text-gray-400">Loading…</p>
            )}
            {!isIcpProfilesLoading && icpProfiles.length === 0 && (
              <p className="px-2.5 py-2 text-[12px] text-gray-400">No ICP builds yet.</p>
            )}
            {icpProfiles.map((profile) => {
              const isSwitchingToThis = activateIcpProfile.isPending && activateIcpProfile.variables === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={profile.isActive}
                  disabled={activateIcpProfile.isPending}
                  onClick={() => {
                    if (profile.isActive) {
                      setIsIcpMenuOpen(false);
                      return;
                    }
                    activateIcpProfile.mutate(profile.id, { onSuccess: () => setIsIcpMenuOpen(false) });
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] font-medium transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                    profile.isActive ? "bg-gray-100" : ""
                  }`}
                >
                  <span className="truncate">{profile.name}</span>
                  {isSwitchingToThis ? (
                    <Loader2 size={14} className="shrink-0 animate-spin text-gray-400" />
                  ) : (
                    profile.isActive && <Check size={14} className="shrink-0 text-[#16b37d]" />
                  )}
                </button>
              );
            })}
            <div className="mt-1 border-t border-gray-100 pt-1">
              <button
                type="button"
                disabled={!activeIcpId || clearChatHistory.isPending}
                onClick={() => {
                  clearChatHistory.mutate(undefined, {
                    onSuccess: () => {
                      setMessages(initialMessages);
                      nextMessageIdRef.current = 2;
                      setIsIcpMenuOpen(false);
                      toast.success("Chat history cleared for this ICP.");
                    },
                    onError: (error) =>
                      toast.error(getApiErrorMessage(error, "Could not clear chat history.")),
                  });
                }}
                className="w-full rounded-[10px] px-2.5 py-2 text-left text-[12px] font-medium text-[#616263] transition hover:bg-gray-100 disabled:opacity-60"
              >
                Clear chat history
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsIcpMenuOpen(false);
                  onOpenIcpBuilder();
                }}
                className="w-full rounded-[10px] px-2.5 py-2 text-left text-[12px] font-semibold text-[#09232d] transition hover:bg-gray-100"
              >
                Manage ICP Builds
              </button>
            </div>
          </div>,
          document.body
        )}

      <div
        ref={transcriptRef}
        className={`mx-auto mt-5 min-h-0 w-full flex-1 overflow-y-auto scroll-smooth px-6 pb-4 text-[#09232d] max-sm:px-4 ${
          expanded ? "max-w-[1100px]" : "max-w-[824px]"
        }`}
      >
        <div className="space-y-4">
          {messages.map((message, index) => {
            const pendingRunId =
              typeof message.meta?.discovery_run_id === "number"
                ? message.meta.discovery_run_id
                : null;
            const isPendingMessage = Boolean(message.meta?.pending);
            const isBackgroundPending =
              isPendingMessage &&
              !isThinking &&
              (pendingRunId == null ||
                backgroundRunIds.has(pendingRunId) ||
                sendMessage.waitMode === "background" ||
                hasPendingDiscovery);

            return (
            <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[78%]" : "max-w-full"}>
              {message.role === "user" &&
                message.intent &&
                message.intent !== "freeform" &&
                message.intent in INTENT_MODE_CONFIG && (
                <div className="mb-1.5 flex justify-end">
                  <IntentModeChip intent={message.intent as ActionIntent} compact />
                </div>
              )}
              {message.role === "user" &&
                (message.intent === "generate_leads" || message.intent === "generate_more_leads") &&
                (message.searchCaption || message.entityMode) && (
                  <p className="mb-1.5 text-right text-[9px] leading-[12px] text-[#09232d]/55">
                    {message.searchCaption
                      ? `Searching: ${message.searchCaption}`
                      : "Searching from your ICP"}
                    {" · "}
                    Mode: {entityModeLabel(message.entityMode ?? "both")}
                  </p>
                )}
              {isBackgroundPending && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#09232d]/8 px-2 py-0.5 text-[8px] font-semibold text-[#09232d]/70">
                    <Loader2 size={10} className="animate-spin" />
                    {typeof message.meta?.progress_message === "string" && message.meta.progress_message
                      ? message.meta.progress_message
                      : message.meta?.awaiting_user_choice
                      ? "Still searching. Timeout is a last resort"
                      : "Processing in background"}
                  </span>
                  {typeof pendingRunId === "number" && Boolean(message.meta?.awaiting_user_choice) && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await cancelDiscoveryRun(pendingRunId);
                          toast.message("Lead search stopped.");
                          queryClient.invalidateQueries({
                            queryKey: SALES_ENGINE_CHAT_KEYS.history(activeIcpId),
                          });
                        } catch {
                          toast.error("Couldn’t stop the search. Try again.");
                        }
                      }}
                      className="rounded-[10px] border border-[#09232d]/15 bg-white px-2.5 py-0.5 text-[8px] font-semibold text-[#09232d] transition hover:bg-[#09232d]/5"
                    >
                      Stop searching
                    </button>
                  )}
                </div>
              )}
              {message.kind === "confirm-icp" ? (
                <IcpConfirmationCard
                  icpProfiles={icpProfiles}
                  isLoading={isIcpProfilesLoading}
                  isSwitching={activateIcpProfile.isPending}
                  switchingId={activateIcpProfile.variables}
                  isConfirming={isThinking}
                  entityMode={generateEntityMode}
                  onEntityModeChange={setGenerateEntityMode}
                  prospectCount={generateProspectCount}
                  onProspectCountChange={setGenerateProspectCount}
                  onSelectIcp={(id) => activateIcpProfile.mutate(id)}
                  onConfirm={confirmGenerateLeads}
                  onManageIcps={() => onOpenIcpBuilder()}
                />
              ) : (
                <div
                  className={
                    message.role === "user"
                      ? `rounded-[18px] bg-[#09232d] px-4 py-3 text-[12px] leading-[16px] text-white ${
                          message.failed ? "opacity-80 ring-1 ring-red-400/40" : ""
                        }`
                      : showWelcomeMessage && index === 0
                        ? "text-[12px] leading-[15px] text-[#09232d]"
                        : "rounded-[18px] bg-[#f8f8f8] px-4 py-3 text-[12px] leading-[16px] text-[#09232d]"
                  }
                >
                  <ChatMessageBody
                    content={message.body}
                    variant={message.role === "user" ? "user" : showWelcomeMessage && index === 0 ? "welcome" : "assistant"}
                  />
                </div>
              )}
              {message.role === "user" && message.failed && (
                <div className="mt-1.5 flex items-center justify-end gap-1.5">
                  <span className="text-[9px] font-medium text-[#9d9d9d]">Couldn’t send</span>
                  <button
                    type="button"
                    aria-label="Retry prompt"
                    title="Retry"
                    disabled={isThinking}
                    onClick={() => handleRetryFailedPrompt(message)}
                    className="grid size-6 place-items-center rounded-full text-[#616263] transition hover:bg-[#09232d]/8 hover:text-[#09232d] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              )}
              {message.role === "assistant" &&
                message.intent === "quick_research" &&
                !isPendingMessage && (
                  <ResearchSourcesList sources={researchSourcesFromMeta(message.meta)} />
                )}
              {message.leads && message.leads.length > 0 && (
                <LeadInlineResults
                  leads={message.leads}
                  onLeadsChange={(leads) => {
                    setMessages((current) =>
                      current.map((item) => (item.id === message.id ? { ...item, leads } : item))
                    );
                  }}
                  onNotRelevant={(lead) => {
                    setMessages((current) =>
                      current.map((item) =>
                        item.id === message.id
                          ? {
                              ...item,
                              leads: (item.leads ?? []).filter((entry) => entry.id !== lead.id),
                            }
                          : item
                      )
                    );
                    toast.message(`Hidden “${lead.name}”. Generate more already skips prior lead names.`);
                  }}
                />
              )}
              {message.role === "assistant" &&
                (message.intent === "generate_leads" || message.intent === "generate_more_leads") &&
                !isPendingMessage &&
                (() => {
                  const degraded = message.meta?.retrieval_degraded as
                    | { web_search?: boolean; reason?: string }
                    | undefined;
                  if (!degraded?.web_search) return null;
                  const label =
                    degraded.reason === "credits_exhausted"
                      ? "Web search is out of credits"
                      : degraded.reason === "unauthorized"
                        ? "Web search key was rejected"
                        : degraded.reason === "rate_limited"
                          ? "Web search hit its rate limit"
                          : "Web search failed on every query";
                  return (
                    <div className="mt-2 rounded-[14px] border border-red-200/80 bg-red-50/70 px-3 py-2">
                      <p className="text-[10px] font-semibold text-[#09232d]">{label}</p>
                      <p className="mt-0.5 text-[10px] leading-[14px] text-[#09232d]/75">
                        These results came from the company database only, so location and
                        search-brief fit are unverified.
                      </p>
                    </div>
                  );
                })()}
              {message.role === "assistant" &&
                (message.intent === "generate_leads" || message.intent === "generate_more_leads") &&
                !isPendingMessage &&
                (() => {
                  const tighten = message.meta?.icp_tighten as
                    | { suggested?: boolean; reason?: string }
                    | undefined;
                  if (!tighten?.suggested) return null;
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[14px] border border-amber-200/80 bg-amber-50/70 px-3 py-2">
                      <p className="flex-1 text-[10px] leading-[14px] text-[#09232d]/80">
                        {typeof tighten.reason === "string" && tighten.reason.trim()
                          ? tighten.reason
                          : "Few usable leads matched this ICP."}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenIcpBuilder(
                            activeIcpId ? { tightenProfileId: activeIcpId } : undefined
                          )
                        }
                        className="shrink-0 rounded-full border border-[#09232d]/20 bg-white px-3 py-1 text-[10px] font-semibold text-[#09232d] transition hover:bg-[#09232d]/5"
                      >
                        Tighten ICP
                      </button>
                    </div>
                  );
                })()}
              {message.role === "assistant" &&
                (message.intent === "generate_leads" || message.intent === "generate_more_leads") &&
                Boolean(message.leads?.length) &&
                !isPendingMessage &&
                !isThinking && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const moreBody = withEntityModeCue(
                          "Generate more prospects for the same ICP",
                          generateEntityMode
                        );
                        handleSend(moreBody, "generate_more_leads");
                      }}
                      className="rounded-full border border-[#c8f0ff] bg-[#e4faff] px-3 py-1.5 text-[10px] font-semibold text-[#09232d] transition hover:bg-[#d6f5ff]"
                    >
                      Generate more prospects
                    </button>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          ["both", "Both"],
                          ["companies", "Companies"],
                          ["people", "People"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setGenerateEntityMode(value)}
                          className={`rounded-full px-2 py-0.5 text-[8px] font-semibold transition ${
                            generateEntityMode === value
                              ? "bg-[#09232d] text-white"
                              : "border border-[#d7d7d7] bg-white text-[#09232d]/70"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              {message.role === "assistant" &&
                message.intent === "create_outreach" &&
                message.meta?.outreach != null && (
                  <ChatOutreachReviewCard
                    draft={message.meta.outreach as OutreachDraft}
                    onReview={() =>
                      setOutreachPreview(
                        buildChatOutreachPreview(message.id, message.meta?.outreach as OutreachDraft)
                      )
                    }
                  />
                )}
              {showWelcomeMessage && index === 0 && (
                <div className="mt-5 flex items-center gap-5 text-[#cfcfcf]">
                  <ThumbsUp size={14} />
                  <ThumbsDown size={14} />
                  <Copy size={14} />
                </div>
              )}
            </div>
            );
          })}
          {isThinking && sendMessage.processingState && (
            sendMessage.processingState.intent === "quick_research" ? (
              <ResearchProcessingPanel
                state={sendMessage.processingState}
                onDetachToBackground={handleDetachToBackground}
              />
            ) : (
              <ProcessingPanel
                state={sendMessage.processingState}
                onDetachToBackground={handleDetachToBackground}
                onStopSearching={handleStopSearching}
                onContinueWaiting={handleContinueWaiting}
              />
            )
          )}
          <div aria-hidden className="h-2" />
        </div>
      </div>

      <div
        className={`mx-auto mb-5 w-[calc(100%-88px)] shrink-0 rounded-[22px] border border-[#d7d7d7] bg-white shadow-sm max-sm:mb-4 max-sm:w-[calc(100%-32px)] ${
          expanded ? "max-w-[1100px]" : "max-w-[824px]"
        }`}
      >
        <div className="flex min-h-[43px] flex-wrap items-center gap-2 rounded-t-[22px] border-b border-[#ececec] px-5 py-1.5">
          <Plus size={21} className="shrink-0 text-[#09232d]" />
          {selectedIntent !== "freeform" && (
            <IntentModeChip intent={selectedIntent} onClear={clearIntent} />
          )}
          <input
            ref={inputRef}
            aria-label="Ask Sales Engine"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              if (draft.trim()) handleSend(draft, selectedIntent);
            }}
            className="h-8 min-w-[120px] flex-1 bg-white text-[10px] text-[#09232d] outline-none placeholder:text-[#b5b5b5]"
            placeholder={INTENT_PLACEHOLDERS[selectedIntent]}
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={() => handleSend(draft, selectedIntent)}
            disabled={isThinking || !draft.trim()}
            className="se-primary grid size-[30px] shrink-0 place-items-center rounded-full bg-[#09232d] text-white disabled:opacity-60"
          >
            <Send size={15} fill="currentColor" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-4">
          <PromptButton
            icon={<Globe2 size={17} />}
            label="Quick Research"
            active={selectedIntent === "quick_research"}
            onSelect={() => selectIntent("quick_research")}
            tint={INTENT_MODE_CONFIG.quick_research.tint}
            disabled={isThinking}
          />
          <PromptButton
            icon={<UsersRound size={17} />}
            label="Generate New Prospects"
            active={selectedIntent === "generate_leads"}
            onSelect={() => selectIntent("generate_leads")}
            tint={INTENT_MODE_CONFIG.generate_leads.tint}
            disabled={isThinking}
          />
          <PromptButton
            icon={<Lightbulb size={17} />}
            label="Create Outreach Message"
            active={selectedIntent === "create_outreach"}
            onSelect={() => selectIntent("create_outreach")}
            tint={INTENT_MODE_CONFIG.create_outreach.tint}
            disabled={isThinking}
          />
        </div>
      </div>
    </section>

    <OutreachPreviewModal
      open={outreachPreview != null}
      onClose={() => setOutreachPreview(null)}
      activityId={outreachPreview?.activityId ?? null}
      channel={outreachPreview?.channel ?? "email"}
      initialSubject={outreachPreview?.subject}
      initialBody={outreachPreview?.body ?? ""}
      initialToEmail={outreachPreview?.toEmail}
      contextLabel={outreachPreview?.contextLabel}
      alignmentNote={outreachPreview?.alignmentNote}
      onConfigureSender={onOpenOutreachSettings}
      onSent={() => {
        const messageId = outreachPreview?.messageId;
        if (messageId != null) {
          setMessages((current) =>
            current.map((item) =>
              item.id === messageId
                ? {
                    ...item,
                    meta: {
                      ...item.meta,
                      outreach: { ...(item.meta?.outreach as OutreachDraft), sent: true },
                    },
                  }
                : item
            )
          );
        }
        setOutreachPreview(null);
      }}
    />
    </>
  );
}

const DELIVERY_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-[#f59e0b]/20 text-[#92400e]" },
  sent: { label: "Sent", className: "bg-white/70 text-[#09232d]" },
  delivered: { label: "Delivered", className: "bg-[#16b37d]/20 text-[#087652]" },
  opened: { label: "Opened", className: "bg-[#2563eb]/15 text-[#1d4ed8]" },
  clicked: { label: "Clicked", className: "bg-[#7c3aed]/15 text-[#6d28d9]" },
  bounced: { label: "Bounced", className: "bg-[#ef4444]/15 text-[#b91c1c]" },
  dropped: { label: "Dropped", className: "bg-[#ef4444]/15 text-[#b91c1c]" },
  spam: { label: "Marked spam", className: "bg-[#ef4444]/15 text-[#b91c1c]" },
  unsubscribed: { label: "Unsubscribed", className: "bg-[#f59e0b]/20 text-[#92400e]" },
  failed: { label: "Failed", className: "bg-[#ef4444]/15 text-[#b91c1c]" },
};

function OutreachActionMenu({
  onView,
  onDelete,
  isDeleting = false,
}: {
  onView: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 150;
    const menuHeight = 96;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    const left = Math.max(12, rect.right - menuWidth);
    setPosition({ top, left });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    function handleScroll() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Outreach actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`grid size-6 shrink-0 place-items-center rounded-full text-[#09232d] transition hover:bg-black/10 cursor-pointer ${
          isOpen ? "bg-black/10" : ""
        }`}
      >
        <MoreVertical size={16} />
      </button>

      {isOpen &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-[150px] rounded-[14px] border border-black/10 bg-white p-1.5 text-[#09232d] shadow-[0_12px_28px_rgba(9,35,45,0.18)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                onView();
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <Eye size={13} className="shrink-0 text-[#09232d]" />
              <span>Open draft</span>
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              type="button"
              role="menuitem"
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-red-600 transition hover:bg-red-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={13} className="shrink-0 text-red-500" />
              <span>{isDeleting ? "Deleting…" : "Delete"}</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function OutreachCard({
  color,
  iconSrc,
  name,
  channel,
  preview,
  time,
  deliveryStatus,
  bounceReason,
  onView,
  onDelete,
  isDeleting = false,
}: {
  color: string;
  iconSrc: string;
  name: string;
  channel: string;
  preview: string;
  time: string;
  deliveryStatus?: string | null;
  bounceReason?: string | null;
  onView: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}) {
  const badge = deliveryStatus ? DELIVERY_STATUS_BADGES[deliveryStatus] : null;

  return (
    <article
      className={`${color} relative h-[108px] w-full shrink-0 overflow-hidden rounded-[20px] p-5 shadow-[0_6px_5px_rgba(0,0,0,0.15),0_2px_1.5px_rgba(0,0,0,0.3)]`}
      style={color.startsWith("#") ? { backgroundColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white">
            <Image
              src={iconSrc}
              alt=""
              width={22}
              height={22}
              className="size-[22px] object-contain"
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1 text-[#09232d]">
            <p className="truncate text-[14px] font-bold leading-[18px]" title={name}>
              {name}
            </p>
            <p className="mt-1 line-clamp-2 break-words text-[8px] font-light leading-[10px]">
              {channel}: {preview}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OutreachActionMenu onView={onView} onDelete={onDelete} isDeleting={isDeleting} />
          {badge ? (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[6px] font-bold uppercase tracking-wide ${badge.className}`}
              title={bounceReason ?? undefined}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
      </div>
      <p className="ml-[48px] mt-1.5 text-[7px] font-light leading-[9px] text-[#09232d]/80">{time}</p>
    </article>
  );
}

const OUTREACH_CARD_PALETTE = [
  { bg: "#E3A5E9", iconSrc: "/message-01-purple.png" },
  { bg: "#7BB6B8", iconSrc: "/message-01-teal.png" },
  { bg: "#DBDBDB", iconSrc: "/message-01-gray.png" },
] as const;

function OutreachPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data: items = [] } = useSalesEngineOutreach();
  const deleteOutreach = useDeleteOutreachActivity();
  const [preview, setPreview] = useState<OutreachPreviewState | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);

  const handleView = async (item: OutreachActivity) => {
    setOpeningId(item.id);
    try {
      const draft = await fetchOutreachActivity(item.id);
      const normalized = normalizeOutreachSubjectBody(draft.body || item.preview, draft.subject);
      setPreview({
        activityId: draft.activity_id ?? item.id,
        channel: draft.channel === "whatsapp" ? "whatsapp" : "email",
        subject: normalized.subject,
        body: normalized.body,
        toEmail: draft.to_email ?? "",
        contextLabel: item.name,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not open outreach draft."));
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = (item: OutreachActivity) => {
    deleteOutreach.mutate(item.id, {
      onSuccess: () => {
        if (preview?.activityId === item.id) setPreview(null);
        toast.success(`Removed outreach for ${item.name}.`);
      },
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Could not delete outreach activity.")),
    });
  };

  return (
    <div className="se-outreach-frame">
    <aside className="se-dark-surface ticket-cutout relative h-[600px] overflow-hidden rounded-[20px] bg-[#09232d] px-[44px] py-[33px] text-white shadow-sm max-xl:h-[520px] max-sm:px-6">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <h2 className="text-[13px] font-bold">Recent Outreach Activities</h2>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label="Open email settings"
          title="Email settings"
        >
          <Settings size={15} />
        </button>
      </header>
      <p className="mb-6 text-center text-[10px] text-white/70">
        <Link
          href="/sales-engine/outreach"
          className="font-bold italic underline underline-offset-2 text-white hover:text-white/80 transition-colors"
        >
          Click here
        </Link>{" "}
        to view all outreach
      </p>
      {items.length > 0 ? (
        <div className="mx-auto flex h-[440px] w-full max-w-[285px] flex-col gap-4 overflow-y-auto overflow-x-hidden pr-1 max-xl:h-[360px] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.28)_transparent] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 hover:[&::-webkit-scrollbar-thumb]:bg-white/40">
          {items.map((item, index) => {
            const cardTheme = OUTREACH_CARD_PALETTE[index % OUTREACH_CARD_PALETTE.length];
            return (
              <OutreachCard
                key={item.id}
                color={cardTheme.bg}
                iconSrc={cardTheme.iconSrc}
                name={item.name}
                channel={item.channel}
                preview={item.preview}
                time={formatRelativeTime(new Date(outreachActivitySortTime(item)).toISOString())}
                deliveryStatus={item.delivery_status}
                bounceReason={item.bounce_reason}
                onView={() => void handleView(item)}
                onDelete={() => handleDelete(item)}
                isDeleting={deleteOutreach.isPending && deleteOutreach.variables === item.id}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex h-[420px] flex-col items-center justify-center max-xl:h-[340px]">
          <Image
            src="/message_empty.png"
            alt="No recent outreach activities"
            width={209}
            height={201}
            className="h-auto w-[180px] max-w-full select-none object-contain"
            priority
          />
        </div>
      )}

      {openingId != null &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9998] grid place-items-center bg-black/40 backdrop-blur-[2px]">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[#09232d] shadow-lg">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-[12px] font-medium">Opening draft…</span>
            </div>
          </div>,
          document.body
        )}

      <OutreachPreviewModal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        activityId={preview?.activityId ?? null}
        channel={preview?.channel ?? "email"}
        initialSubject={preview?.subject}
        initialBody={preview?.body ?? ""}
        initialToEmail={preview?.toEmail}
        contextLabel={preview?.contextLabel}
        onSent={() => {
          setPreview(null);
        }}
        onConfigureSender={onOpenSettings}
      />
    </aside>
    </div>
  );
}

function PipelineGaugeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M7 16a5.5 5.5 0 1 1 10 0" />
      <path d="M12 12.5l-2.5-2.5" />
      <circle cx="12" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IcpBuilderIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13.5 3.5H7.5A4 4 0 0 0 3.5 7.5v9A4 4 0 0 0 7.5 20.5h9a4 4 0 0 0 4-4v-6" />
      <circle cx="10.5" cy="10" r="2.5" />
      <path d="M6.5 17.5c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <path
        d="M18.5 2.5c0 1.6 1.4 2.8 3 2.8-1.6 0-3 1.2-3 2.8 0-1.6-1.4-2.8-3-2.8 1.6 0 3-1.2 3-2.8z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function CompanyBuildingIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 21h18" />
      <path d="M5 21V7a4 4 0 0 1 4-4h5v18" />
      <path d="M8 8h3" />
      <path d="M8 12h3" />
      <path d="M8 16h3" />
      <path d="M14 9h5a1 1 0 0 1 1 1v11" />
      <path d="M17 14v4" />
    </svg>
  );
}

/**
 * Smart Lead search stays flexible on purpose — a typed question can surface
 * strong matches outside the saved ICP, explained via icp_relevance_reason.
 * Social Listening scans are always ICP-driven with no live query behind
 * them, so they apply the ICP filter strictly: nothing outside your filter
 * criteria appears there. See backend_implementation_plan.md Phase 2.1.
 */
function SourceBadge({ sourceIcon }: { sourceIcon: string }) {
  const isLinkedIn = sourceIcon === "in";
  const isReddit = sourceIcon === "r";
  const isGoogle = sourceIcon === "G" || sourceIcon.toLowerCase() === "google";
  const isMeta =
    sourceIcon === "f" ||
    sourceIcon.toLowerCase() === "meta" ||
    sourceIcon.toLowerCase() === "facebook";

  if (isGoogle) {
    return (
      <span
        aria-label="Google Search"
        className="grid size-[22px] shrink-0 place-items-center rounded-[6px] bg-white text-[11px] font-bold shadow-sm border border-gray-200"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
        </svg>
      </span>
    );
  }

  if (isMeta) {
    return (
      <span
        aria-label="Meta"
        className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[#1877F2] text-[10px] font-bold text-white"
      >
        f
      </span>
    );
  }

  return (
    <span
      className={`grid size-[22px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
        isLinkedIn ? "bg-[#0a66c2]" : isReddit ? "bg-[#ff4500]" : "bg-black"
      }`}
    >
      {sourceIcon}
    </span>
  );
}

function ScoreGauge({
  score,
  dark = false,
  compact = false,
}: {
  score: number;
  dark?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-col items-center">
        <div className="relative grid size-[30px] place-items-center">
          <span
            className={`sales-gauge-spin absolute inset-0 rounded-full border-[2.5px] border-[#2ae9c9] border-l-transparent rotate-[-35deg] ${
              dark ? "bg-[#153841]" : "bg-white"
            }`}
          />
          <span
            className={`absolute inset-[3.5px] rounded-full ${dark ? "bg-[#14343e]" : "bg-white"}`}
          />
          <span className={`relative text-[8px] font-semibold ${dark ? "text-white" : "text-[#09232d]"}`}>{score}%</span>
        </div>
        <span className={`mt-0.5 text-[7px] leading-tight ${dark ? "text-white/80" : "text-[#616263]"}`}>High</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative grid size-[43px] place-items-center">
        <span
          className={`sales-gauge-spin absolute inset-0 rounded-full border-[4px] border-[#2ae9c9] border-l-transparent rotate-[-35deg] ${
            dark ? "bg-[#153841]" : "bg-white"
          }`}
        />
        <span
          className={`absolute inset-[7px] rounded-full ${dark ? "bg-[#14343e]" : "bg-white"}`}
        />
        <span className={`relative text-[9px] font-semibold ${dark ? "text-white" : "text-[#09232d]"}`}>{score}%</span>
      </div>
      <span className={`text-[9px] ${dark ? "text-white/80" : "text-[#616263]"}`}>High</span>
    </div>
  );
}

function SignalActionMenu({
  signal,
  isActive = false,
  onRemove,
  onSelect,
  onCreateOutreach,
  onAddToCrm,
  onSetReminder,
}: {
  signal: SocialSignal;
  isActive?: boolean;
  onRemove?: (id: number) => void;
  onSelect?: (signal: SocialSignal) => void;
  onCreateOutreach?: (signal: SocialSignal) => void;
  onAddToCrm?: (signal: SocialSignal) => void;
  onSetReminder?: (signal: SocialSignal) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 150;
    const menuHeight = 155;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    const left = Math.max(12, rect.right - menuWidth);
    setPosition({ top, left });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    function handleScroll() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Signal actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(signal);
          setIsOpen((prev) => !prev);
        }}
        className={`grid size-6 place-items-center rounded-full transition cursor-pointer ${
          isActive
            ? "hover:bg-white/20 text-white"
            : "hover:bg-black/10 text-[#616263]"
        } ${isOpen ? (isActive ? "bg-white/20" : "bg-black/10") : ""}`}
      >
        <MoreVertical
          size={16}
          className={`transition-colors ${isActive ? "text-white" : "text-[#616263]"}`}
        />
      </button>

      {isOpen &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-[150px] rounded-[14px] border border-black/10 bg-white p-1.5 text-[#09232d] shadow-[0_12px_28px_rgba(9,35,45,0.18)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                if (onCreateOutreach) {
                  onCreateOutreach(signal);
                } else {
                  toast.success(`Opening outreach composer for ${signal.company} (${signal.profile})…`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <Send size={13} className="shrink-0 text-[#09232d]" />
              <span>Outreach</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={Boolean(signal.native_crm_saved)}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                if (signal.native_crm_saved) return;
                if (onAddToCrm) {
                  onAddToCrm(signal);
                } else {
                  toast.success(`Added ${signal.company} to CRM pipeline.`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus size={13} className="shrink-0 text-[#09232d]" />
              <span>{signal.native_crm_saved ? "Already in CRM" : "Add to CRM"}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                if (onSetReminder) {
                  onSetReminder(signal);
                } else {
                  toast.success(`Reminder set for ${signal.company}.`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <Clock size={13} className="shrink-0 text-[#09232d]" />
              <span>Set Reminder</span>
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                if (onRemove) {
                  onRemove(signal.id);
                } else {
                  toast.success(`Signal from ${signal.company} removed.`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-red-600 transition hover:bg-red-50 cursor-pointer"
            >
              <Trash2 size={13} className="shrink-0 text-red-500" />
              <span>Remove</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function SocialSignalRow({
  signal,
  isActive = false,
  selected = false,
  selectionMode = false,
  onToggleSelect,
  onSelect,
  onRemoveSignal,
  onCreateOutreach,
  onAddToCrm,
  onSetReminder,
}: {
  signal: SocialSignal;
  isActive?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: (signal: SocialSignal) => void;
  onSelect: (signal: SocialSignal) => void;
  onRemoveSignal?: (id: number) => void;
  onCreateOutreach?: (signal: SocialSignal) => void;
  onAddToCrm?: (signal: SocialSignal) => void;
  onSetReminder?: (signal: SocialSignal) => void;
}) {
  const isIndividual =
    signal.entityType === "individual" || signal.company.toLowerCase() === "individual";
  const fresh = isFreshSignal(signal.posted_at);
  const inCrm = Boolean(signal.native_crm_saved);

  return (
    <tr
      onClick={() => onSelect(signal)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(signal);
        }
      }}
      className={`se-table-row ${isActive ? "se-table-row-active" : ""} group cursor-pointer outline-none ${
        isActive
          ? "text-white"
          : "text-[#616263]"
      }`}
    >
      {selectionMode && (
        <td className="w-9 rounded-l-[20px] px-2 py-2.5">
          <input
            type="checkbox"
            checked={selected}
            disabled={inCrm}
            aria-label={`Select ${signal.profile || signal.company}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect?.(signal);
            }}
            className="ml-2 size-3.5 cursor-pointer accent-[#09232d] disabled:cursor-not-allowed disabled:opacity-40"
          />
        </td>
      )}
      <td className={`px-3 py-2.5 ${selectionMode ? "" : "rounded-l-[20px]"}`}>
        <div className="flex min-w-0 items-start gap-2.5">
          <SourceBadge sourceIcon={signal.sourceIcon} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1">
              {fresh && (
                <span
                  className={`inline-flex rounded-full px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-wide ${
                    isActive
                      ? "bg-[#8dec66]/25 text-[#8dec66]"
                      : "bg-[#e8f8df] text-[#2f6b1f]"
                  }`}
                >
                  Fresh
                </span>
              )}
              {inCrm && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${
                    isActive
                      ? "bg-[#8dec66]/25 text-[#8dec66]"
                      : "bg-[#16b37d]/10 text-[#087652]"
                  }`}
                >
                  <CircleCheck size={9} />
                  In CRM
                </span>
              )}
            </div>
            <p
              className={`line-clamp-3 text-[9px] leading-[11px] transition-colors ${
                isActive ? "text-white" : "text-[#616263]"
              }`}
            >
              {signal.signal}
            </p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 align-middle">
        <p className="text-[8px] leading-[11px]">{signal.source}</p>
        <p
          className={`mt-0.5 text-[7.5px] leading-[10px] transition-colors ${
            isActive ? "text-white/70" : "text-[#616263]/70"
          }`}
        >
          {formatPostedDate(signal.posted_at) || formatRelativeTime(signal.posted_at) || "Date unknown"}
        </p>
      </td>
      <td className="px-2 py-2.5 align-middle">
        <p className="max-w-[75px] text-[8px] leading-[11px] line-clamp-2">{signal.persona}</p>
      </td>
      <td className="px-2 py-2.5 align-middle">
        <div className="flex min-w-0 max-w-[125px] items-center gap-1.5">
          {isIndividual ? (
            <User
              size={16}
              className={`shrink-0 transition-colors ${
                isActive ? "text-white" : "text-[#616263]"
              }`}
            />
          ) : (
            <CompanyBuildingIcon
              className={`size-4 shrink-0 transition-colors ${
                isActive ? "text-white" : "text-[#616263]"
              }`}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[8.5px] font-semibold leading-[11px]">{signal.company}</p>
            {signal.location && (
              <p className="truncate text-[7.5px] leading-[10px] opacity-80">{signal.location}</p>
            )}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2.5 align-middle">
        <div className="flex flex-col items-start gap-1">
          <span
            className="inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-[7px] font-semibold text-white"
            style={{ backgroundColor: getIntentColor(primarySignalTypeLabel(signal)) }}
          >
            {primarySignalTypeLabel(signal)}
          </span>
        </div>
      </td>
      <td className="px-1.5 py-2.5 align-middle">
        <ScoreGauge score={signal.score} dark={isActive} compact />
      </td>
      <td className="rounded-r-[20px] px-2.5 py-2.5 align-middle">
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            aria-label={`Message ${signal.profile || signal.company}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(signal);
              if (onCreateOutreach) {
                onCreateOutreach(signal);
              } else {
                toast.info(`Opening message composer for ${signal.profile || signal.company}…`);
              }
            }}
            className={`grid size-6 place-items-center rounded-full transition cursor-pointer ${
              isActive ? "hover:bg-white/20" : "hover:bg-black/10"
            }`}
          >
            <MessageCircle
              size={14}
              className={`transition-colors ${
                isActive ? "text-white" : "text-[#616263]"
              }`}
            />
          </button>
          <SignalActionMenu
            signal={signal}
            isActive={isActive}
            onRemove={onRemoveSignal}
            onSelect={onSelect}
            onCreateOutreach={onCreateOutreach}
            onAddToCrm={onAddToCrm}
            onSetReminder={onSetReminder}
          />
        </div>
      </td>
    </tr>
  );
}

function SocialSignalsTable({
  signals,
  activeSignalId,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  onBulkAddToCrm,
  isBulkSyncing,
  onHoverSignal,
  onRemoveSignal,
  onCreateOutreach,
  onAddToCrm,
  onSetReminder,
  page,
  onPageChange,
  hasActiveFilters,
  onClearFilter,
  isLoading,
  isScanning,
  emptyState,
  onEmptyScanNow,
  onEmptyOpenSettings,
  enabledSources,
  scanPanel,
  lastRunSummary,
}: {
  signals: SocialSignal[];
  activeSignalId?: number | null;
  selectedIds: number[];
  onToggleSelect: (signal: SocialSignal) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onBulkAddToCrm: () => void;
  isBulkSyncing?: boolean;
  onHoverSignal: (signal: SocialSignal) => void;
  onRemoveSignal?: (id: number) => void;
  onCreateOutreach?: (signal: SocialSignal) => void;
  onAddToCrm?: (signal: SocialSignal) => void;
  onSetReminder?: (signal: SocialSignal) => void;
  page: number;
  onPageChange: Dispatch<SetStateAction<number>>;
  hasActiveFilters: boolean;
  onClearFilter: () => void;
  isLoading?: boolean;
  isScanning?: boolean;
  emptyState?: ReturnType<typeof getSocialListeningEmptyState>;
  onEmptyScanNow?: () => void;
  onEmptyOpenSettings?: () => void;
  enabledSources?: string[];
  scanPanel?: ReactNode;
  lastRunSummary?: ReactNode;
}) {
  const [selectionMode, setSelectionMode] = useState(false);
  const currentList = signals;
  const totalItems = currentList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedList = currentList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const empty = totalItems === 0;
  const showSkeleton = (isLoading || isScanning) && signals.length === 0;
  const skeletonRows = isScanning ? 5 : 4;
  const selectableSignals = signals.filter((signal) => !signal.native_crm_saved);
  const allSelectableSelected =
    selectableSignals.length > 0 &&
    selectableSignals.every((signal) => selectedIds.includes(signal.id));

  const exitSelectionMode = () => {
    setSelectionMode(false);
    onClearSelection();
  };

  return (
    <section className="se-surface flex flex-1 min-h-0 flex-col rounded-[30px] bg-white p-2 shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)] overflow-hidden">
      {isScanning && scanPanel}
      {!isScanning && lastRunSummary}
      <div className="mb-2 flex items-center justify-end gap-2 px-2 pt-1">
        {selectionMode ? (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[14px] border border-[#09232d]/10 bg-[#f8f8f8] px-3 py-2">
            <p className="text-[9px] font-medium text-[#616263]">
              {selectedIds.length > 0
                ? `${selectedIds.length} signal${selectedIds.length === 1 ? "" : "s"} selected`
                : "Select signals to add to CRM"}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  disabled={isBulkSyncing}
                  onClick={onBulkAddToCrm}
                  className="se-primary rounded-full bg-[#09232d] px-3 py-1 text-[8px] font-semibold text-white disabled:opacity-60"
                >
                  {isBulkSyncing ? "Adding…" : `Add ${selectedIds.length} to CRM`}
                </button>
              )}
              <button
                type="button"
                onClick={exitSelectionMode}
                className="se-control inline-flex h-6 items-center gap-1 rounded-full border border-[#d1d1d1] bg-white px-2.5 text-[8px] font-semibold text-[#09232d] transition hover:bg-[#f3f3f3]"
              >
                <X size={10} />
                Done
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSelectionMode(true)}
            disabled={signals.length === 0}
            className="se-control inline-flex h-7 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[9px] font-medium text-[#34373c] transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ListChecks size={13} />
            Select
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1.5 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 hover:[&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-button]:hidden [scrollbar-width:thin] [scrollbar-color:#e5e7eb_transparent]">
        <table className="se-table w-full border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-[9px] font-semibold text-[#333333]">
              {selectionMode && (
                <th className="w-9 bg-white px-2 py-1 text-left">
                  <input
                    type="checkbox"
                    checked={allSelectableSelected}
                    disabled={selectableSignals.length === 0}
                    aria-label="Select all unsynced signals"
                    onChange={onToggleSelectAll}
                    className="ml-2 size-3.5 cursor-pointer accent-[#09232d] disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </th>
              )}
              <th className="bg-white px-3 py-1 text-left">Signal</th>
              <th className="whitespace-nowrap bg-white px-2 py-1 text-left">Source</th>
              <th className="bg-white px-2 py-1 text-left">Persona</th>
              <th className="bg-white px-2 py-1 text-left">Company</th>
              <th className="whitespace-nowrap bg-white px-2 py-1 text-left">Intent</th>
              <th className="whitespace-nowrap bg-white px-1.5 py-1 text-center">Score</th>
              <th className="whitespace-nowrap bg-white px-2.5 py-1 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedList.map((signal) => (
              <SocialSignalRow
                key={signal.id}
                signal={signal}
                isActive={signal.id === activeSignalId}
                selected={selectedIds.includes(signal.id)}
                selectionMode={selectionMode}
                onToggleSelect={onToggleSelect}
                onSelect={onHoverSignal}
                onRemoveSignal={onRemoveSignal}
                onCreateOutreach={onCreateOutreach}
                onAddToCrm={onAddToCrm}
                onSetReminder={onSetReminder}
              />
            ))}
            {showSkeleton && (
              <SocialSignalsTableSkeleton rows={skeletonRows} selectionMode={selectionMode} />
            )}
          </tbody>
        </table>
        {!isLoading && !isScanning && empty && !hasActiveFilters && emptyState && (
          <SocialSignalsEmptyState
            state={emptyState}
            enabledSources={enabledSources}
            onScanNow={onEmptyScanNow}
            onOpenSettings={onEmptyOpenSettings}
          />
        )}
      </div>
      {!isLoading && !isScanning && empty && hasActiveFilters && (
        <div className="px-4 py-6 text-center text-[12px] text-[#616263]">
          <p>No signals match your search or filters.</p>
          <button type="button" onClick={onClearFilter} className="se-control mt-3 rounded-full border px-3 py-2">
            Clear filter
          </button>
        </div>
      )}
      <ProspectPagination page={page} totalItems={totalItems} entityLabel="signals" setPage={onPageChange} />
    </section>
  );
}

function SocialListeningFilters({
  search,
  source,
  signalType,
  intent,
  signalTypeOptions,
  onSearchChange,
  onSourceChange,
  onSignalTypeChange,
  onIntentChange,
  onOpenSettings,
  onRefresh,
  isScanning,
  isScanPending,
}: {
  search: string;
  source: string;
  signalType: string;
  intent: string;
  signalTypeOptions: SelectOption[];
  onSearchChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSignalTypeChange: (value: string) => void;
  onIntentChange: (value: string) => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  isScanning?: boolean;
  isScanPending?: boolean;
}) {
  const refreshBusy = isScanning || isScanPending;
  return (
    <div className="flex flex-nowrap items-center gap-2 xl:gap-2.5 overflow-x-auto py-1">
      <label className="flex h-9 w-[150px] xl:w-[170px] shrink-0 items-center gap-2 rounded-full bg-white px-3.5 shadow-[0_1px_3px_1px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.18)]">
        <Search size={14} className="shrink-0 text-[#09232d]" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[10px] text-[#09232d] outline-none placeholder:text-[#616263]"
          placeholder="Search"
        />
      </label>
      <SearchableSelect
        value={source}
        onChange={onSourceChange}
        options={sourceFilterOptions}
        className="se-control h-8 min-w-[96px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <SearchableSelect
        value={signalType}
        onChange={onSignalTypeChange}
        options={signalTypeOptions}
        className="se-control h-8 min-w-[110px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <SearchableSelect
        value={intent}
        onChange={onIntentChange}
        options={intentFilterOptions}
        className="se-control h-8 min-w-[90px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <button
        type="button"
        onClick={onOpenSettings}
        className="se-control flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c] transition-colors hover:bg-gray-100 cursor-pointer"
      >
        <SlidersHorizontal size={13} />
        Filter
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshBusy}
        className="se-control flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] font-medium text-[#34373c] transition-colors hover:bg-gray-100 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
      >
        {refreshBusy ? (
          <Loader2 size={13} className="animate-spin text-[#09232d]" />
        ) : (
          <RefreshCw size={13} className="text-[#09232d]" />
        )}
        <span>{refreshBusy ? "Refreshing…" : "Refresh"}</span>
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="se-primary flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#09232d] px-3 text-[10px] font-medium text-white transition-colors hover:bg-[#0f3340] cursor-pointer"
      >
        <Sparkles size={13} />
        Listen Settings
      </button>
    </div>
  );
}

function SocialOpportunityDetail({
  signal,
  onCreateOutreach,
  onSetReminder,
  onSyncToCrm,
  isCreatingOutreach,
  isSettingReminder,
  isSyncingToCrm,
  outreachSent,
}: {
  signal: SocialSignal;
  onCreateOutreach: () => void;
  onSetReminder: () => void;
  onSyncToCrm: () => void;
  isCreatingOutreach?: boolean;
  isSettingReminder?: boolean;
  isSyncingToCrm?: boolean;
  outreachSent?: boolean;
}) {
  const isIndividual =
    signal.entityType === "individual" || signal.company.toLowerCase() === "individual";
  const [hasCopiedMessage, setHasCopiedMessage] = useState(false);
  const [expandedSignalId, setExpandedSignalId] = useState<number | null>(null);
  const showFullSignal = expandedSignalId === signal.id;
  const recommendedAction = normalizeRecommendedAction(
    signal.recommendedAction ?? {
      title: "Reach out soon",
      detail: "this prospect may be actively looking for solutions.",
    }
  );
  const personalRecommendedAction = signal.personalRecommendedAction
    ? normalizeRecommendedAction(signal.personalRecommendedAction)
    : null;
  const hasDistinctPersonalAction =
    personalRecommendedAction &&
    (personalRecommendedAction.title !== recommendedAction.title ||
      personalRecommendedAction.detail !== recommendedAction.detail);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(signal.suggestedMessage);
      setHasCopiedMessage(true);
      toast.success("AI suggested message copied to clipboard!");
      window.setTimeout(() => setHasCopiedMessage(false), 2000);
    } catch {
      toast.error("Failed to copy message.");
    }
  };

  const postHref = signal.post_url || null;
  const postedDateLabel =
    formatPostedDate(signal.posted_at) || formatRelativeTime(signal.posted_at) || "Date unknown";
  const icpMatched = matchedIcpFieldLabels(signal.icpFilter);

  return (
    <aside className="se-surface flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
      <div className="relative min-h-[175px] shrink-0 bg-[#0b242e] px-7 pb-5 pt-8 text-white">
        <div className="absolute right-7 top-8">
          <ScoreGauge score={signal.score} dark />
        </div>
        <SourceBadge sourceIcon={signal.sourceIcon} />
        <p
          className="mt-3 max-w-[250px] text-[10px] font-light leading-[13px] text-white"
          title={showFullSignal ? undefined : `Full Signal: ${signal.signal}`}
        >
          {showFullSignal ? signal.signal : (signal.summary || signal.description)}
        </p>
        <div className="mt-2 flex items-center gap-3">
          {postHref ? (
            <a
              href={postHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] italic text-white/90 transition-opacity hover:opacity-100 hover:text-white cursor-pointer"
            >
              <span className="underline underline-offset-2">See source</span>
              <span className="not-italic no-underline">→</span>
            </a>
          ) : (
            <span className="text-[10px] italic text-white/50">Source URL missing</span>
          )}
          {signal.summary && signal.summary !== signal.signal && (
            <button
              type="button"
              onClick={() => setExpandedSignalId(showFullSignal ? null : signal.id)}
              className="text-[10px] italic text-white/70 underline underline-offset-2 transition-opacity hover:opacity-100 hover:text-white cursor-pointer"
            >
              {showFullSignal ? "Show Summary" : "Show Full"}
            </button>
          )}
        </div>
        <p className="mt-2 text-[9px] font-light text-[#d0d0d0]">
          {signal.source} • {postedDateLabel}
          {isFreshSignal(signal.posted_at) ? " • Fresh" : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <div className="grid grid-cols-2 border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <div className="flex items-center gap-2 border-r border-[#e9e9e9] pr-4">
            <Image
              src="/avatars/male-avatar.png"
              alt=""
              width={25}
              height={25}
              className="size-[25px] rounded-full object-cover"
            />
            <div>
              {signal.author_profile_url ? (
                <a
                  href={signal.author_profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] font-semibold leading-[12px] text-[#09232d] underline underline-offset-2 hover:text-[#087652]"
                >
                  {signal.profile}
                </a>
              ) : (
                <p className="text-[10px] font-semibold leading-[12px]">{signal.profile}</p>
              )}
              <p className="text-[10px] font-light leading-[12px]">{signal.persona}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-4">
            {isIndividual ? (
              <User size={22} className="shrink-0 text-[#616263]" />
            ) : (
              <CompanyBuildingIcon className="size-[22px] shrink-0 text-[#616263]" />
            )}
            <div>
              <p className="text-[10px] font-semibold leading-[12px]">{signal.company}</p>
              <p className="whitespace-pre-line text-[10px] font-light leading-[12px]">
                {signal.location || (isIndividual ? "Individual profile" : "Public profile")}
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <p className="mb-2 text-[10px] font-semibold leading-[12px]">Why this is an opportunity</p>
          {signal.whyThisMattersToYou && (
            <p className="mb-2 text-[10px] font-medium leading-[13px] text-[#09232d]">
              {signal.whyThisMattersToYou}
            </p>
          )}
          {(signal.benefits && signal.benefits.length > 0 ? signal.benefits : signal.reasons).map((item) => (
            <div key={item} className="flex items-center gap-1.5 py-0.5 text-[10px] font-light leading-[12px]">
              <CircleCheck size={17} className="shrink-0 text-[#57c946]" />
              {item}
            </div>
          ))}
        </div>

        <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <p className="mb-3 text-[10px] font-semibold leading-[12px]">Intent & Context</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {(
              [
                ["Signal Type", primarySignalTypeLabel(signal)],
                ["Buying Stage", signal.buyingStage],
                ["Problem", signal.problem],
                ["Urgency", signal.urgency],
                signal.territory ? ["Territory", signal.territory] : null,
              ] as Array<[string, string] | null>
            )
              .filter((row): row is [string, string] => row !== null)
              .map(([label, value]) => (
                <div key={label}>
                  <p className="text-[10px] font-light leading-[12px]">{label}</p>
                  <p className="text-[10px] font-semibold leading-[12px]">{value}</p>
                </div>
              ))}
          </div>
        </div>

        {icpMatched.length > 0 && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-1.5 text-[10px] font-semibold leading-[12px]">ICP filter</p>
            <p className="text-[10px] leading-[13px]">
              Matched: {icpMatched.join(", ")}
            </p>
          </div>
        )}

        {signal.namedPeople && signal.namedPeople.length > 0 && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-2 text-[10px] font-semibold leading-[12px]">Named in this signal</p>
            <div className="flex flex-wrap gap-1.5">
              {signal.namedPeople.map((person) => (
                <span
                  key={person}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[#e2e2e2] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#09232d]"
                >
                  {person}
                </span>
              ))}
            </div>
          </div>
        )}

        {signal.enrichment && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-1.5 text-[10px] font-semibold leading-[12px]">Contact Enrichment</p>
            {signal.enrichment.status === "not_attempted" ? (
              <p className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#616263]">
                <Loader2 size={12} className="animate-spin" />
                Looking up contacts…
              </p>
            ) : signal.enrichment.status === "attempted_found" ? (
              <p className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#087652]">
                <CircleCheck size={14} className="shrink-0 text-[#57c946]" />
                Contact found
              </p>
            ) : (
              <p className="text-[10px] font-medium text-[#616263]">
                We checked our contact database and couldn&apos;t verify a person at this company yet.
              </p>
            )}
            {signal.enrichment.contacts && signal.enrichment.contacts.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {signal.enrichment.contacts.map((contact, index) => {
                  const found = contact.foundEmail || contact.foundPhone;
                  return (
                    <div
                      key={`${contact.personName ?? "contact"}-${index}`}
                      className="flex items-start justify-between gap-2 rounded-[8px] border border-[#eee] bg-[#fafafa] px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[9px] font-semibold text-[#09232d]">
                          {contact.personName || "Role-based search"}
                        </p>
                        <p className="text-[8px] text-[#616263]">
                          {found
                            ? [contact.foundEmail ? "email" : null, contact.foundPhone ? "phone" : null]
                                .filter(Boolean)
                                .join(", ")
                            : "not found"}
                          {contact.provider ? `, ${contact.provider}` : ""}
                          {contact.tier ? `, ${contact.tier}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${
                          found ? "bg-[#16b37d]/10 text-[#087652]" : "bg-[#f3f3f3] text-[#616263]"
                        }`}
                      >
                        {found ? "Found" : "Not found"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(signal.industry || (signal.keyTopics && signal.keyTopics.length > 0)) && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-2 text-[10px] font-semibold leading-[12px]">Prospect Intelligence</p>
            {signal.industry && (
              <p className="mb-2 text-[10px] leading-[13px]">
                <span className="font-semibold">Industry:</span> {signal.industry}
              </p>
            )}
            {signal.keyTopics && signal.keyTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {signal.keyTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex rounded-full bg-[#f1f3f4] px-2.5 py-0.5 text-[9px] font-medium text-[#494c4e]"
                  >
                    #{topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {signal.competitors && signal.competitors.length > 0 && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-1.5 text-[10px] font-semibold leading-[12px]">Mentioned Tools & Vendors</p>
            <div className="flex flex-wrap gap-1.5">
              {signal.competitors.map((comp) => (
                <span
                  key={comp}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[#e2e2e2] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#09232d]"
                >
                  {comp}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-[5px] px-2 py-2">
          {hasDistinctPersonalAction && personalRecommendedAction && (
            <div className="rounded-[10px] border border-[#cdeee0] bg-[#f0fdf7] px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
              <p className="text-[10px] font-bold leading-[12px] text-[#09232d]">Your Next Step</p>
              {personalRecommendedAction.title && (
                <p className="mt-1 text-[9px] font-semibold leading-[12px]">{personalRecommendedAction.title}</p>
              )}
              {personalRecommendedAction.detail && (
                <p className="mt-0.5 text-[9px] leading-[12px]">{personalRecommendedAction.detail}</p>
              )}
            </div>
          )}
          <div className="rounded-[10px] border border-[#e8e5e5] bg-[#f7f6f6] px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
            <p className="text-[10px] font-bold leading-[12px]">Recommended Action</p>
            {recommendedAction.title && (
              <p className="mt-1 text-[9px] font-semibold leading-[12px]">{recommendedAction.title}</p>
            )}
            {recommendedAction.detail && (
              <p className="mt-0.5 text-[9px] leading-[12px]">{recommendedAction.detail}</p>
            )}
            {!recommendedAction.title && !recommendedAction.detail && (
              <p className="mt-1 text-[9px] leading-[12px]">
                Reach out within 24 hours. This prospect may be actively looking for solutions.
              </p>
            )}
          </div>
          <div className="rounded-[10px] border border-[#e8e5e5] bg-white px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold leading-[12px]">AI Suggested Message</p>
              <button
                type="button"
                aria-label="Copy AI suggested message"
                onClick={handleCopyMessage}
                className="grid size-5 place-items-center rounded-[4px] text-[#9d9d9d] transition-colors hover:bg-gray-100 hover:text-[#09232d] cursor-pointer"
              >
                {hasCopiedMessage ? (
                  <Check size={13} className="text-[#16b37d]" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
            <p className="mt-1 whitespace-pre-line text-[9px] leading-[12px]">{signal.suggestedMessage}</p>
          </div>
          {outreachSent && (
            <p className="rounded-[10px] border border-[#cdeee0] bg-[#f0fdf7] px-3.5 py-2 text-[9px] font-semibold text-[#087652]">
              ✓ Sent
            </p>
          )}
          {signal.followUpStrategy && (
            <div className="rounded-[10px] border border-[#e8e5e5] bg-[#fcfcfc] px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
              <p className="text-[10px] font-bold leading-[12px]">Follow up Strategy</p>
              <p className="mt-1 text-[9px] leading-[12px]">{signal.followUpStrategy}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto shrink-0 flex items-center gap-[17px] border-t border-[#e9e9e9] bg-[#f7f7f7] px-6 py-4">
        <button
          type="button"
          disabled={isCreatingOutreach}
          onClick={onCreateOutreach}
          className="se-primary h-8 rounded-[10px] border border-[#d1d1d1] bg-[#09232d] px-3 text-[10px] font-medium text-white transition hover:bg-[#0f3340] cursor-pointer disabled:opacity-60"
        >
          {isCreatingOutreach ? "Creating…" : "Create Outreach"}
        </button>
        <button
          type="button"
          disabled={isSettingReminder}
          onClick={onSetReminder}
          className="se-control h-8 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c] transition hover:bg-gray-100 cursor-pointer disabled:opacity-60"
        >
          {isSettingReminder ? "Saving…" : "Set Reminder"}
        </button>
        {signal.native_crm_saved ? (
          <div className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#cdeee0] bg-[#f0fdf7] px-3 text-[10px] font-semibold text-[#087652]">
            <CircleCheck size={14} />
            <span>
              In CRM
              {signal.f23_lead_id ? ` (#${signal.f23_lead_id})` : ""}
            </span>
          </div>
        ) : (
          <button
            type="button"
            disabled={isSyncingToCrm}
            onClick={onSyncToCrm}
            className="se-control h-8 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c] transition hover:bg-gray-100 cursor-pointer disabled:opacity-60"
          >
            {isSyncingToCrm ? "Adding…" : "Add to CRM"}
          </button>
        )}
      </div>
    </aside>
  );
}

function ListeningSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: settings, isLoading } = useSocialListeningSettings(isOpen);
  const updateSettings = useUpdateSocialListeningSettings();
  const triggerRun = useTriggerSocialListeningRun();

  const [enabledSources, setEnabledSources] = useState<string[]>([]);
  const [metaPageIdsText, setMetaPageIdsText] = useState("");
  const [cadenceDays, setCadenceDays] = useState<14 | 30>(14);
  const [minScore, setMinScore] = useState(70);
  const [freshnessWindowDays, setFreshnessWindowDays] = useState<FreshnessWindowDays>(180);
  const [intentFilters, setIntentFilters] = useState<string[]>([]);
  const [crmDestination, setCrmDestination] = useState<SocialListeningSettings["crm_destination"]>("qualified_pipeline");
  const [outreachChannel, setOutreachChannel] = useState<SocialListeningSettings["outreach_channel_default"]>("email");

  useEffect(() => {
    if (!settings) return;
    // Hydrate editable form fields from the latest settings query payload.
    /* eslint-disable react-hooks/set-state-in-effect -- sync form draft from server settings */
    setEnabledSources(settings.enabled_sources ?? []);
    setMetaPageIdsText((settings.meta_page_ids ?? []).join("\n"));
    setCadenceDays(settings.cadence_days ?? 14);
    setMinScore(settings.min_score ?? 70);
    setFreshnessWindowDays((settings.freshness_window_days ?? 180) as FreshnessWindowDays);
    setIntentFilters(settings.intent_filters ?? []);
    setCrmDestination(settings.crm_destination ?? "qualified_pipeline");
    setOutreachChannel(settings.outreach_channel_default ?? "email");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [settings]);

  const handleSave = async () => {
    try {
      const metaPageIds = metaPageIdsText
        .split(/[\n,]+/)
        .map((item) => item.trim().replace(/^@/, ""))
        .filter(Boolean);

      await updateSettings.mutateAsync({
        enabled_sources: enabledSources,
        meta_page_ids: metaPageIds,
        cadence_days: cadenceDays,
        min_score: minScore,
        freshness_window_days: freshnessWindowDays,
        intent_filters: intentFilters,
        crm_destination: crmDestination,
        outreach_channel_default: outreachChannel,
      });
      await triggerRun.mutateAsync(true);
      toast.success("Listening settings saved. A refresh run has been queued.");
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save listening settings."));
    }
  };

  const toggleSource = (key: string) => {
    setEnabledSources((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const toggleIntent = (key: string) => {
    setIntentFilters((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ type: "spring", duration: 0.32 }}
            className="relative z-10 flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b242e] text-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Social Listening
                </p>
                <h3 className="mt-1 text-[18px] font-semibold">Listen Settings</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Close listen settings"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-[13px] text-white/60">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Loading settings…
                </div>
              ) : (
                <>
              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Sources monitored</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {SOURCE_SETTING_OPTIONS.map((sourceOption) => (
                    <label
                      key={sourceOption.key}
                      className="flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-[12px] text-white/75"
                    >
                      <input
                        type="checkbox"
                        checked={enabledSources.includes(sourceOption.key)}
                        onChange={() => toggleSource(sourceOption.key)}
                        className="accent-[#8dec66]"
                      />
                      {sourceOption.label}
                    </label>
                  ))}
                </div>
                {enabledSources.includes("meta_graph_pages") && (
                  <div className="mt-4">
                    <label
                      htmlFor="meta-page-ids"
                      className="text-[12px] font-medium text-white/80"
                    >
                      Meta Pages to monitor
                    </label>
                    <p className="mt-1 text-[11px] leading-[15px] text-white/45">
                      Page ID or @username, one per line. Direct Graph API monitoring of these pages.
                    </p>
                    <textarea
                      id="meta-page-ids"
                      value={metaPageIdsText}
                      onChange={(event) => setMetaPageIdsText(event.target.value)}
                      rows={4}
                      placeholder={"AcmeCorp\n123456789\ncompetitor-page"}
                      className="mt-2 w-full resize-y rounded-[12px] border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/30 focus:border-[#8dec66]/40"
                    />
                  </div>
                )}
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[13px] font-semibold">Refresh cadence</p>
                  <div className="mt-3 space-y-2 text-[12px] text-white/70">
                    {[
                      { label: "Every 14 days", value: 14 as const },
                      { label: "Every 30 days", value: 30 as const },
                    ].map((cadence) => (
                      <label key={cadence.value} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="social-listening-cadence"
                          checked={cadenceDays === cadence.value}
                          onChange={() => setCadenceDays(cadence.value)}
                          className="accent-[#8dec66]"
                        />
                        {cadence.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[13px] font-semibold">Opportunity threshold</p>
                  <div className="mt-4">
                    <input
                      type="range"
                      min="40"
                      max="90"
                      value={minScore}
                      onChange={(event) => setMinScore(Number(event.target.value))}
                      className="w-full accent-[#8dec66]"
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-white/45">
                      <span>Broad</span>
                      <span>{minScore}% score</span>
                      <span>Strict</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Freshness window</p>
                <p className="mt-1 text-[11px] leading-[15px] text-white/45">
                  Only keep opportunities dated within this window. Searches also prefer recent posts.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-white/70">
                  {[
                    { label: "Last 7 days", value: 7 as const },
                    { label: "Last 14 days", value: 14 as const },
                    { label: "Last 30 days", value: 30 as const },
                    { label: "Last 3 months", value: 90 as const },
                    { label: "Last 6 months", value: 180 as const },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2"
                    >
                      <input
                        type="radio"
                        name="social-listening-freshness"
                        checked={freshnessWindowDays === option.value}
                        onChange={() => setFreshnessWindowDays(option.value)}
                        className="accent-[#8dec66]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Intent signals</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {INTENT_SETTING_OPTIONS.map((intentOption) => (
                    <label
                      key={intentOption.key}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-white/75"
                    >
                      <input
                        type="checkbox"
                        checked={intentFilters.includes(intentOption.key)}
                        onChange={() => toggleIntent(intentOption.key)}
                        className="accent-[#8dec66]"
                      />
                      {intentOption.label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Routing rules</p>
                <div className="mt-3 grid gap-3 text-[12px] text-white/70 sm:grid-cols-2">
                  <label>
                    CRM destination
                    <select
                      value={crmDestination}
                      onChange={(event) =>
                        setCrmDestination(event.target.value as SocialListeningSettings["crm_destination"])
                      }
                      className="mt-1 h-10 w-full rounded-[10px] border border-white/10 bg-[#14343e] px-3 text-white outline-none"
                    >
                      <option value="qualified_pipeline">Qualified leads pipeline</option>
                      <option value="human_review">Human review queue</option>
                    </select>
                  </label>
                  <label>
                    Outreach channel
                    <select
                      value={outreachChannel}
                      onChange={(event) =>
                        setOutreachChannel(
                          event.target.value as SocialListeningSettings["outreach_channel_default"]
                        )
                      }
                      className="mt-1 h-10 w-full rounded-[10px] border border-white/10 bg-[#14343e] px-3 text-white outline-none"
                    >
                      <option value="email">Email first</option>
                      <option value="human_follow_up">Human follow up</option>
                    </select>
                  </label>
                </div>
              </section>
                </>
              )}
            </div>

            <div className="flex gap-3 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="h-11 flex-1 rounded-[14px] bg-white/5 text-[13px] font-semibold text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateSettings.isPending || triggerRun.isPending}
                onClick={handleSave}
                className="se-primary h-11 flex-1 rounded-[14px] bg-[#8dec66] text-[13px] font-semibold text-[#09232d] transition hover:bg-[#9bff73] disabled:opacity-60"
              >
                {updateSettings.isPending ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SocialListeningTab({
  onOpenIcpBuilder,
  onOpenOutreachSettings,
}: {
  onOpenIcpBuilder: (opts?: { tightenProfileId?: string }) => void;
  onOpenOutreachSettings?: () => void;
}) {
  const { data: activeProfile } = useActiveIcpProfile();
  const { data: listenSettings } = useSocialListeningSettings();
  const { data: discreteSignalTypes = [] } = useSignalTypes();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState("all");
  const [signalType, setSignalType] = useState("all");
  const [intent, setIntent] = useState("all");
  const [page, setPage] = useState(1);
  const [activeSignalId, setActiveSignalId] = useState<number | null>(null);
  const [selectedSignalIds, setSelectedSignalIds] = useState<number[]>([]);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pollEnrichment, setPollEnrichment] = useState(false);
  const perPage = 50;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const handleSourceChange = (value: string) => {
    setSource(value);
    setPage(1);
    setSelectedSignalIds([]);
  };

  const handleSignalTypeChange = (value: string) => {
    setSignalType(value);
    setPage(1);
    setSelectedSignalIds([]);
  };

  const handleIntentChange = (value: string) => {
    setIntent(value);
    setPage(1);
    setSelectedSignalIds([]);
  };

  const { metrics, metricsLoading, latestRun, isScanning, bootstrap } =
    useSocialListeningBootstrap();
  const triggerRun = useTriggerSocialListeningRun();
  const {
    data: signalsResult,
    isLoading: signalsLoading,
    error: signalsError,
  } = useSocialListeningSignals(
    {
      page: 1,
      per_page: perPage,
      search: debouncedSearch,
      source,
      signal_type: signalType,
      buying_stage: intent,
    },
    { fetchAll: true, refetchInterval: isScanning || pollEnrichment ? 5000 : false }
  );

  const createOutreach = useCreateSignalOutreach();
  const setReminder = useSetSignalReminder();
  const syncToCrm = useSyncSignalToCrm();
  const dismissSignalMutation = useDismissSignal();
  const { pipelines, isLoading: pipelinesLoading, isError: pipelinesError, refetch: retryPipelines } = useSalesEngineCrmPipelines();
  const [outreachPreview, setOutreachPreview] = useState<OutreachPreviewState | null>(null);
  const [sentOutreachSignalIds, setSentOutreachSignalIds] = useState<Set<number>>(new Set());
  const [pendingOutreachSignal, setPendingOutreachSignal] = useState<SocialSignal | null>(null);
  const [pendingReminderSignal, setPendingReminderSignal] = useState<SocialSignal | null>(null);
  const [pendingCrmSignal, setPendingCrmSignal] = useState<SocialSignal | null>(null);
  const [reminderAtLabel, setReminderAtLabel] = useState("in 24 hours");

  const signals = useMemo(() => signalsResult?.items ?? [], [signalsResult?.items]);

  useEffect(() => {
    const pending = signals.some(
      (signal) => (signal.enrichment?.status ?? "not_attempted") === "not_attempted"
    );
    const finishedAt = latestRun?.finished_at ? new Date(latestRun.finished_at).getTime() : 0;
    const runJustFinished =
      latestRun?.status === "completed" && finishedAt > 0 && Date.now() - finishedAt < 120_000;
    setPollEnrichment(pending && (isScanning || runJustFinished));
  }, [signals, isScanning, latestRun]);

  const signalTypeOptions = useMemo<SelectOption[]>(() => {
    const discrete = discreteSignalTypes.map((type) => ({
      value: type.key,
      label: type.label,
    }));
    if (discrete.length === 0) return legacySignalTypeFilterOptions;
    return [{ value: "all", label: "All Signal Type" }, ...discrete];
  }, [discreteSignalTypes]);

  const visibleSelectedIds = useMemo(
    () =>
      selectedSignalIds.filter((id) =>
        signals.some((signal) => signal.id === id && !signal.native_crm_saved)
      ),
    [selectedSignalIds, signals]
  );

  const effectiveActiveSignalId = useMemo(() => {
    if (signals.length === 0) return null;
    if (activeSignalId != null && signals.some((signal) => signal.id === activeSignalId)) {
      return activeSignalId;
    }
    return null;
  }, [signals, activeSignalId]);

  const activeSignal =
    signals.find((signal) => signal.id === effectiveActiveSignalId) ?? signals[0];

  const openReminderConfirm = (signal: SocialSignal) => {
    const when = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setReminderAtLabel(
      when.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    );
    setPendingReminderSignal(signal);
  };

  const hasActiveFilters =
    debouncedSearch.length > 0 ||
    source !== "all" ||
    signalType !== "all" ||
    intent !== "all";

  const emptyState = getSocialListeningEmptyState(
    latestRun,
    metrics?.last_run_at,
    isScanning,
    hasActiveFilters,
    {
      signalTypeLabel:
        signalType !== "all"
          ? signalTypeOptions.find((option) => option.value === signalType)?.label ?? signalType
          : null,
      freshnessWindowDays: listenSettings?.freshness_window_days ?? 180,
    }
  );

  const icpContext = useMemo(
    () => ({
      industries: activeProfile?.config.industries,
      territories: activeProfile?.config.territories,
      name: activeProfile?.name,
    }),
    [activeProfile]
  );

  const scanPanel = isScanning ? (
    <SocialScanPanel
      stages={latestRun?.stages}
      signalsFound={Math.max(latestRun?.signals_created ?? 0, signals.length)}
      enabledSources={listenSettings?.enabled_sources ?? []}
      startedAt={latestRun?.started_at}
      icpContext={icpContext}
    />
  ) : null;

  const handleRefresh = () => {
    triggerRun.mutate(true, {
      onSuccess: () => toast.success("Social listening refresh queued."),
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Could not refresh social listening data.")),
    });
  };

  const executeCreateOutreach = (signal: SocialSignal) => {
    createOutreach.mutate(
      { id: signal.id },
      {
        onSuccess: (result) => {
          const contextName = signal.profile || signal.company || "Social prospect";
          const normalized = normalizeOutreachSubjectBody(result.body, result.subject);
          setOutreachPreview({
            activityId: result.activity_id ?? null,
            channel: result.channel === "whatsapp" ? "whatsapp" : "email",
            subject: normalized.subject,
            body: normalized.body,
            toEmail: result.to_email ?? "",
            contextLabel: `Re: ${contextName}`,
            signalId: signal.id,
          });
          setPendingOutreachSignal(null);
          toast.success("Outreach drafted and ready for review before sending.");
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not create outreach draft.")),
      }
    );
  };

  const executeSetReminder = (signal: SocialSignal) => {
    const actionNote = normalizeRecommendedAction(signal.recommendedAction);
    setReminder.mutate(
      {
        id: signal.id,
        note: [actionNote.title, actionNote.detail].filter(Boolean).join(". ") || undefined,
      },
      {
        onSuccess: () => {
          setPendingReminderSignal(null);
          toast.success("Reminder set for 24 hours from now.");
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not set reminder.")),
      }
    );
  };

  const executeSyncToCrm = (signal: SocialSignal, pipelineId?: string) => {
    if (signal.native_crm_saved) {
      toast.message(`"${signal.profile || signal.company}" is already in CRM.`);
      setPendingCrmSignal(null);
      return;
    }
    syncToCrm.mutate(
      { id: signal.id, pipeline_id: pipelineId },
      {
        onSuccess: () => {
          toast.success(`Added "${signal.profile || signal.company}" to CRM.`);
          setSelectedSignalIds((current) => current.filter((id) => id !== signal.id));
          setPendingCrmSignal(null);
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not sync signal to CRM.")),
      }
    );
  };

  const reminderNoteForPending = pendingReminderSignal
    ? (() => {
        const actionNote = normalizeRecommendedAction(pendingReminderSignal.recommendedAction);
        return [actionNote.title, actionNote.detail].filter(Boolean).join(". ");
      })()
    : "";

  const handleToggleSelect = (signal: SocialSignal) => {
    if (signal.native_crm_saved) return;
    setSelectedSignalIds((current) =>
      current.includes(signal.id)
        ? current.filter((id) => id !== signal.id)
        : [...current, signal.id]
    );
  };

  const handleToggleSelectAll = () => {
    const selectable = signals.filter((signal) => !signal.native_crm_saved).map((signal) => signal.id);
    const allSelected =
      selectable.length > 0 && selectable.every((id) => visibleSelectedIds.includes(id));
    setSelectedSignalIds(allSelected ? [] : selectable);
  };

  const [bulkCrmConfirmOpen, setBulkCrmConfirmOpen] = useState(false);

  const handleBulkAddToCrm = async (pipelineId: string) => {
    const pending = signals.filter(
      (signal) => visibleSelectedIds.includes(signal.id) && !signal.native_crm_saved
    );
    if (pending.length === 0) return;

    setIsBulkSyncing(true);
    let successCount = 0;
    let errorCount = 0;
    try {
      for (const signal of pending) {
        try {
          await syncToCrm.mutateAsync({ id: signal.id, pipeline_id: pipelineId });
          setSelectedSignalIds((current) => current.filter((id) => id !== signal.id));
          successCount += 1;
        } catch {
          errorCount += 1;
        }
      }
      if (successCount > 0) {
        toast.success(
          `Added ${successCount} poster${successCount === 1 ? "" : "s"} to CRM.`
        );
      }
      if (errorCount > 0) {
        toast.error(`Could not sync ${errorCount} signal${errorCount === 1 ? "" : "s"}.`);
      }
      setBulkCrmConfirmOpen(false);
    } finally {
      setIsBulkSyncing(false);
    }
  };

  const handleRemoveSignal = (id: number) => {
    dismissSignalMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Signal removed.");
        if (activeSignalId === id) {
          setActiveSignalId(null);
        }
      },
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Could not remove signal.")),
    });
  };

  const statCards: SocialStatCard[] = [
    {
      title: "Signals Detected",
      value: (metrics?.signals_detected ?? 0).toLocaleString(),
      percent: String(Math.max(0, metrics?.percent_change ?? 0)),
      unit: "Signals",
      active: true,
    },
    {
      title: "High Opportunities",
      value: (metrics?.high_opportunities ?? 0).toLocaleString(),
      percent: String(Math.max(0, metrics?.percent_change ?? 0)),
      unit: "Opportunities",
    },
    {
      title: "Added to CRM",
      value: (metrics?.added_to_crm ?? 0).toLocaleString(),
      percent: String(Math.max(0, metrics?.percent_change ?? 0)),
      unit: "Opportunities",
    },
  ];

  if (!activeProfile) {
    return (
      <div className="se-surface flex min-h-[645px] flex-col items-center justify-center rounded-[30px] bg-white px-8 py-16 text-center shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
        <p className="max-w-md text-[14px] font-medium text-[#616263]">
          Activate an ICP profile to start social listening against your target market.
        </p>
        <button
          type="button"
          onClick={() => onOpenIcpBuilder()}
          className="se-primary mt-5 h-11 rounded-[14px] bg-[#09232d] px-5 text-sm font-medium text-white transition-colors hover:bg-[#0c2e3b]"
        >
          Open ICP Builder
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_406px] items-stretch gap-[25px] max-xl:grid-cols-1 xl:h-[700px]">
        <div className="flex h-full min-h-0 flex-col gap-[17px]">
          <div className="shrink-0 grid grid-cols-3 items-start gap-[25px] max-lg:grid-cols-2 max-sm:grid-cols-1">
            {statCards.map((card) => (
              <MetricCard
                key={card.title}
                title={card.title}
                value={metricsLoading && !isScanning ? "—" : card.value}
                percent={metricsLoading && !isScanning ? "—" : card.percent}
                active={card.active}
                unit={card.unit}
                isScanning={isScanning && card.active}
              />
            ))}
          </div>
          <div className="shrink-0">
            <SocialListeningFilters
              search={search}
              source={source}
              signalType={signalType}
              intent={intent}
              signalTypeOptions={signalTypeOptions}
              onSearchChange={(value) => { setSearch(value); setPage(1); }}
              onSourceChange={handleSourceChange}
              onSignalTypeChange={handleSignalTypeChange}
              onIntentChange={handleIntentChange}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onRefresh={handleRefresh}
              isScanning={isScanning}
              isScanPending={triggerRun.isPending || bootstrap.isPending}
            />
          </div>
          {signalsError && isMissingActiveIcp(signalsError) ? (
            <div className="se-surface flex flex-1 items-center justify-center rounded-[30px] bg-white p-8 text-[13px] text-[#616263]">
              Select an active ICP profile first. Open ICP Builder to create or activate one.
            </div>
          ) : (
            <SocialSignalsTable
              signals={signals}
              activeSignalId={effectiveActiveSignalId}
              selectedIds={visibleSelectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              onClearSelection={() => setSelectedSignalIds([])}
              onBulkAddToCrm={() => setBulkCrmConfirmOpen(true)}
              isBulkSyncing={isBulkSyncing}
              onHoverSignal={(signal) => setActiveSignalId(signal.id)}
              onRemoveSignal={handleRemoveSignal}
              onCreateOutreach={setPendingOutreachSignal}
              onAddToCrm={setPendingCrmSignal}
              onSetReminder={openReminderConfirm}
              page={page}
              hasActiveFilters={hasActiveFilters || search.trim().length > 0}
              onClearFilter={() => {
                setSearch("");
                setDebouncedSearch("");
                setSource("all");
                setSignalType("all");
                setIntent("all");
                setPage(1);
              }}
              onPageChange={setPage}
              isLoading={signalsLoading}
              isScanning={isScanning}
              emptyState={emptyState}
              onEmptyScanNow={handleRefresh}
              onEmptyOpenSettings={() => setIsSettingsOpen(true)}
              enabledSources={listenSettings?.enabled_sources}
              scanPanel={scanPanel}
              lastRunSummary={<ScanRunSummaryPanel run={latestRun} />}
            />
          )}
        </div>
        {activeSignal ? (
          <SocialOpportunityDetail
            signal={activeSignal}
            isCreatingOutreach={createOutreach.isPending && pendingOutreachSignal?.id === activeSignal.id}
            isSettingReminder={setReminder.isPending && pendingReminderSignal?.id === activeSignal.id}
            isSyncingToCrm={syncToCrm.isPending && pendingCrmSignal?.id === activeSignal.id}
            onCreateOutreach={() => setPendingOutreachSignal(activeSignal)}
            onSetReminder={() => openReminderConfirm(activeSignal)}
            onSyncToCrm={() => setPendingCrmSignal(activeSignal)}
            outreachSent={sentOutreachSignalIds.has(activeSignal.id)}
          />
        ) : isScanning ? (
          <SocialOpportunityDetailSkeleton />
        ) : (
          <SocialOpportunityEmptyState />
        )}
      </div>
      <ListeningSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <AddToCrmPipelineModal
        isOpen={bulkCrmConfirmOpen}
        onClose={() => { if (!isBulkSyncing) setBulkCrmConfirmOpen(false); }}
        prospectName={`${visibleSelectedIds.length} selected prospects`}
        pipelines={pipelines}
        isLoading={pipelinesLoading} isError={pipelinesError} onRetry={() => { void retryPipelines(); }}
        isConfirming={isBulkSyncing}
        onConfirm={(id) => { void handleBulkAddToCrm(id); }}
      />
      <CreateOutreachConfirmModal
        key={pendingOutreachSignal ? `outreach-${pendingOutreachSignal.id}` : "outreach-modal"}
        isOpen={pendingOutreachSignal != null}
        onClose={() => setPendingOutreachSignal(null)}
        prospectName={pendingOutreachSignal?.profile || pendingOutreachSignal?.company || "Prospect"}
        company={pendingOutreachSignal?.company || "—"}
        channel={
          listenSettings?.outreach_channel_default === "human_follow_up"
            ? "Human follow up"
            : "Email"
        }
        suggestedMessage={pendingOutreachSignal?.suggestedMessage || ""}
        source={pendingOutreachSignal?.source || ""}
        intent={pendingOutreachSignal?.intent || ""}
        isConfirming={createOutreach.isPending}
        onConfirm={() => pendingOutreachSignal && executeCreateOutreach(pendingOutreachSignal)}
      />
      <SetReminderConfirmModal
        key={pendingReminderSignal ? `reminder-${pendingReminderSignal.id}` : "reminder-modal"}
        isOpen={pendingReminderSignal != null}
        onClose={() => setPendingReminderSignal(null)}
        prospectName={pendingReminderSignal?.profile || pendingReminderSignal?.company || "Prospect"}
        company={pendingReminderSignal?.company || "—"}
        remindAtLabel={reminderAtLabel}
        note={reminderNoteForPending}
        isConfirming={setReminder.isPending}
        onConfirm={() => pendingReminderSignal && executeSetReminder(pendingReminderSignal)}
      />
      <AddToCrmPipelineModal
        key={pendingCrmSignal ? `crm-${pendingCrmSignal.id}` : "crm-modal"}
        isOpen={pendingCrmSignal != null}
        onClose={() => setPendingCrmSignal(null)}
        prospectName={pendingCrmSignal?.profile || pendingCrmSignal?.company || null}
        pipelines={pipelines}
        isLoading={pipelinesLoading} isError={pipelinesError} onRetry={() => { void retryPipelines(); }}
        isConfirming={syncToCrm.isPending}
        onConfirm={(pipelineId) =>
          pendingCrmSignal && executeSyncToCrm(pendingCrmSignal, pipelineId)
        }
      />
      <OutreachPreviewModal
        open={outreachPreview != null}
        onClose={() => setOutreachPreview(null)}
        activityId={outreachPreview?.activityId ?? null}
        channel={outreachPreview?.channel ?? "email"}
        initialSubject={outreachPreview?.subject}
        initialBody={outreachPreview?.body ?? ""}
        initialToEmail={outreachPreview?.toEmail}
        contextLabel={outreachPreview?.contextLabel}
        alignmentNote={outreachPreview?.alignmentNote}
        onConfigureSender={onOpenOutreachSettings}
        onSent={() => {
          if (outreachPreview?.signalId != null) {
            setSentOutreachSignalIds((current) => new Set(current).add(outreachPreview.signalId!));
          }
          setOutreachPreview(null);
        }}
      />
    </>
  );
}

export function SalesEngineView({ activeTab = "smart-lead" }: { activeTab?: SalesEngineTab }) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [isIcpModalOpen, setIsIcpModalOpen] = useState(false);
  const [tightenProfileId, setTightenProfileId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [isOutreachSettingsOpen, setIsOutreachSettingsOpen] = useState(searchParams.get("settings") === "outreach");
  const [icpSetupDismissed, setIcpSetupDismissed] = useState(false);
  const { data: activeProfile } = useActiveIcpProfile();
  const {
    data: icpProfiles = [],
    isLoading: isIcpProfilesLoading,
    isAuthLoading: isIcpAuthLoading,
  } = useIcpProfiles();
  const { data: metrics } = useSalesEngineMetrics();

  const leadsInCrm = metrics?.leads_in_crm ?? 0;
  const leadsPendingReview = metrics?.leads_pending_review ?? 0;
  const formatMetric = (value: number) => value.toLocaleString();

  const showIcpSetupPrompt =
    activeTab === "smart-lead" &&
    !chatExpanded &&
    !isIcpModalOpen &&
    !icpSetupDismissed &&
    !isIcpProfilesLoading &&
    !isIcpAuthLoading &&
    icpProfiles.length === 0;

  const handleOpenIcpBuilder = (opts?: { tightenProfileId?: string }) => {
    setTightenProfileId(opts?.tightenProfileId ?? null);
    setIsIcpModalOpen(true);
  };

  const handleCloseIcpBuilder = () => {
    setIsIcpModalOpen(false);
    setTightenProfileId(null);
  };

  return (
    <div className="se-workspace min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#f8f8f8] px-6 py-8 text-[#09232d] max-sm:px-4">
      <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-7">
        {activeTab === "social-listening" && !chatExpanded ? (
          <SocialListeningTab
            onOpenIcpBuilder={handleOpenIcpBuilder}
            onOpenOutreachSettings={() => setIsOutreachSettingsOpen(true)}
          />
        ) : (
          <>
        {!chatExpanded && (
          <div className="grid grid-cols-[269px_269px_minmax(0,1fr)] items-start gap-[25px] max-xl:grid-cols-2 max-lg:grid-cols-1">
            <MetricCard
              title="Lead Metrics"
              value={formatMetric(leadsInCrm)}
              percent="—"
              active
              unit="Leads"
              href="/crm?source=sales_engine"
              actionLabel="View in CRM &rarr;"
            />
            <MetricCard
              title="Pending Review"
              value={formatMetric(leadsPendingReview)}
              percent="—"
              unit="Drafts"
              href={activeProfile?.id ? `/sales-engine/pending-review?icp_id=${activeProfile.id}` : "/sales-engine/pending-review"}
              actionLabel="Review leads &rarr;"
            />
            <TrendChart />
            <div className="se-smart-actions flex flex-col gap-3 pt-2 col-span-full">
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/crm?source=sales_engine"
                  className="se-control flex h-11 items-center gap-2.5 rounded-[14px] border border-[#d1d1d1] bg-white px-4 text-sm font-medium text-[#222222] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#bfbfbf] hover:bg-[#f8f8f8]"
                >
                  <PipelineGaugeIcon className="h-5 w-5 text-[#8a8a8a]" />
                  View CRM Pipeline
                </Link>
                <button
                  type="button"
                  onClick={() => handleOpenIcpBuilder()}
                  className="se-primary flex h-11 items-center gap-2.5 rounded-[14px] bg-[#09232d] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0c2e3b] cursor-pointer"
                >
                  <IcpBuilderIcon className="h-5 w-5" />
                  ICP Builder
                </button>
              </div>
              {activeProfile && (
                <div className="flex items-center gap-1.5 px-1 text-[11px] text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-gray-400">Active ICP:</span>
                  <span className="font-semibold text-white truncate max-w-[240px]">
                    {activeProfile.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className={
            chatExpanded
              ? "grid grid-cols-1 gap-[25px]"
              : "grid grid-cols-[minmax(0,949px)_368px] gap-[25px] max-xl:grid-cols-1"
          }
        >
          <ChatWorkspace
            expanded={chatExpanded}
            onToggleExpanded={() => setChatExpanded((current) => !current)}
            onOpenIcpBuilder={handleOpenIcpBuilder}
            onOpenOutreachSettings={() => setIsOutreachSettingsOpen(true)}
          />
          {!chatExpanded && (
            <OutreachPanel onOpenSettings={() => setIsOutreachSettingsOpen(true)} />
          )}
        </div>
          </>
        )}
      </div>

      <IcpSetupPromptModal
        isOpen={showIcpSetupPrompt}
        onClose={() => setIcpSetupDismissed(true)}
        onCreateIcp={() => handleOpenIcpBuilder()}
      />
      <IcpBuilderModal
        isOpen={isIcpModalOpen}
        onClose={handleCloseIcpBuilder}
        tightenProfileId={tightenProfileId}
        onTightenHandled={() => setTightenProfileId(null)}
      />
      <OutreachSettingsModal
        open={isOutreachSettingsOpen}
        onClose={() => setIsOutreachSettingsOpen(false)}
      />
    </div>
  );
}
