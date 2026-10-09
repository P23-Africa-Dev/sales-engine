import { CheckCircle2 } from "lucide-react";
import { isStructuredRunSummary, type SocialListeningRunStatus } from "@/lib/api/sales-engine";

export type ScanRunSummaryPanelProps = {
  run?: SocialListeningRunStatus | null;
};

/**
 * Shows a plain-language breakdown of the most recent completed scan: how many
 * potential signals were checked, how many were rejected and why (no source,
 * too old, type mismatch, didn't match the ICP filter), how many qualified,
 * and how many contacts were found vs not found.
 *
 * Renders nothing for a legacy run (plain-string result_summary) or a run
 * that isn't completed yet — this is a post-scan summary, not a progress view.
 */
export function ScanRunSummaryPanel({ run }: ScanRunSummaryPanelProps) {
  if (!run || run.status !== "completed" || !isStructuredRunSummary(run.result_summary)) {
    return null;
  }

  const { totalChecked, qualified, rejected, enrichment } = run.result_summary;
  if (totalChecked === 0) {
    return null;
  }

  const rejectionParts = [
    rejected.icpMismatch > 0 ? `${rejected.icpMismatch} didn't match your ICP filters` : null,
    rejected.missingSourceUrl > 0 ? `${rejected.missingSourceUrl} had no source link` : null,
    rejected.missingSourceDate > 0 ? `${rejected.missingSourceDate} had no publish date` : null,
    rejected.stale > 0 ? `${rejected.stale} were too old` : null,
    (rejected.typeMismatch ?? 0) > 0
      ? `${rejected.typeMismatch} weren't a real match for the event type`
      : null,
  ].filter((part): part is string => part !== null);

  const found = enrichment?.found ?? 0;
  const notFound = enrichment?.notFound ?? 0;
  const pending = enrichment?.pending ?? 0;
  const enrichmentParts = [
    found > 0 ? `${found} contact${found === 1 ? "" : "s"} found` : null,
    notFound > 0 ? `${notFound} not found` : null,
    pending > 0 ? `${pending} still looking up` : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="mx-2 mb-2 rounded-[16px] bg-[#f8f8f8] px-4 py-3 text-[#09232d] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.04)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#16b37d]/10 text-[#16b37d]">
          <CheckCircle2 size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold leading-[13px]">
            Checked {totalChecked} potential signal{totalChecked === 1 ? "" : "s"}
            {qualified > 0 ? `. ${qualified} qualified` : ". None qualified"}
          </p>
          {rejectionParts.length > 0 && (
            <p className="mt-1 text-[9px] leading-[12px] text-[#616263]">
              {rejected.total} rejected: {rejectionParts.join(", ")}.
            </p>
          )}
          {enrichmentParts.length > 0 && (
            <p className="mt-1 text-[9px] leading-[12px] text-[#616263]">
              Contacts: {enrichmentParts.join(", ")}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
