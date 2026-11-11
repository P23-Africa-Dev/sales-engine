import { describe, expect, it } from "vitest";

import type { ChatLead } from "@/lib/api/sales-engine";
import { leadContactSourceChip, withCompanyContactFallback } from "@/lib/enriched-lead-card";

const base = { id: 1, name: "Gloria Adjei", score: 91 } as ChatLead;

describe("withCompanyContactFallback", () => {
  it("shows the company inbox, labelled, when the person has no direct email", () => {
    const lead = withCompanyContactFallback({ ...base, email: null, company_email: "info@olam.com" });

    expect(lead.email).toBe("info@olam.com");
    expect(leadContactSourceChip(lead, "email")?.label).toBe("Company inbox");
  });

  it("keeps a head-office switchboard labelled as such", () => {
    const lead = withCompanyContactFallback({
      ...base,
      phone: null,
      company_phone: "+6563394100",
      contact_sources: { phone: { value: "+6563394100", type: "hq_line", confidence: "on_page" } },
    });

    expect(lead.phone).toBe("+6563394100");
    expect(leadContactSourceChip(lead, "phone")?.label).toBe("Head-office line");
  });

  it("never replaces a direct contact", () => {
    const lead = { ...base, email: "gloria.adjei@olam.com", company_email: "info@olam.com" };

    expect(withCompanyContactFallback(lead)).toBe(lead);
  });
});
