import {
  isStructuredRunSummary,
  type SocialListeningRunStatus,
} from "@/lib/api/sales-engine";
import { describeScanRejections } from "@/lib/social-listening-run-summary";
import { SOCIAL_LISTENING_TIPS } from "@/lib/social-listening-processing-labels";

export type SocialListeningEmptyVariant =
  | "no_match_after_scan"
  | "awaiting_first_scan"
  | "filters_no_match"
  | "scan_failed"
  | "generic";

export type SocialListeningEmptyState = {
  variant: SocialListeningEmptyVariant;
  title: string;
  description: string;
  tip: string;
  showActions: boolean;
};

export type SocialListeningEmptyStateOptions = {
  signalTypeLabel?: string | null;
  freshnessWindowDays?: number | null;
};

export function recencyWindowPhrase(days?: number | null): string {
  if (!days || days <= 0) return "the selected window";
  if (days >= 180) return "the last 6 months";
  if (days >= 90) return "the last 3 months";
  if (days === 1) return "the last day";
  return `the last ${days} days`;
}

export function getSocialListeningEmptyState(
  latestRun: SocialListeningRunStatus | null | undefined,
  lastRunAt: string | null | undefined,
  isScanning: boolean,
  hasActiveFilters = false,
  options?: SocialListeningEmptyStateOptions
): SocialListeningEmptyState | null {
  if (isScanning) {
    return null;
  }

  const tip = SOCIAL_LISTENING_TIPS[0];

  if (latestRun?.status === "failed") {
    return {
      variant: "scan_failed",
      title: "Scan couldn't complete",
      description: latestRun.error ?? "The last scan failed. Try Scan now to retry.",
      tip: SOCIAL_LISTENING_TIPS[4],
      showActions: true,
    };
  }

  if (hasActiveFilters) {
    const typeLabel = options?.signalTypeLabel?.trim();
    if (typeLabel && typeLabel.toLowerCase() !== "all signal type") {
      return {
        variant: "filters_no_match",
        title: `No ${typeLabel} signals in ${recencyWindowPhrase(options?.freshnessWindowDays)}`,
        description: "Try another event type, broaden source, or widen the freshness window.",
        tip: SOCIAL_LISTENING_TIPS[2],
        showActions: false,
      };
    }

    return {
      variant: "filters_no_match",
      title: "No signals match these filters",
      description: "Try broadening source, intent, or search terms.",
      tip: SOCIAL_LISTENING_TIPS[2],
      showActions: false,
    };
  }

  if (!lastRunAt && !latestRun) {
    return {
      variant: "awaiting_first_scan",
      title: "Social listening is ready",
      description: "We monitor public posts for buying signals that fit your active ICP.",
      tip: SOCIAL_LISTENING_TIPS[3],
      showActions: true,
    };
  }

  if (latestRun?.status === "completed" && (latestRun.signals_created ?? 0) === 0) {
    const summary = isStructuredRunSummary(latestRun.result_summary)
      ? latestRun.result_summary
      : null;
    const checked = summary?.totalChecked ?? 0;
    const parts = summary ? describeScanRejections(summary) : [];
    if (summary?.budget_exhausted) parts.push("the daily search budget was used up");

    let description: string;
    if (summary?.model_unavailable) {
      description =
        "The scan found posts but the AI that qualifies them isn't available right now, so none could be checked. Try Scan now again shortly.";
    } else if (!summary) {
      description = "Your scan finished, but no high-intent posts met your score threshold yet.";
    } else if (checked === 0) {
      description = "The scan searched your active ICP and the live sources returned no recent posts.";
    } else {
      description = `The scan checked ${checked} recent posts for this ICP and kept 0.${
        parts.length ? ` Dropped: ${parts.join(", ")}.` : ""
      }`;
    }

    return {
      variant: "no_match_after_scan",
      title: summary && checked === 0 ? "No recent posts found" : "No opportunities kept",
      description,
      tip,
      showActions: true,
    };
  }

  return {
    variant: "generic",
    title: "No matching signals found",
    description: "Adjust Listen Settings or run a new scan to discover opportunities.",
    tip: SOCIAL_LISTENING_TIPS[1],
    showActions: true,
  };
}

export function getSocialListeningEmptyMessage(
  latestRun: SocialListeningRunStatus | null | undefined,
  lastRunAt: string | null | undefined,
  isScanning: boolean,
  hasActiveFilters = false,
  options?: SocialListeningEmptyStateOptions
): string {
  const state = getSocialListeningEmptyState(
    latestRun,
    lastRunAt,
    isScanning,
    hasActiveFilters,
    options
  );

  if (!state) {
    return "";
  }

  return state.description;
}
