import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ScanRunSummaryPanel } from "@/components/sales-engine/scan-run-summary-panel";
import type { SocialListeningRunStatus } from "@/lib/api/sales-engine";

function makeRun(overrides: Partial<SocialListeningRunStatus> = {}): SocialListeningRunStatus {
  return {
    id: 1,
    status: "completed",
    result_summary: { totalChecked: 10, qualified: 4 },
    ...overrides,
  };
}

describe("ScanRunSummaryPanel", () => {
  it("announces new opportunities in plain words", () => {
    const html = renderToStaticMarkup(<ScanRunSummaryPanel run={makeRun()} />);

    expect(html).toContain("4 new opportunities from your latest scan");
    expect(html).not.toContain("rejected");
    expect(html).not.toContain("potential signals");
  });

  it("keeps an empty scan reassuring, without diagnostics", () => {
    const html = renderToStaticMarkup(
      <ScanRunSummaryPanel run={makeRun({ result_summary: { totalChecked: 100, qualified: 0 } })} />
    );

    expect(html).toContain("Nothing new worth your time yet");
    expect(html).toContain("keep listening");
    expect(html).not.toContain("100");
  });

  it("mentions contact lookups when there are any", () => {
    const html = renderToStaticMarkup(
      <ScanRunSummaryPanel
        run={makeRun({ result_summary: { totalChecked: 12, qualified: 3, enrichment: { found: 2, notFound: 1, pending: 1 } } })}
      />
    );

    expect(html).toContain("Contact details found for 2");
    expect(html).toContain("still looking for 1");
  });

  it("renders nothing for a legacy string result_summary", () => {
    const html = renderToStaticMarkup(
      <ScanRunSummaryPanel run={makeRun({ result_summary: "Created 2 social signals from 5 raw hits." })} />
    );

    expect(html).toBe("");
  });

  it("renders nothing while a run is still in progress", () => {
    expect(renderToStaticMarkup(<ScanRunSummaryPanel run={makeRun({ status: "running" })} />)).toBe("");
  });

  it("renders nothing when there is no run yet", () => {
    expect(renderToStaticMarkup(<ScanRunSummaryPanel run={null} />)).toBe("");
  });

  it("renders nothing when the run checked zero posts", () => {
    const html = renderToStaticMarkup(
      <ScanRunSummaryPanel run={makeRun({ result_summary: { totalChecked: 0, qualified: 0 } })} />
    );

    expect(html).toBe("");
  });
});
