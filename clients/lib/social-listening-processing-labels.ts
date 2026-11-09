import type { SalesEngineIcpContext } from "@/lib/sales-engine-processing-labels";

export type { SalesEngineIcpContext };

export type SocialListeningStageKey =
  | "queued"
  | "analyzing_icp"
  | "searching_sources"
  | "enriching"
  | "completed"
  | string;

export type SocialScanStageInfo = {
  label: string;
  stepIndex: number;
  totalSteps: number;
  stageKey: string;
};

export const SOCIAL_SCAN_PIPELINE_STEPS = [
  "Analyze ICP",
  "Search sources",
  "Score signals",
] as const;

export const SOCIAL_LISTENING_TIPS = [
  "Posts mentioning budget or vendor switches often signal high buying intent.",
  "Leads with recent hiring activity convert 2× faster than cold outreach.",
  "Tighter ICP filters produce fewer but higher-quality social signals.",
  "Reply within 24 hours when a prospect publicly asks for recommendations.",
  "LinkedIn and Reddit often surface prospects before they hit traditional databases.",
  "Reference the prospect's exact post in your outreach for higher reply rates.",
] as const;

export const SOCIAL_SCAN_LABEL_INTERVAL_MS = 1200;

const STAGE_LABELS: Record<string, string> = {
  queued: "Preparing your social scan…",
  analyzing_icp: "Analyzing your ICP criteria…",
  searching_sources: "Searching LinkedIn, Reddit & web…",
  enriching: "Scoring buying intent against your ICP…",
  completed: "Finalizing results…",
};

const STAGE_STEP_INDEX: Record<string, number> = {
  queued: 0,
  analyzing_icp: 0,
  searching_sources: 1,
  enriching: 2,
  completed: 2,
};

const STAGE_ROTATION: Record<string, string[]> = {
  queued: [
    "Preparing your social scan…",
    "Loading your listen settings…",
    "Getting ready to search…",
  ],
  analyzing_icp: [
    "Analyzing your ICP criteria…",
    "Matching industries and territories…",
    "Building search queries…",
  ],
  searching_sources: [
    "Searching LinkedIn, Reddit & web…",
    "Checking recent posts for buying signals…",
    "Scanning public conversations…",
  ],
  enriching: [
    "Scoring buying intent against your ICP…",
    "Ranking matches by intent strength…",
    "Filtering low-quality noise…",
  ],
};

const LATE_SCAN_LABELS = [
  "Cross-checking source results…",
  "Validating signal quality…",
  "Almost ready…",
  "Just a little more…",
] as const;

const SOURCE_DISPLAY: Record<string, string> = {
  linkedin: "LinkedIn",
  reddit: "Reddit",
  twitter: "X",
  x: "X",
};

function icpScanLine(context?: SalesEngineIcpContext): string | null {
  const industry = context?.industries?.[0];
  const territory = context?.territories?.[0];

  if (industry && territory) {
    return `Scanning ${industry} conversations in ${territory}…`;
  }
  if (industry) {
    return `Scanning ${industry} conversations…`;
  }
  if (territory) {
    return `Searching posts in ${territory}…`;
  }

  return null;
}

export function formatSourceLabel(source: string): string {
  const key = source.toLowerCase().trim();
  return SOURCE_DISPLAY[key] ?? source;
}

export function mapSocialListeningStage(
  stages?: string[] | null,
  icpContext?: SalesEngineIcpContext
): SocialScanStageInfo {
  const filtered = stages?.filter(Boolean) ?? [];
  const stageKey = filtered.length > 0 ? filtered[filtered.length - 1] : "queued";
  const stepIndex = STAGE_STEP_INDEX[stageKey] ?? 0;
  const icpLine = icpScanLine(icpContext);

  let label = STAGE_LABELS[stageKey] ?? "Scanning social sources…";
  if (stageKey === "searching_sources" && icpLine) {
    label = icpLine;
  }

  return {
    label,
    stepIndex,
    totalSteps: SOCIAL_SCAN_PIPELINE_STEPS.length,
    stageKey,
  };
}

export function labelsForSocialScanStage(
  stageKey: string,
  icpContext?: SalesEngineIcpContext,
  enabledSources?: string[]
): string[] {
  const base = [...(STAGE_ROTATION[stageKey] ?? STAGE_ROTATION.searching_sources)];
  const icpLine = icpScanLine(icpContext);

  if (icpLine && stageKey !== "enriching" && !base.includes(icpLine)) {
    base.splice(1, 0, icpLine);
  }

  if (enabledSources && enabledSources.length > 0 && stageKey === "searching_sources") {
    const sourceNames = enabledSources.map(formatSourceLabel).join(" & ");
    const sourceLine = `Checking ${sourceNames} for buying signals…`;
    if (!base.includes(sourceLine)) {
      base.splice(1, 0, sourceLine);
    }
  }

  const seen = new Set<string>();
  const merged: string[] = [];

  for (const label of [...base, ...LATE_SCAN_LABELS]) {
    if (seen.has(label) || /queued/i.test(label)) continue;
    seen.add(label);
    merged.push(label);
  }

  return merged;
}

export function nextScanLabelIndex(labels: readonly string[], currentIndex: number): number {
  if (labels.length === 0) return 0;
  return (currentIndex + 1) % labels.length;
}

export function signalsFoundLabel(count: number): string | null {
  if (count <= 0) return null;
  return `Found ${count} potential match${count === 1 ? "" : "es"} so far…`;
}
