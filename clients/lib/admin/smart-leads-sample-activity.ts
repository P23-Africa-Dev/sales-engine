import type { OnboardedBusiness, SmartLead, SmartLeadActivity } from "./smart-leads";

type ActivityDetails = Pick<SmartLeadActivity, "type" | "title" | "channel" | "status" | "description" | "badgeColor">;

const emailTouches = [
  { title: "Capabilities overview delivered", status: "Delivered", description: "Sent an overview tailored to the account's industry." },
  { title: "Implementation guide opened", status: "Opened", description: "The prospect opened the implementation guide follow-up." },
  { title: "Case study link clicked", status: "Clicked", description: "The prospect followed a link to a relevant case study." },
  { title: "Procurement questions received", status: "Replied", description: "The prospect replied with questions about procurement and rollout." },
  { title: "Pricing overview opened", status: "Opened", description: "The prospect opened the pricing overview." },
  { title: "Pilot outline delivered", status: "Delivered", description: "Sent a pilot outline with proposed milestones." },
];

const marketSignals: ActivityDetails[] = [
  { type: "signal", title: "Vendor requirements published", channel: "Company website", status: "Detected", description: "The account posted updated supplier requirements.", badgeColor: "#c974f4" },
  { type: "signal", title: "Procurement discussion surfaced", channel: "LinkedIn", status: "Detected", description: "A public discussion mentioned the team's evaluation priorities.", badgeColor: "#c974f4" },
  { type: "signal", title: "Investment plans announced", channel: "Industry news", status: "Detected", description: "Trade coverage highlighted a planned operational investment.", badgeColor: "#c974f4" },
  { type: "visit", title: "Product comparison page viewed", channel: "Web Analytics", status: "Tracked", description: "A visit from the account reached the product comparison page.", badgeColor: "#2ae9c9" },
];

const directTouches: ActivityDetails[] = [
  { type: "call", title: "Procurement qualification call", channel: "Phone", status: "Completed", description: "Discussed procurement timing and how vendors will be shortlisted.", badgeColor: "#f59e0b" },
  { type: "meeting", title: "On-site requirements workshop", channel: "In-person", status: "Completed", description: "Met the account team to review requirements and implementation constraints.", badgeColor: "#f59e0b" },
  { type: "meeting", title: "Technical discovery session", channel: "Google Meet", status: "Completed", description: "Reviewed integration requirements and answered technical questions.", badgeColor: "#7c3aed" },
  { type: "call", title: "Follow-up on pilot timeline", channel: "Phone", status: "Completed", description: "Confirmed the account's timeline for evaluating a pilot.", badgeColor: "#f59e0b" },
];

export function sampleActivityAge(time: string) {
  if (time.startsWith("Today")) return 0;
  if (time.startsWith("Yesterday")) return 1;
  const match = /^(\d+) (day|week)s? ago$/.exec(time);
  return match ? Number(match[1]) * (match[2] === "week" ? 7 : 1) : Infinity;
}

function enrichProspect(prospect: SmartLead, seed: number): SmartLead {
  const events: SmartLeadActivity[] = [];
  function add(day: number, author: string, details: ActivityDetails) {
    events.push({
      ...details,
      id: `${prospect.id}-sample-${events.length + 1}`,
      time: day === 0 ? "Today" : day === 1 ? "Yesterday" : `${day} days ago`,
      author,
    });
  }

  marketSignals.forEach((signal, index) => {
    add((seed + index * 3) % 14, "Sample market monitoring", signal);
  });

  if (prospect.status !== "Uncontacted" && prospect.status !== "New Match") {
    for (let day = 0; day < 14; day++) {
      if ((day + seed) % 6 === 0) continue;
      const count = 1 + (day * day + seed * 2) % 3;
      for (let touch = 0; touch < count; touch++) {
        const email = emailTouches[(day + touch + seed) % emailTouches.length];
        add(day, "Sample outreach cadence", { ...email, type: "email", channel: "Email", badgeColor: "#0284c7" });
      }
    }
    const directCount = prospect.status === "In Cadence" ? 2 : 4;
    directTouches.slice(0, directCount).forEach((activity, index) => {
      add((seed + index * 3 + 1) % 14, "Sample account team", activity);
    });
  }

  return {
    ...prospect,
    activities: [...prospect.activities, ...events].sort(
      (a, b) => sampleActivityAge(a.time) - sampleActivityAge(b.time),
    ),
  };
}

export function addSampleActivity(businesses: readonly OnboardedBusiness[]) {
  return businesses.map((business, index) => ({
    ...business,
    prospects: business.prospects.map((prospect, position) => enrichProspect(prospect, index * 5 + position)),
  }));
}
