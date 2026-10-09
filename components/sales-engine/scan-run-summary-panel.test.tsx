import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ScanRunSummaryPanel } from "@/components/sales-engine/scan-run-summary-panel";
import type { SocialListeningRunStatus } from "@/lib/api/sales-engine";

function makeRun(overrides: Partial<SocialListeningRunStatus> = {}): SocialListeningRunStatus {
  return {
    id: 1,
    status: "completed",
    result_summary: {
      totalChecked: 10,
      qualified: 4,
      rejected: {
        icpMismatch: 3,
        missingSourceUrl: 0,
        missingSourceDate: 2,
        stale: 1,
        total: 6,
      },
    },
    ...overrides,
  };
}

describe("ScanRunSummaryPanel", () => {
  it("renders the checked/qualified/rejected breakdown for a structured run", () => {
    const html = renderToStaticMarkup(<ScanRunSummaryPanel run={makeRun()} />);

    expect(html).toContain("Checked 10 potential signals");
    expect(html).toContain("4 qualified");
    expect(html).toContain("6 rejected");
    expect(html).toContain("3 didn&#x27;t match your ICP filters");
    expect(html).toContain("2 had no publish date");
    expect(html).toContain("1 were too old");
    expect(html).not.toContain("had no source link");
  });

  it("renders nothing for a legacy string result_summary", () => {
    const html = renderToStaticMarkup(
      <ScanRunSummaryPanel run={makeRun({ result_summary: "Created 2 social signals from 5 raw hits." })} />
    );

    expect(html).toBe("");
  });

  it("renders nothing while a run is still in progress", () => {
    const html = renderToStaticMarkup(<ScanRunSummaryPanel run={makeRun({ status: "running" })} />);

    expect(html).toBe("");
  });

  it("renders nothing when there is no run yet", () => {
    const html = renderToStaticMarkup(<ScanRunSummaryPanel run={null} />);

    expect(html).toBe("");
  });

  it("renders nothing when the run checked zero hits", () => {
    const html = renderToStaticMarkup(
      <ScanRunSummaryPanel
        run={makeRun({
          result_summary: {
            totalChecked: 0,
            qualified: 0,
            rejected: { icpMismatch: 0, missingSourceUrl: 0, missingSourceDate: 0, stale: 0, total: 0 },
          },
        })}
      />
    );

    expect(html).toBe("");
  });

  it("includes type-mismatch rejections and contact enrichment counts", () => {
    const html = renderToStaticMarkup(
      <ScanRunSummaryPanel
        run={makeRun({
          result_summary: {
            totalChecked: 12,
            qualified: 3,
            rejected: {
              icpMismatch: 2,
              missingSourceUrl: 0,
              missingSourceDate: 0,
              stale: 1,
              typeMismatch: 4,
              total: 7,
            },
            enrichment: { found: 2, notFound: 1, pending: 0 },
          },
        })}
      />
    );

    expect(html).toContain("4 weren&#x27;t a real match for the event type");
    expect(html).toContain("2 contacts found");
    expect(html).toContain("1 not found");
  });

  it("says none qualified when every checked hit was rejected", () => {
    const html = renderToStaticMarkup(
      <ScanRunSummaryPanel
        run={makeRun({
          result_summary: {
            totalChecked: 5,
            qualified: 0,
            rejected: { icpMismatch: 5, missingSourceUrl: 0, missingSourceDate: 0, stale: 0, total: 5 },
          },
        })}
      />
    );

    expect(html).toContain("None qualified");
  });
});
