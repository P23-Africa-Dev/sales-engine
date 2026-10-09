import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ResearchSourcesList,
  researchSourcesFromMeta,
} from "@/components/sales-engine/research-sources-list";
import { CHAT_QUICK_RESEARCH_POLL_MAX_MS } from "@/lib/api/sales-engine";
import { labelsForIntent } from "@/lib/sales-engine-processing-labels";

describe("ResearchSourcesList", () => {
  it("parses meta.research.sources into citation rows", () => {
    const sources = researchSourcesFromMeta({
      research: {
        sub_queries: ["fintech Lagos"],
        sources: [
          {
            title: "Lagos Fintech Report",
            url: "https://example.com/report",
            snippet: "Funding rose in payments.",
            provider: "serper",
            icp_relevance_reason: "Matches FinTech ICP in Lagos.",
          },
          { title: "  ", url: null },
        ],
      },
    });

    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("Lagos Fintech Report");
    expect(sources[0].icp_relevance_reason).toContain("FinTech");
  });

  it("renders numbered clickable citations", () => {
    const html = renderToStaticMarkup(
      <ResearchSourcesList
        sources={[
          {
            title: "Lagos Fintech Report",
            url: "https://example.com/report",
            snippet: "Funding rose in payments.",
            icp_relevance_reason: "Matches FinTech ICP in Lagos.",
          },
        ]}
      />
    );

    expect(html).toContain("Sources");
    expect(html).toContain("Lagos Fintech Report");
    expect(html).toContain('href="https://example.com/report"');
    expect(html).toContain("example.com");
    expect(html).toContain("Matches FinTech ICP in Lagos.");
  });
});

describe("quick research poll ceiling", () => {
  it("keeps quick research poll max under 2 minutes", () => {
    expect(CHAT_QUICK_RESEARCH_POLL_MAX_MS).toBe(90_000);
    expect(CHAT_QUICK_RESEARCH_POLL_MAX_MS).toBeLessThan(120_000);
  });
});

describe("quick research processing labels", () => {
  it("uses the faster 3-stage research labels", () => {
    const labels = labelsForIntent("quick_research", "Research African fintech");
    expect(labels).toContain("Reviewing your question…");
    expect(labels).toContain("Searching sources in parallel…");
    expect(labels).toContain("Writing your brief…");
    expect(labels.some((label) => /accounts|prospects/i.test(label))).toBe(false);
  });
});
