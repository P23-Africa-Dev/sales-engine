import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ResearchProcessingPanel } from "@/components/sales-engine/research-processing-panel";
import type { ProcessingState } from "@/hooks/use-sales-engine-chat";

const baseState: ProcessingState = {
  label: "Searching sources in parallel…",
  stepIndex: 1,
  totalSteps: 4,
  intent: "quick_research",
  startedAt: Date.now() - 12_000,
  secondaryLabel: null,
};

describe("ResearchProcessingPanel", () => {
  it("renders a research-specific loading experience", () => {
    const html = renderToStaticMarkup(<ResearchProcessingPanel state={baseState} />);

    expect(html).toContain("Quick Research");
    expect(html).toContain("Searching sources in parallel…");
    expect(html).toContain("Live source scan");
    expect(html).toContain("Question");
    expect(html).toContain("Sources");
    expect(html).toContain("Brief");
    expect(html).toContain("Research tip:");
    expect(html.toLowerCase()).not.toContain("accounts");
    expect(html.toLowerCase()).not.toContain("leads with recent hiring");
    expect(html).not.toContain("Analyze");
    expect(html).not.toContain("Extract");
  });

  it("offers background continue when a detach handler is provided", () => {
    const html = renderToStaticMarkup(
      <ResearchProcessingPanel state={baseState} onDetachToBackground={() => undefined} />
    );

    expect(html).toContain("Continue in background");
    expect(html).toContain("Usually ready in under a minute.");
  });
});
