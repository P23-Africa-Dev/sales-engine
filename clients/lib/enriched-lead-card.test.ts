import { describe, expect, it } from "vitest";

import type { ChatLead } from "@/lib/api/sales-engine";
import {
  formatLeadContactLine,
  formatLeadRoleLine,
  isDirectProfileUrl,
  leadEntityBadge,
  primaryProfileUrl,
  primaryWebsiteUrl,
} from "./enriched-lead-card";

describe("enriched lead card fields", () => {
  it("formats title at company line for person leads", () => {
    const lead: ChatLead = {
      id: 1,
      name: "Elon Musk",
      source: "serper",
      score: 90,
      summary: "CEO of Tesla.",
      entity_type: "person",
      title: "CEO",
      company: "Tesla",
      location: "Austin, TX",
      profile_urls: ["https://linkedin.com/in/elonmusk"],
    };

    expect(formatLeadRoleLine(lead)).toBe("CEO at Tesla");
    expect(formatLeadContactLine(lead)).toBeNull();
    expect(leadEntityBadge(lead)).toBe("Contact");
    expect(primaryProfileUrl(lead)).toBe("https://linkedin.com/in/elonmusk");
  });

  it("formats account card fields for company leads", () => {
    const lead: ChatLead = {
      id: 3,
      name: "Acme Distributors",
      source: "serper",
      score: 82,
      summary: "FMCG distributor in Lagos.",
      entity_type: "company",
      title: "CEO",
      company: "Acme Distributors",
      contact_person: "Ada Okoye",
      location: "Lagos, NG",
      linkedin_url: "https://linkedin.com/company/acme-distributors",
      website: "https://acme.example.com",
    };

    expect(formatLeadRoleLine(lead)).toBe("Lagos, NG");
    expect(formatLeadContactLine(lead)).toBe("Contact: Ada Okoye · CEO");
    expect(leadEntityBadge(lead)).toBe("Account");
    expect(primaryProfileUrl(lead)).toBe("https://linkedin.com/company/acme-distributors");
    expect(primaryWebsiteUrl(lead)).toBe("https://acme.example.com");
  });

  it("never uses LinkedIn posts or article source_url as View Profile", () => {
    const fromPost: ChatLead = {
      id: 4,
      name: "Komatsu North America",
      source: "serper",
      score: 75,
      summary: "Chattanooga construction market.",
      entity_type: "company",
      linkedin_url: "https://www.linkedin.com/posts/komatsu-north-america_chattanooga-activity-123",
      source_url: "https://www.linkedin.com/posts/komatsu-north-america_chattanooga-activity-123",
      website: "komatsu.com",
    };

    expect(isDirectProfileUrl(fromPost.linkedin_url!, "company")).toBe(false);
    expect(primaryProfileUrl(fromPost)).toBeNull();
    expect(primaryWebsiteUrl(fromPost)).toBe("https://komatsu.com");

    const personPost: ChatLead = {
      id: 5,
      name: "Jane Doe",
      source: "serper",
      score: 70,
      summary: "Shared a post.",
      entity_type: "person",
      profile_urls: ["https://www.linkedin.com/feed/update/urn:li:activity:999"],
      source_url: "https://example.com/blog/top-ceos",
    };

    expect(primaryProfileUrl(personPost)).toBeNull();
  });

  it("keeps View Profile and Website as separate actions", () => {
    const contact: ChatLead = {
      id: 8,
      name: "Ada Okoye",
      source: "serper",
      score: 88,
      summary: "CEO",
      entity_type: "person",
      linkedin_url: "https://www.linkedin.com/in/ada-okoye",
      website: "https://novapay.example.com",
    };

    expect(primaryProfileUrl(contact)).toBe("https://www.linkedin.com/in/ada-okoye");
    expect(primaryWebsiteUrl(contact)).toBe("https://novapay.example.com");
    expect(primaryWebsiteUrl({ ...contact, website: "https://linkedin.com/in/ada-okoye" })).toBeNull();
  });

  it("accepts trusted non-LinkedIn profile hosts for View Profile", () => {
    expect(
      primaryProfileUrl({
        id: 9,
        name: "Ada",
        source: "serper",
        score: 80,
        summary: "Founder",
        entity_type: "person",
        linkedin_url: "https://about.me/ada-okoye",
      })
    ).toBe("https://about.me/ada-okoye");
  });

  it("rejects company /in/ and person /company/ for View Profile", () => {
    expect(
      primaryProfileUrl({
        id: 6,
        name: "Acme",
        source: "serper",
        score: 80,
        summary: "Co",
        entity_type: "company",
        linkedin_url: "https://www.linkedin.com/in/someone",
      })
    ).toBeNull();

    expect(
      primaryProfileUrl({
        id: 7,
        name: "Ada",
        source: "serper",
        score: 80,
        summary: "Person",
        entity_type: "person",
        linkedin_url: "https://www.linkedin.com/company/acme",
      })
    ).toBeNull();
  });

  it("returns null role line when title and company missing", () => {
    const lead: ChatLead = {
      id: 2,
      name: "Unknown Person",
      source: "serper",
      score: 50,
      summary: "Limited data.",
    };

    expect(formatLeadRoleLine(lead)).toBeNull();
    expect(primaryProfileUrl(lead)).toBeNull();
    expect(primaryWebsiteUrl(lead)).toBeNull();
    expect(leadEntityBadge(lead)).toBe("Contact");
  });
});
