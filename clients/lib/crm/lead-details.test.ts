import { describe, expect, it } from "vitest";
import type { LeadDetailSource } from "./lead-details";
import {
  formatLeadDetailBudget,
  formatLeadDetailDate,
  formatLeadMapLinkState,
  getLeadDetailDisplay,
} from "./lead-details";

const baseLead: LeadDetailSource = {
  name: "Acme Prospect",
};

describe("lead-details", () => {
  it("formats missing values with N/A and None fallbacks", () => {
    const display = getLeadDetailDisplay(baseLead);

    expect(display.email).toBe("N/A");
    expect(display.phone).toBe("N/A");
    expect(display.pipelineName).toBe("N/A");
    expect(display.budget).toBe("N/A");
    expect(display.lastInteraction).toBe("None");
    expect(display.nextAction).toBe("None");
    expect(display.assigneeName).toBe("Unassigned");
    expect(display.creatorName).toBe("System");
    expect(display.convertedAt).toBeNull();
    expect(display.mapLocationLabel).toBe("No location");
    expect(display.mapLinkState).toBe("Not linked");
  });

  it("formats populated contact, CRM, and timeline fields", () => {
    const display = getLeadDetailDisplay({
      ...baseLead,
      email: "lead@example.com",
      phone: "+2348000000000",
      location: "Ikeja GRA",
      company_name: "Acme Ltd",
      website: "https://acme.com",
      position: "Head of Sales",
      profile_urls: ["https://linkedin.com/in/jane"],
      source: "referral",
      status: "qualified",
      priority: "high",
      budget_amount: 12500.5,
      budget_currency: "NGN",
      next_action: "Call tomorrow",
      last_interaction: "Requested quote",
      last_interaction_at: "2026-07-01T10:30:00.000Z",
      converted_at: "2026-07-10T12:00:00.000Z",
      created_at: "2026-06-01T08:00:00.000Z",
      updated_at: "2026-07-11T09:15:00.000Z",
      linked_to_map: true,
      pipeline: { name: "Enterprise", currency_code: "NGN" },
      creator: { name: "Admin User" },
      assignee: { name: "Agent User" },
    });

    expect(display.email).toBe("lead@example.com");
    expect(display.pipelineName).toBe("Enterprise");
    expect(display.budget).toContain("NGN");
    expect(display.budget).toContain("12,500");
    expect(display.assigneeName).toBe("Agent User");
    expect(display.creatorName).toBe("Admin User");
    expect(display.mapLinkState).toBe("Linked");
    expect(display.mapLocationLabel).toBe("Ikeja GRA");
    expect(display.convertedAt).not.toBeNull();
    expect(display.lastInteractionAt).not.toBe("N/A");
    expect(display.updatedAt).not.toBe("N/A");
    expect(display.createdAt).not.toBe("N/A");
  });

  it("formats budget, dates, and map-link labels", () => {
    expect(formatLeadDetailBudget(baseLead)).toBe("N/A");
    expect(
      formatLeadDetailBudget({
        ...baseLead,
        budget_amount: 1000,
        budget_currency: "USD",
      }),
    ).toBe("USD 1,000");

    expect(formatLeadDetailDate(null)).toBe("N/A");
    expect(formatLeadDetailDate("not-a-date")).toBe("N/A");
    expect(formatLeadDetailDate("2026-07-01T10:30:00.000Z")).not.toBe("N/A");

    expect(formatLeadMapLinkState(true)).toBe("Linked");
    expect(formatLeadMapLinkState(false)).toBe("Not linked");
    expect(formatLeadMapLinkState(undefined)).toBe("Not linked");
  });

  it("handles non-string values like arrays or objects without throwing TypeError", () => {
    const displayWithEmptyArray = getLeadDetailDisplay({
      ...baseLead,
      email: [],
      phone: [],
      location: [],
      company_name: [],
    });
    expect(displayWithEmptyArray.email).toBe("N/A");
    expect(displayWithEmptyArray.phone).toBe("N/A");
    expect(displayWithEmptyArray.location).toBe("N/A");
    expect(displayWithEmptyArray.companyName).toBe("N/A");

    const displayWithArrayOfStrings = getLeadDetailDisplay({
      ...baseLead,
      email: ["array-email@example.com"],
      phone: ["+2348011112222"],
    });
    expect(displayWithArrayOfStrings.email).toBe("array-email@example.com");
    expect(displayWithArrayOfStrings.phone).toBe("+2348011112222");

    const displayWithObject = getLeadDetailDisplay({
      ...baseLead,
      email: { address: "object-email@example.com" },
    });
    expect(displayWithObject.email).toBe("object-email@example.com");
  });
});
