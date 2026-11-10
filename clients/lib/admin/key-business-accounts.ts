import { isOpen, money, type CrmRecord } from "./admin-crm";
import type { Signal } from "./social-listening";
import { sampleActivityAge } from "./smart-leads-sample-activity";
import type { OnboardedBusiness, SmartLead, SmartLeadActivity } from "./smart-leads";

const ACCOUNT_SOURCES = ["CRM", "Leads", "Social Listening"] as const;

const ENGAGED_EMAIL_STATUSES = ["Clicked", "Replied", "Accepted", "Signed"];
const OPENED_EMAIL_STATUSES = ["Opened", ...ENGAGED_EMAIL_STATUSES];
const CRM_STAGE_POINTS = { New: 0, Qualified: 5, Proposal: 10, Negotiation: 15, Won: 0, Lost: 0 };

function isOpenedEmail(activity: SmartLeadActivity) {
  return activity.channel === "Email" &&
    OPENED_EMAIL_STATUSES.includes(activity.status);
}

function getSignalChannel(activity: SmartLeadActivity) {
  if (activity.type === "meeting") {
    if (!["Confirmed", "Completed"].includes(activity.status)) return;
    if (activity.channel === "In-person") return "offline";
    if (activity.channel === "Google Meet") return "online";
  }
  if (activity.type === "call" && activity.status === "Completed") return "offline";
  if (activity.type === "signal" || activity.type === "visit" ||
    (activity.type === "email" && (isOpenedEmail(activity) || activity.status === "Signed"))) {
    return "online";
  }
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : null;
}

interface AccountRecords {
  businessId: string;
  company: string;
  lead?: SmartLead;
  crm: CrmRecord[];
  social: Signal[];
}

export function buildKeyBusinessAccounts(
  businesses: readonly OnboardedBusiness[],
  crm: readonly CrmRecord[],
  social: readonly Signal[],
) {
  const clients = new Map(businesses.map((business) => [business.id, business.company]));
  const records = new Map<string, AccountRecords>();

  function accountFor(businessId: string, company: string) {
    const normalized = company.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const id = JSON.stringify([businessId, normalized]);
    const existing = records.get(id);
    if (existing) return existing;
    const account: AccountRecords = { businessId, company, crm: [], social: [] };
    records.set(id, account);
    return account;
  }

  for (const business of businesses) {
    for (const lead of business.prospects) {
      const account = accountFor(business.id, lead.company);
      if (!account.lead || lead.fitScore > account.lead.fitScore) account.lead = lead;
    }
  }
  for (const record of crm) {
    if (!record.archived && !record.duplicateOf && clients.has(record.businessId)) {
      accountFor(record.businessId, record.company).crm.push(record);
    }
  }
  for (const signal of social) {
    if (signal.status !== "Suppressed" && signal.issue !== "Possible duplicate" && clients.has(signal.businessId)) {
      accountFor(signal.businessId, signal.company).social.push(signal);
    }
  }

  return Array.from(records, ([id, { businessId, company, lead, crm, social }]) => {
    const primaryDeal = crm
      .filter(isOpen)
      .sort((a, b) => b.value - a.value || CRM_STAGE_POINTS[b.stage] - CRM_STAGE_POINTS[a.stage])[0];
    const contact = lead?.primaryContact ?? crm.find((record) => record.email) ?? crm[0];
    const activities = lead?.activities ?? [];
    const emails = activities.filter((activity) => activity.type === "email");
    const trackedEmails = emails.filter((activity) => activity.channel === "Email");
    const touchPoints = activities.filter(({ type }) => type === "email" || type === "meeting" || type === "call");
    const onlineActivities = activities.filter((activity) => getSignalChannel(activity) === "online");
    const offlineActivities = activities.filter((activity) => getSignalChannel(activity) === "offline");
    const onlineCount = onlineActivities.length + social.length;
    const offlineCount = offlineActivities.length;
    const onlinePercent = percent(onlineCount, onlineCount + offlineCount);
    const signalStrength = Math.max(0, ...social.map((signal) => signal.score));

    const daily = Array.from({ length: 14 }, (_, index) => {
      const day = 13 - index;
      const items = touchPoints.filter((activity) => sampleActivityAge(activity.time) === day);
      return {
        day,
        touches: items.length,
        opens: items.filter(isOpenedEmail).length,
        meetings: items.filter((activity) => activity.type === "meeting").length,
      };
    });

    return {
      id,
      businessId,
      client: clients.get(businessId) ?? businessId,
      company,
      lead,
      contactName: contact && ("name" in contact ? contact.name : contact.contact),
      contactRole: contact && ("title" in contact ? contact.title : contact.role),
      email: contact?.email,
      description: lead
        ? `${lead.industry} business based in ${lead.location} with ${lead.employees} employees.`
        : social[0]?.reason ?? primaryDeal?.nextAction,
      sources: ACCOUNT_SOURCES.filter((source) =>
        source === "CRM" ? crm.length : source === "Leads" ? lead : social.length,
      ),
      opportunityValue: primaryDeal?.value ?? 0,
      opportunityLabel: primaryDeal && money(primaryDeal.value, true),
      stage: primaryDeal?.stage,
      fitScore: lead?.fitScore ?? null,
      relevance: (lead?.fitScore ?? 0) * 0.6 + signalStrength * 0.25 +
        (primaryDeal ? CRM_STAGE_POINTS[primaryDeal.stage] + Math.min(primaryDeal.value / 5000, 12) : 0) +
        Math.min(onlineCount + offlineCount, 5),
      emailsSent: lead ? emails.length : null,
      averageOpenRate: percent(trackedEmails.filter(isOpenedEmail).length, trackedEmails.length),
      engagementRate: percent(emails.filter((email) => ENGAGED_EMAIL_STATUSES.includes(email.status)).length, emails.length),
      onlinePercent,
      offlinePercent: onlinePercent === null ? null : 100 - onlinePercent,
      onlineEvidence: [
        ...social.map((signal) => ({ id: signal.id, title: signal.title, source: signal.source })),
        ...onlineActivities.map((activity) => ({ id: activity.id, title: activity.title, source: activity.channel })),
      ],
      offlineEvidence: offlineActivities.map((activity) => ({ id: activity.id, title: activity.title, source: activity.channel })),
      daily,
    };
  }).sort((a, b) => b.relevance - a.relevance || a.company.localeCompare(b.company) || a.id.localeCompare(b.id));
}

export type KeyBusinessAccount = ReturnType<typeof buildKeyBusinessAccounts>[number];
