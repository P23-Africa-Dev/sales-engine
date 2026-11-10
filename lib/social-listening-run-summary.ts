import type { SocialListeningRunResultSummary } from "@/lib/api/sales-engine";

/** Plain-language labels for the backend's per-reason rejection counts. */
const DETAIL_LABELS: Record<string, (count: number) => string> = {
  not_a_buyer: (n) => `${n} ${n === 1 ? "was a vendor, recruiter or news post" : "were vendors, recruiters or news"}, not buyers`,
  self_promotion: (n) => `${n} ${n === 1 ? "was a vendor promotion" : "were vendor promotions"}`,
  excluded_term: (n) => `${n} matched words this scan excludes`,
  over_enrich_cap: (n) => `${n} lower-priority ${n === 1 ? "post was" : "posts were"} left for the next scan`,
  muted_author: (n) => `${n} came from authors you keep dismissing`,
  muted_community: (n) => `${n} came from communities you keep dismissing`,
};

/**
 * Turns a structured run summary into short reasons ("3 were too old", …).
 * Every rejected bucket the backend reports is covered, so the parts always
 * add up to the "N rejected" total shown next to them.
 */
export function describeScanRejections(summary: SocialListeningRunResultSummary): string[] {
  const { rejected } = summary;
  const parts: string[] = [];
  const push = (count: number | undefined, label: (n: number) => string) => {
    if (count && count > 0) parts.push(label(count));
  };

  push(rejected.icpMismatch, (n) => `${n} didn't match your ICP filters`);
  push(rejected.missingSourceUrl, (n) => `${n} had no source link`);
  push(rejected.missingSourceDate, (n) => `${n} had no publish date`);
  push(rejected.stale, (n) => `${n} were too old`);
  push(rejected.typeMismatch, (n) => `${n} weren't a real match for the event type`);
  push(rejected.belowMinScore, (n) => `${n} scored below your minimum score`);
  push(rejected.duplicate, (n) => `${n} were already in your feed`);

  const notActionable = rejected.notActionable ?? 0;
  if (notActionable > 0) {
    let explained = 0;
    for (const [reason, count] of Object.entries(summary.rejectedDetail ?? {})) {
      const label = DETAIL_LABELS[reason];
      if (label && count > 0) {
        parts.push(label(count));
        explained += count;
      }
    }
    const remainder = notActionable - explained;
    if (remainder > 0) {
      parts.push(`${remainder} weren't a concrete opening`);
    }
  }

  return parts;
}
