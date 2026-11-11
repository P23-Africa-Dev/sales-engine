import { describe, expect, it } from "vitest";
import type { ChatLead } from "@/lib/api/sales-engine";
import { mapDiscoveryStage } from "@/lib/api/sales-engine";
import {
  isLeadContactPending,
  isLeadContactSearching,
  isLeadPartialMatch,
  leadContactSourceChip,
  leadFitTooltip,
} from "./enriched-lead-card";

const base: ChatLead = { id: 1, name: "Acme", source: "web", score: 82, summary: "" };

describe("ICP fit tooltip", () => {
  it("lists fit_breakdown evidence when present", () => {
    const lead: ChatLead = {
      ...base,
      icp_relevance_reason: "Logistics in Lagos",
      meta: {
        fit_breakdown: [
          { dimension: "Industry", status: "verified", evidence: "3PL operator" },
          { dimension: "Territory", status: "unknown" },
        ],
      },
    };
    expect(leadFitTooltip(lead, 82)).toBe(
      "ICP fit 82%\n✓ Industry (verified): 3PL operator\n? Territory (unknown)"
    );
  });

  it("falls back to icp_relevance_reason on older backends", () => {
    expect(leadFitTooltip({ ...base, icp_relevance_reason: "Strong match" }, 70)).toBe(
      "ICP fit 70%. Strong match"
    );
    expect(leadFitTooltip(base, 70)).toBe("ICP fit 70%");
  });

  it("flags partial matches only when the backend says so", () => {
    expect(isLeadPartialMatch(base)).toBe(false);
    expect(isLeadPartialMatch({ ...base, meta: { partial_match: true } })).toBe(true);
  });
});

describe("contact provenance", () => {
  it("labels sources by confidence and links to the source page", () => {
    const lead: ChatLead = {
      ...base,
      email: "ada@acme.example",
      phone: "+234 1 000",
      meta: {
        contact_sources: {
          email: {
            value: "ada@acme.example",
            type: "direct",
            confidence: "on_page",
            source_url: "https://acme.example/contact",
          },
          phone: { value: "+234 1 000", type: "company_line", confidence: "snippet" },
        },
      },
    };
    expect(leadContactSourceChip(lead, "email")).toMatchObject({
      label: "On website",
      href: "https://acme.example/contact",
    });
    expect(leadContactSourceChip(lead, "phone")).toMatchObject({ label: "Company line", href: null });
  });

  it("maps every confidence level and tolerates missing meta", () => {
    const chip = (confidence: string) =>
      leadContactSourceChip({ ...base, meta: { contact_sources: { email: { confidence } } } }, "email")?.label;
    expect(chip("snippet")).toBe("Search result");
    expect(chip("pattern")).toBe("Likely (pattern)");
    expect(chip("provider")).toBe("Provider");
    expect(leadContactSourceChip(base, "email")).toBeNull();
  });

  it("treats contact_status searching like the Looking up state", () => {
    expect(isLeadContactSearching({ ...base, contact_status: "searching" })).toBe(true);
    expect(isLeadContactSearching({ ...base, meta: { contact_status: "searching" } })).toBe(true);
    expect(isLeadContactPending({ ...base, contact_status: "not_attempted" })).toBe(true);
    expect(isLeadContactPending({ ...base, contact_status: "found" })).toBe(false);
  });
});

describe("discovery stage labels", () => {
  it("knows the people/company passes and async contact enrichment", () => {
    expect(mapDiscoveryStage(["people_pass"], "generate_leads")).toMatchObject({
      label: "Finding decision makers…",
      stepIndex: 1,
    });
    expect(mapDiscoveryStage(["company_rescue_pass"], "generate_leads").stepIndex).toBe(1);
    expect(mapDiscoveryStage(["enriching_contacts"], "generate_leads")).toMatchObject({
      label: "Looking up contact details…",
      stepIndex: 2,
    });
  });
});
