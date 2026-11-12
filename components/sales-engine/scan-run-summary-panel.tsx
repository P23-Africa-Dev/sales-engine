import { CheckCircle2, Radar } from "lucide-react";
import { isStructuredRunSummary, type SocialListeningRunStatus } from "@/lib/api/sales-engine";

export type ScanRunSummaryPanelProps = {
  run?: SocialListeningRunStatus | null;
};

/**
 * A short, human summary of the most recent completed scan: how many new openings it
 * found and how many contacts were looked up. Rejection buckets and scan diagnostics are
 * developer data and are never shown here.
 *
 * Renders nothing for a legacy run (plain-string result_summary) or a run that isn't
 * completed yet — this is a post-scan summary, not a progress view.
 */
export function ScanRunSummaryPanel({ run }: ScanRunSummaryPanelProps) {
  if (!run || run.status !== "completed" || !isStructuredRunSummary(run.result_summary)) {
    return null;
  }

  const { totalChecked, qualified, enrichment } = run.result_summary;
  const possible = run.result_summary.possible ?? 0;
  if (totalChecked === 0) {
    return null;
  }

  const found = enrichment?.found ?? 0;
  const pending = enrichment?.pending ?? 0;
  const contactLine =
    found > 0 || pending > 0
      ? [
          found > 0 ? `Contact details found for ${found}` : null,
          pending > 0 ? `still looking for ${pending}` : null,
        ]
          .filter(Boolean)
          .join(", ") + "."
      : null;

  const hasOpenings = qualified > 0 || possible > 0;
  const possibleNote =
    possible > 0 ? ` plus ${possible} possible ${possible === 1 ? "opening" : "openings"} worth a look` : "";
  const title = !hasOpenings
    ? "Nothing new worth your time yet"
    : qualified > 0
      ? `${qualified} new ${qualified === 1 ? "opportunity" : "opportunities"}${possibleNote} from your latest scan`
      : `${possible} possible ${possible === 1 ? "opening" : "openings"} worth a look from your latest scan`;
  const description = hasOpenings
    ? "We only keep posts that are a real opening for what you're looking for."
    : "We reviewed the latest conversations for what you're looking for and held back anything that wasn't a real opening. We'll keep listening — check back after the next scan.";

  return (
    <div className="mx-2 mb-2 rounded-[16px] bg-[#f8f8f8] px-4 py-3 text-[#09232d] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.04)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#16b37d]/10 text-[#16b37d]">
          {hasOpenings ? <CheckCircle2 size={14} /> : <Radar size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold leading-[13px]">{title}</p>
          <p className="mt-1 text-[9px] leading-[12px] text-[#616263]">{description}</p>
          {contactLine && <p className="mt-1 text-[9px] leading-[12px] text-[#616263]">{contactLine}</p>}
          {(run.result_summary.opportunities ?? 0) > 0 && (
            <p className="mt-1 text-[9px] font-medium leading-[12px] text-[#09232d]">
              {run.result_summary.opportunities} {run.result_summary.opportunities === 1 ? "is a company event" : "are company events"} from
              companies that fit your ICP: see Opportunities.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
