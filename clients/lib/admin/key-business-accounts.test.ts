import { describe, expect, it } from "vitest";
import { CRM_RECORDS } from "./admin-crm";
import { buildKeyBusinessAccounts } from "./key-business-accounts";
import { ONBOARDED_BUSINESSES_DATA } from "./smart-leads";
import { INITIAL_SIGNALS } from "./social-listening";

describe("buildKeyBusinessAccounts", () => {
  it("consolidates account evidence by client and company and ignores excluded records", () => {
    const [client, otherClient] = ONBOARDED_BUSINESSES_DATA;
    const [lead] = client.prospects;
    const record = CRM_RECORDS.find((item) => item.businessId === client.id && item.company === lead.company)!;
    const signal = INITIAL_SIGNALS.find((item) => item.businessId === client.id && item.company === lead.company)!;

    const accounts = buildKeyBusinessAccounts(
      [{ ...client, prospects: [lead] }, { ...otherClient, prospects: [] }],
      [
        { ...record, company: `  ${lead.company.toUpperCase()}  `, stage: "Proposal", value: 20000 },
        { ...record, id: "duplicate", duplicateOf: record.id, value: 999999 },
        { ...record, id: "archived", archived: true, value: 999999 },
        { ...record, id: "other-client", businessId: otherClient.id },
      ],
      [
        { ...signal, status: "Approved" },
        { ...signal, id: "suppressed", status: "Suppressed" },
        { ...signal, id: "duplicate-signal", issue: "Possible duplicate" },
        { ...signal, id: "social-only", company: "Signal-only account", status: "Approved" },
      ],
    );

    const first = accounts[0];
    expect(first).toMatchObject({ businessId: client.id, company: lead.company, opportunityValue: 20000, sources: ["CRM", "Leads", "Social Listening"] });
    expect(first.onlineEvidence.filter((item) => item.id === signal.id)).toHaveLength(1);
    expect(first.onlineEvidence.map((item) => item.id)).not.toContain("suppressed");
    expect(first.onlineEvidence.map((item) => item.id)).not.toContain("duplicate-signal");
    expect(accounts.find((account) => account.businessId === otherClient.id)).toMatchObject({ sources: ["CRM"], fitScore: null });
    expect(accounts.find((account) => account.company === "Signal-only account")).toMatchObject({ sources: ["Social Listening"], emailsSent: null });
  });

  it("uses the prospect's recorded activities for signal shares, rates, and daily counts", () => {
    const accounts = buildKeyBusinessAccounts(ONBOARDED_BUSINESSES_DATA, CRM_RECORDS, INITIAL_SIGNALS);

    expect(accounts.find((account) => account.lead?.id === "prospect-qtx-1")).toMatchObject({
      emailsSent: 1, onlinePercent: 67, offlinePercent: 33, averageOpenRate: null, engagementRate: 100,
      daily: expect.arrayContaining([{ day: 0, touches: 1, opens: 0, meetings: 1 }]),
    });
    expect(accounts.find((account) => account.lead?.id === "prospect-qtx-2")).toMatchObject({
      emailsSent: 1, onlinePercent: 100, offlinePercent: 0, averageOpenRate: 100, engagementRate: 100,
    });
    expect(accounts.find((account) => account.lead?.id === "prospect-nt-5")).toMatchObject({
      emailsSent: 0, averageOpenRate: null, engagementRate: null,
    });
  });
});
