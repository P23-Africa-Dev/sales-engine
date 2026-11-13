"use client";

import seed from "@/data/data.json";

export type VisitClassification =
  | "client_visit"
  | "merchant_onboarding"
  | "follow_up"
  | "prospecting";

export type DayOfWeekShort = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type EnrichedVisitStop = {
  id: number;
  sequence: number;
  userId: number;
  agentName: string;
  territoryName: string;
  territoryColor: string;
  businessName: string;
  address: string;
  latitude: number;
  longitude: number;
  classification: VisitClassification;
  durationSeconds: number;
  arrivedAt: string;
  departedAt: string;
  outcome: string;
  verifiedOnSite: boolean;
  dealValueNgn: number;
  weekId: string;
  monthId: string;
  dayOfWeek: DayOfWeekShort;
};

export type DailyVisitBreakdown = {
  day: DayOfWeekShort;
  dateLabel: string;
  visits: number;
  distanceKm: number;
  activeHours: number;
  stops: EnrichedVisitStop[];
};

export type AgentWeeklyBreakdown = {
  userId: number;
  agentName: string;
  territoryName: string;
  color: string;
  visits: number;
  targetVisits: number;
  distanceKm: number;
  activeHours: number;
  efficiencyPct: number;
  coveragePct: number;
  stops: EnrichedVisitStop[];
  polyline: [number, number][];
};

export type WeeklyActivityRecord = {
  weekId: string;
  weekNumber: number;
  label: string;
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  weeksAgo: number;
  monthId: string;
  status: "active" | "archived";
  eligibleForArchive: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  totalVisits: number;
  targetVisits: number;
  totalDistanceKm: number;
  activeHours: number;
  travelEfficiencyPct: number;
  coveragePct: number;
  dailyBreakdown: DailyVisitBreakdown[];
  agentBreakdown: AgentWeeklyBreakdown[];
};

export type AgentMonthlySummary = {
  userId: number;
  agentName: string;
  territoryName: string;
  color: string;
  visits: number;
  quota: number;
  uniqueClients: number;
  distanceKm: number;
  fieldHours: number;
  travelEfficiencyPct: number;
  coveragePct: number;
  onTimeDays: number;
  totalWorkDays: number;
  lateCount: number;
  pipelineInfluencedNgn: number;
  topClientVisited: string;
  byClassification: Record<VisitClassification, number>;
};

export type MonthlyActivitySummary = {
  monthId: string;
  label: string;
  shortLabel: string;
  totalVisits: number;
  targetVisits: number;
  uniqueBusinessesVisited: number;
  totalDistanceKm: number;
  totalFieldHours: number;
  avgVisitsPerAgentDay: number;
  meanCoveragePct: number;
  punctualityRatePct: number;
  totalPipelineInfluencedNgn: number;
  byClassification: Record<VisitClassification, number>;
  agentSummaries: AgentMonthlySummary[];
};

export type CoverageHealthTier = "high" | "moderate" | "low";

export type TerritoryCoverageMetrics = {
  userId: number;
  agentName: string;
  territoryName: string;
  agentColor: string;
  assignedAreaKm2: number;
  coveredAreaKm2: number;
  coveragePct: number;
  healthTier: CoverageHealthTier;
  healthColor: string;
  healthLabel: string;
  visitsThisWeek: number;
  targetVisits: number;
  totalBusinessesInZone: number;
  visitedBusinessesInZone: number;
  uncoveredGapHint: string;
};

export const CLASSIFICATION_META: Record<
  VisitClassification,
  { label: string; color: string; bgClass: string; textClass: string }
> = {
  client_visit: {
    label: "Client Visit",
    color: "#0EA5E9",
    bgClass: "bg-sky-50 border-sky-200",
    textClass: "text-sky-700",
  },
  merchant_onboarding: {
    label: "Merchant Onboarding",
    color: "#10B981",
    bgClass: "bg-emerald-50 border-emerald-200",
    textClass: "text-emerald-700",
  },
  follow_up: {
    label: "Follow-Up",
    color: "#F59E0B",
    bgClass: "bg-amber-50 border-amber-200",
    textClass: "text-amber-700",
  },
  prospecting: {
    label: "Prospecting",
    color: "#8B5CF6",
    bgClass: "bg-violet-50 border-violet-200",
    textClass: "text-violet-700",
  },
};

export const COVERAGE_HEALTH_META: Record<
  CoverageHealthTier,
  { label: string; color: string; badgeClass: string }
> = {
  high: {
    label: "Optimal Coverage (≥75%)",
    color: "#10B981",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  moderate: {
    label: "Moderate Coverage (50–74%)",
    color: "#F59E0B",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  low: {
    label: "Undercovered (<50%)",
    color: "#EF4444",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

type AgentSeedDescriptor = {
  userId: number;
  agentName: string;
  territoryName: string;
  zone: string;
  color: string;
  assignedAreaKm2: number;
  coveredAreaKm2: number;
  coveragePct: number;
  healthTier: CoverageHealthTier;
  uncoveredGapHint: string;
  businesses: Array<{
    name: string;
    address: string;
    lat: number;
    lng: number;
    classification: VisitClassification;
    dealValueNgn: number;
    outcome: string;
  }>;
  baseRoute: [number, number][];
};

export const DEMO_AGENT_DESCRIPTORS: AgentSeedDescriptor[] = [
  {
    userId: 9,
    agentName: "Musa Danjuma",
    territoryName: "Victoria Island Territory",
    zone: "Victoria Island",
    color: "#2AE9C9",
    assignedAreaKm2: 14.8,
    coveredAreaKm2: 12.4,
    coveragePct: 84,
    healthTier: "high",
    uncoveredGapHint: "Strong coverage across Adeola Odeku & Ahmadu Bello Way; minor gap near Oniru eastern border.",
    baseRoute: [
      [3.402639, 6.415354],
      [3.404356, 6.417523],
      [3.406771, 6.418675],
      [3.410572, 6.421273],
      [3.413351, 6.421811],
      [3.416678, 6.424836],
      [3.41966, 6.425818],
      [3.422574, 6.427073],
      [3.425951, 6.421385],
      [3.417349, 6.439668],
    ],
    businesses: [
      {
        name: "Paystack Ventures HQ",
        address: "4 Adeola Odeku St, Victoria Island, Lagos",
        lat: 6.439668,
        lng: 3.417349,
        classification: "client_visit",
        dealValueNgn: 14500000,
        outcome: "Completed · Enterprise Renewal Signed",
      },
      {
        name: "TradeDepot Wholesale",
        address: "12 Akin Adesola St, Victoria Island, Lagos",
        lat: 6.43139,
        lng: 3.41601,
        classification: "merchant_onboarding",
        dealValueNgn: 9200000,
        outcome: "Verified On-Site · POS Fleet Activated",
      },
      {
        name: "Cape Solar Holdings",
        address: "37 Adeola Odeku St, Victoria Island, Lagos",
        lat: 6.421385,
        lng: 3.425951,
        classification: "follow_up",
        dealValueNgn: 18400000,
        outcome: "Proposal Reviewed · CFO Sign-off Pending",
      },
      {
        name: "Zenith Corporate Tower",
        address: "Plot 84 Ajose Adeogun St, Victoria Island, Lagos",
        lat: 6.427073,
        lng: 3.422574,
        classification: "client_visit",
        dealValueNgn: 22000000,
        outcome: "Completed · Multi-Branch Rollout Approved",
      },
      {
        name: "Eko Atlantic Commercial Hub",
        address: "Ahmadu Bello Way, Victoria Island, Lagos",
        lat: 6.418675,
        lng: 3.406771,
        classification: "prospecting",
        dealValueNgn: 7800000,
        outcome: "Discovery Completed · Demo Scheduled",
      },
      {
        name: "Civic Towers Trade Partners",
        address: "Ozumba Mbadiwe Ave, Victoria Island, Lagos",
        lat: 6.424836,
        lng: 3.416678,
        classification: "follow_up",
        dealValueNgn: 11300000,
        outcome: "Contract Redlines Cleared",
      },
    ],
  },
  {
    userId: 10,
    agentName: "Chioma Eze",
    territoryName: "Ikeja GRA Territory",
    zone: "Ikeja GRA",
    color: "#6B5BD2",
    assignedAreaKm2: 16.2,
    coveredAreaKm2: 12.8,
    coveragePct: 79,
    healthTier: "high",
    uncoveredGapHint: "High density around Isaac John & Joel Ogunnaike; Opebi link corridor scheduled for Friday.",
    baseRoute: [
      [3.329229, 6.570733],
      [3.333905, 6.573192],
      [3.336395, 6.57483],
      [3.337658, 6.576149],
      [3.340891, 6.578146],
      [3.344912, 6.579671],
      [3.348674, 6.582383],
      [3.351035, 6.583161],
      [3.355261, 6.592273],
    ],
    businesses: [
      {
        name: "Andela Talent Hub",
        address: "29 Isaac John St, Ikeja GRA, Lagos",
        lat: 6.575183,
        lng: 3.345581,
        classification: "client_visit",
        dealValueNgn: 12600000,
        outcome: "Completed · Q4 Seat Expansion Confirmed",
      },
      {
        name: "Bolt Fleet NG",
        address: "11 Isaac John St, Ikeja GRA, Lagos",
        lat: 6.592273,
        lng: 3.355261,
        classification: "merchant_onboarding",
        dealValueNgn: 15800000,
        outcome: "KYC Completed · 120 Fleet Terminals Linked",
      },
      {
        name: "Zenith Insure Direct",
        address: "21 Joel Ogunnaike St, Ikeja GRA, Lagos",
        lat: 6.593539,
        lng: 3.354717,
        classification: "follow_up",
        dealValueNgn: 9400000,
        outcome: "Technical Integration Scoped",
      },
      {
        name: "Moniepoint SME Center",
        address: "40 Ikorodu Rd, Maryland / Ikeja, Lagos",
        lat: 6.580565,
        lng: 3.369851,
        classification: "client_visit",
        dealValueNgn: 19500000,
        outcome: "Completed · Tier-1 SLA Upgraded",
      },
      {
        name: "Sheraton Commercial Plaza",
        address: "30 Mobolaji Bank Anthony Way, Ikeja, Lagos",
        lat: 6.578146,
        lng: 3.340891,
        classification: "prospecting",
        dealValueNgn: 6400000,
        outcome: "Decision Maker Met · Pricing Sent",
      },
    ],
  },
  {
    userId: 11,
    agentName: "Kunle Adeyemi",
    territoryName: "Surulere Territory",
    zone: "Surulere",
    color: "#E0A100",
    assignedAreaKm2: 15.5,
    coveredAreaKm2: 10.4,
    coveragePct: 67,
    healthTier: "moderate",
    uncoveredGapHint: "Adeniran Ogunsanya & Bode Thomas well covered; Western Ijesha sector needs 4 additional visits.",
    baseRoute: [
      [3.331528, 6.49343],
      [3.333458, 6.495835],
      [3.336193, 6.49714],
      [3.338788, 6.497703],
      [3.341835, 6.5007],
      [3.345509, 6.50188],
      [3.348969, 6.503537],
      [3.351054, 6.505008],
      [3.348845, 6.508044],
    ],
    businesses: [
      {
        name: "Flutterwave Merchant Labs",
        address: "17 Adeniran Ogunsanya St, Surulere, Lagos",
        lat: 6.508044,
        lng: 3.348845,
        classification: "client_visit",
        dealValueNgn: 16200000,
        outcome: "Completed · Settlement API Live",
      },
      {
        name: "MTN Enterprise Solutions",
        address: "6 Adeniran Ogunsanya St, Surulere, Lagos",
        lat: 6.50692,
        lng: 3.341812,
        classification: "follow_up",
        dealValueNgn: 21000000,
        outcome: "Proposal Reviewed · Procurement Stage",
      },
      {
        name: "Bode Thomas Retail Hub",
        address: "48 Bode Thomas St, Surulere, Lagos",
        lat: 6.497703,
        lng: 3.338788,
        classification: "merchant_onboarding",
        dealValueNgn: 7500000,
        outcome: "Verified On-Site · 18 Outlets Onboarded",
      },
      {
        name: "Leisure Mall Distributors",
        address: "Adeniran Ogunsanya Mall, Surulere, Lagos",
        lat: 6.49343,
        lng: 3.331528,
        classification: "prospecting",
        dealValueNgn: 5800000,
        outcome: "Initial Audit Completed",
      },
      {
        name: "Stadium Corridor Logistics",
        address: "Funsho Williams Ave, Surulere, Lagos",
        lat: 6.503537,
        lng: 3.348969,
        classification: "client_visit",
        dealValueNgn: 8900000,
        outcome: "Completed · Quarterly Account Review",
      },
    ],
  },
  {
    userId: 12,
    agentName: "Blessing Okoro",
    territoryName: "Ajah Territory",
    zone: "Ajah",
    color: "#E85D9A",
    assignedAreaKm2: 18.4,
    coveredAreaKm2: 8.1,
    coveragePct: 44,
    healthTier: "low",
    uncoveredGapHint: "Undercovered in northern Abraham Adesanya & Sangotedo extension — recommend route reallocation.",
    baseRoute: [
      [3.565783, 6.457112],
      [3.567657, 6.460107],
      [3.569461, 6.461124],
      [3.573529, 6.462578],
      [3.577057, 6.464564],
      [3.580427, 6.466905],
      [3.583657, 6.469283],
      [3.585726, 6.468935],
      [3.587015, 6.477522],
    ],
    businesses: [
      {
        name: "Interswitch Retail Ajah",
        address: "3 Lekki-Epe Expressway, Ajah, Lagos",
        lat: 6.477522,
        lng: 3.587015,
        classification: "client_visit",
        dealValueNgn: 13400000,
        outcome: "Completed · Terminal Batch Delivered",
      },
      {
        name: "Safaricom Business Partner",
        address: "35 Lekki-Epe Expressway, Ajah, Lagos",
        lat: 6.460617,
        lng: 3.573626,
        classification: "follow_up",
        dealValueNgn: 10800000,
        outcome: "Follow-Up Scheduled with Regional Director",
      },
      {
        name: "Lekki County Trade Mart",
        address: "Ikota Shopping Complex, Ajah, Lagos",
        lat: 6.457112,
        lng: 3.565783,
        classification: "merchant_onboarding",
        dealValueNgn: 6900000,
        outcome: "KYC Completed · Live Transaction Tested",
      },
      {
        name: "Abraham Adesanya Plaza",
        address: "Abraham Adesanya Roundabout, Ajah, Lagos",
        lat: 6.469283,
        lng: 3.583657,
        classification: "prospecting",
        dealValueNgn: 5200000,
        outcome: "Lead Qualified · Sample Kit Left",
      },
    ],
  },
  {
    userId: 13,
    agentName: "Ibrahim Sule",
    territoryName: "Apapa Territory",
    zone: "Apapa",
    color: "#42A8A1",
    assignedAreaKm2: 13.6,
    coveredAreaKm2: 9.8,
    coveragePct: 72,
    healthTier: "moderate",
    uncoveredGapHint: "Wharf Rd & Creek Rd port terminals covered; Tin Can Island west dock scheduled next.",
    baseRoute: [
      [3.339962, 6.437169],
      [3.342337, 6.438527],
      [3.344917, 6.43992],
      [3.347039, 6.441469],
      [3.350711, 6.443412],
      [3.353285, 6.44463],
      [3.357506, 6.447427],
      [3.360807, 6.448567],
      [3.370951, 6.458952],
    ],
    businesses: [
      {
        name: "Helium Health Logistics",
        address: "44 Wharf Rd, Apapa, Lagos",
        lat: 6.458952,
        lng: 3.370951,
        classification: "client_visit",
        dealValueNgn: 17100000,
        outcome: "Completed · Cold-Chain Telemetry Signed",
      },
      {
        name: "NordTech Solutions GmbH",
        address: "33 Wharf Rd, Apapa, Lagos",
        lat: 6.443346,
        lng: 3.354224,
        classification: "client_visit",
        dealValueNgn: 24500000,
        outcome: "Completed · Industrial Supply Contract Won",
      },
      {
        name: "Apapa Port Freight Terminal",
        address: "Creek Rd, Apapa Quays, Lagos",
        lat: 6.437169,
        lng: 3.339962,
        classification: "merchant_onboarding",
        dealValueNgn: 11900000,
        outcome: "Verified On-Site · Customs Desk Activated",
      },
      {
        name: "Atlantic Maritime Clearing",
        address: "18 Warehouse Rd, Apapa, Lagos",
        lat: 6.44463,
        lng: 3.353285,
        classification: "follow_up",
        dealValueNgn: 8600000,
        outcome: "Invoice Approved · Deployment Next Week",
      },
      {
        name: "Tin Can Bonded Terminal",
        address: "Tin Can Island Express, Apapa, Lagos",
        lat: 6.448567,
        lng: 3.360807,
        classification: "prospecting",
        dealValueNgn: 9500000,
        outcome: "Site Survey Completed",
      },
    ],
  },
];

const DAYS_OF_WEEK: DayOfWeekShort[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WEEK_DEFINITIONS: Array<{
  weekId: string;
  weekNumber: number;
  label: string;
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  weeksAgo: number;
  monthId: string;
  defaultStatus: "active" | "archived";
  eligibleForArchive: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  scaleFactor: number;
}> = [
  {
    weekId: "2026-W46",
    weekNumber: 46,
    label: "Week 46 (Current)",
    dateRangeLabel: "Nov 9 – Nov 15, 2026",
    startDate: "2026-11-09",
    endDate: "2026-11-15",
    weeksAgo: 0,
    monthId: "2026-11",
    defaultStatus: "active",
    eligibleForArchive: false,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    scaleFactor: 1.0,
  },
  {
    weekId: "2026-W45",
    weekNumber: 45,
    label: "Week 45",
    dateRangeLabel: "Nov 2 – Nov 8, 2026",
    startDate: "2026-11-02",
    endDate: "2026-11-08",
    weeksAgo: 1,
    monthId: "2026-11",
    defaultStatus: "active",
    eligibleForArchive: false,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    scaleFactor: 1.08,
  },
  {
    weekId: "2026-W44",
    weekNumber: 44,
    label: "Week 44",
    dateRangeLabel: "Oct 26 – Nov 1, 2026",
    startDate: "2026-10-26",
    endDate: "2026-11-01",
    weeksAgo: 2,
    monthId: "2026-10",
    defaultStatus: "active",
    eligibleForArchive: false,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    scaleFactor: 0.96,
  },
  {
    weekId: "2026-W43",
    weekNumber: 43,
    label: "Week 43",
    dateRangeLabel: "Oct 19 – Oct 25, 2026",
    startDate: "2026-10-19",
    endDate: "2026-10-25",
    weeksAgo: 3,
    monthId: "2026-10",
    defaultStatus: "active",
    eligibleForArchive: false,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    scaleFactor: 1.04,
  },
  {
    weekId: "2026-W42",
    weekNumber: 42,
    label: "Week 42",
    dateRangeLabel: "Oct 12 – Oct 18, 2026",
    startDate: "2026-10-12",
    endDate: "2026-10-18",
    weeksAgo: 4,
    monthId: "2026-10",
    defaultStatus: "active",
    eligibleForArchive: true,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    scaleFactor: 0.92,
  },
  {
    weekId: "2026-W41",
    weekNumber: 41,
    label: "Week 41",
    dateRangeLabel: "Oct 5 – Oct 11, 2026",
    startDate: "2026-10-05",
    endDate: "2026-10-11",
    weeksAgo: 5,
    monthId: "2026-10",
    defaultStatus: "active",
    eligibleForArchive: true,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    scaleFactor: 0.89,
  },
  {
    weekId: "2026-W40",
    weekNumber: 40,
    label: "Week 40",
    dateRangeLabel: "Sep 28 – Oct 4, 2026",
    startDate: "2026-09-28",
    endDate: "2026-10-04",
    weeksAgo: 6,
    monthId: "2026-09",
    defaultStatus: "archived",
    eligibleForArchive: true,
    archivedAt: "2026-11-02T09:15:00.000000Z",
    archivedBy: "Elijah Obominuru",
    archiveReason: "Scheduled 4-week retention policy",
    scaleFactor: 0.94,
  },
  {
    weekId: "2026-W39",
    weekNumber: 39,
    label: "Week 39",
    dateRangeLabel: "Sep 21 – Sep 27, 2026",
    startDate: "2026-09-21",
    endDate: "2026-09-27",
    weeksAgo: 7,
    monthId: "2026-09",
    defaultStatus: "archived",
    eligibleForArchive: true,
    archivedAt: "2026-10-26T08:40:00.000000Z",
    archivedBy: "Elijah Obominuru",
    archiveReason: "Scheduled 4-week retention policy",
    scaleFactor: 0.87,
  },
];

function buildStopsForAgentWeek(
  agent: AgentSeedDescriptor,
  weekId: string,
  monthId: string,
  startDateIso: string,
  weekIndex: number
): EnrichedVisitStop[] {
  const stops: EnrichedVisitStop[] = [];
  let seq = 1;
  const baseDate = new Date(`${startDateIso}T08:30:00.000Z`);

  // Generate 8 to 14 realistic stops across Mon-Sat for this agent in this week
  const visitCount = Math.max(6, agent.businesses.length * 2 - (weekIndex % 3));
  for (let i = 0; i < visitCount; i++) {
    const biz = agent.businesses[i % agent.businesses.length];
    const dayIdx = i % 6; // Mon..Sat
    const dayOfWeek = DAYS_OF_WEEK[dayIdx];
    const jitterLat = ((i * 17 + weekIndex * 7) % 11 - 5) * 0.00045;
    const jitterLng = ((i * 23 + weekIndex * 13) % 11 - 5) * 0.00045;

    const visitStart = new Date(
      baseDate.getTime() +
        dayIdx * 24 * 3600_000 +
        (i % 3) * 2.2 * 3600_000 +
        (agent.userId - 9) * 12 * 60_000
    );
    const durationSeconds = 1200 + ((i * 310 + agent.userId * 150) % 1800); // 20m - 50m
    const visitEnd = new Date(visitStart.getTime() + durationSeconds * 1000);

    stops.push({
      id: Number(`${weekIndex + 1}${agent.userId}${String(seq).padStart(2, "0")}`),
      sequence: seq,
      userId: agent.userId,
      agentName: agent.agentName,
      territoryName: agent.territoryName,
      territoryColor: agent.color,
      businessName: biz.name,
      address: biz.address,
      latitude: Number((biz.lat + jitterLat).toFixed(6)),
      longitude: Number((biz.lng + jitterLng).toFixed(6)),
      classification: biz.classification,
      durationSeconds,
      arrivedAt: visitStart.toISOString(),
      departedAt: visitEnd.toISOString(),
      outcome: biz.outcome,
      verifiedOnSite: i % 7 !== 5,
      dealValueNgn: biz.dealValueNgn,
      weekId,
      monthId,
      dayOfWeek,
    });
    seq += 1;
  }

  return stops;
}

let cachedWeeklyRecords: WeeklyActivityRecord[] | null = null;

export function getInitialWeeklyActivityRecords(): WeeklyActivityRecord[] {
  if (cachedWeeklyRecords) return cachedWeeklyRecords;

  cachedWeeklyRecords = WEEK_DEFINITIONS.map((weekDef, weekIdx) => {
    const agentBreakdown: AgentWeeklyBreakdown[] = DEMO_AGENT_DESCRIPTORS.map(
      (agent, agentIdx) => {
        const stops = buildStopsForAgentWeek(
          agent,
          weekDef.weekId,
          weekDef.monthId,
          weekDef.startDate,
          weekIdx
        );
        const visits = stops.length;
        const targetVisits = 12;
        const distanceKm = Number(
          ((38 + agentIdx * 6.4) * weekDef.scaleFactor).toFixed(1)
        );
        const activeHours = Number(
          ((31 + agentIdx * 2.3) * weekDef.scaleFactor).toFixed(1)
        );
        const efficiencyPct = Math.min(
          94,
          Math.max(58, Math.round(76 + (agentIdx % 3) * 5 - weekIdx * 1.2))
        );
        const coveragePct = Math.min(
          96,
          Math.max(
            38,
            Math.round(agent.coveragePct * (0.94 + (weekIdx % 3) * 0.03))
          )
        );

        return {
          userId: agent.userId,
          agentName: agent.agentName,
          territoryName: agent.territoryName,
          color: agent.color,
          visits,
          targetVisits,
          distanceKm,
          activeHours,
          efficiencyPct,
          coveragePct,
          stops,
          polyline: agent.baseRoute,
        };
      }
    );

    const allWeekStops = agentBreakdown.flatMap((a) => a.stops);
    const startObj = new Date(`${weekDef.startDate}T00:00:00Z`);

    const dailyBreakdown: DailyVisitBreakdown[] = DAYS_OF_WEEK.map(
      (day, dayIdx) => {
        const d = new Date(startObj.getTime() + dayIdx * 24 * 3600_000);
        const dateLabel = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        const dayStops = allWeekStops.filter((s) => s.dayOfWeek === day);
        const distanceKm =
          dayStops.length > 0
            ? Number((dayStops.length * 4.2 + (dayIdx % 3) * 2.1).toFixed(1))
            : 0;
        const activeHours =
          dayStops.length > 0
            ? Number((dayStops.length * 1.35).toFixed(1))
            : 0;
        return {
          day,
          dateLabel,
          visits: dayStops.length,
          distanceKm,
          activeHours,
          stops: dayStops,
        };
      }
    );

    const totalVisits = agentBreakdown.reduce((acc, a) => acc + a.visits, 0);
    const targetVisits = agentBreakdown.reduce(
      (acc, a) => acc + a.targetVisits,
      0
    );
    const totalDistanceKm = Number(
      agentBreakdown.reduce((acc, a) => acc + a.distanceKm, 0).toFixed(1)
    );
    const activeHours = Number(
      agentBreakdown.reduce((acc, a) => acc + a.activeHours, 0).toFixed(1)
    );
    const travelEfficiencyPct = Math.round(
      agentBreakdown.reduce((acc, a) => acc + a.efficiencyPct, 0) /
        agentBreakdown.length
    );
    const coveragePct = Math.round(
      agentBreakdown.reduce((acc, a) => acc + a.coveragePct, 0) /
        agentBreakdown.length
    );

    return {
      weekId: weekDef.weekId,
      weekNumber: weekDef.weekNumber,
      label: weekDef.label,
      dateRangeLabel: weekDef.dateRangeLabel,
      startDate: weekDef.startDate,
      endDate: weekDef.endDate,
      weeksAgo: weekDef.weeksAgo,
      monthId: weekDef.monthId,
      status: weekDef.defaultStatus,
      eligibleForArchive: weekDef.eligibleForArchive,
      archivedAt: weekDef.archivedAt,
      archivedBy: weekDef.archivedBy,
      archiveReason: weekDef.archiveReason,
      totalVisits,
      targetVisits,
      totalDistanceKm,
      activeHours,
      travelEfficiencyPct,
      coveragePct,
      dailyBreakdown,
      agentBreakdown,
    };
  });

  return cachedWeeklyRecords;
}

export function getMonthlyActivitySummaries(): MonthlyActivitySummary[] {
  const months: Array<{
    monthId: string;
    label: string;
    shortLabel: string;
    multiplier: number;
    workDays: number;
  }> = [
    {
      monthId: "2026-11",
      label: "November 2026 (MTD)",
      shortLabel: "Nov 2026",
      multiplier: 1.0,
      workDays: 14,
    },
    {
      monthId: "2026-10",
      label: "October 2026",
      shortLabel: "Oct 2026",
      multiplier: 1.85,
      workDays: 22,
    },
    {
      monthId: "2026-09",
      label: "September 2026",
      shortLabel: "Sep 2026",
      multiplier: 1.72,
      workDays: 21,
    },
  ];

  return months.map((m, mIdx) => {
    const agentSummaries: AgentMonthlySummary[] = DEMO_AGENT_DESCRIPTORS.map(
      (agent, aIdx) => {
        const visits = Math.round((24 + aIdx * 3) * m.multiplier);
        const quota = Math.round(26 * m.multiplier);
        const uniqueClients = Math.max(
          5,
          Math.round(visits * 0.68)
        );
        const distanceKm = Number(
          ((94 + aIdx * 14.5) * m.multiplier).toFixed(1)
        );
        const fieldHours = Number(
          ((68 + aIdx * 5.5) * m.multiplier).toFixed(1)
        );
        const travelEfficiencyPct = Math.min(
          93,
          Math.max(64, 82 - mIdx * 2 + (aIdx % 3) * 3)
        );
        const coveragePct = Math.min(
          95,
          Math.max(44, agent.coveragePct - mIdx * 3)
        );
        const lateCount = aIdx === 3 ? 2 + mIdx : aIdx % 2 === 0 ? 0 : 1;
        const onTimeDays = Math.max(1, m.workDays - lateCount);
        const pipelineInfluencedNgn = Math.round(
          agent.businesses.reduce((s, b) => s + b.dealValueNgn, 0) *
            (0.75 + m.multiplier * 0.45)
        );

        const cVisit = Math.round(visits * 0.44);
        const mOnboard = Math.round(visits * 0.24);
        const fUp = Math.round(visits * 0.2);
        const prosp = Math.max(1, visits - cVisit - mOnboard - fUp);

        return {
          userId: agent.userId,
          agentName: agent.agentName,
          territoryName: agent.territoryName,
          color: agent.color,
          visits,
          quota,
          uniqueClients,
          distanceKm,
          fieldHours,
          travelEfficiencyPct,
          coveragePct,
          onTimeDays,
          totalWorkDays: m.workDays,
          lateCount,
          pipelineInfluencedNgn,
          topClientVisited: agent.businesses[0]?.name ?? "Key Account",
          byClassification: {
            client_visit: cVisit,
            merchant_onboarding: mOnboard,
            follow_up: fUp,
            prospecting: prosp,
          },
        };
      }
    );

    const totalVisits = agentSummaries.reduce((s, a) => s + a.visits, 0);
    const targetVisits = agentSummaries.reduce((s, a) => s + a.quota, 0);
    const uniqueBusinessesVisited = agentSummaries.reduce(
      (s, a) => s + a.uniqueClients,
      0
    );
    const totalDistanceKm = Number(
      agentSummaries.reduce((s, a) => s + a.distanceKm, 0).toFixed(1)
    );
    const totalFieldHours = Number(
      agentSummaries.reduce((s, a) => s + a.fieldHours, 0).toFixed(1)
    );
    const avgVisitsPerAgentDay = Number(
      (totalVisits / (agentSummaries.length * m.workDays)).toFixed(1)
    );
    const meanCoveragePct = Math.round(
      agentSummaries.reduce((s, a) => s + a.coveragePct, 0) /
        agentSummaries.length
    );
    const totalOnTime = agentSummaries.reduce((s, a) => s + a.onTimeDays, 0);
    const totalDays = agentSummaries.reduce((s, a) => s + a.totalWorkDays, 0);
    const punctualityRatePct = Math.round((totalOnTime / totalDays) * 100);
    const totalPipelineInfluencedNgn = agentSummaries.reduce(
      (s, a) => s + a.pipelineInfluencedNgn,
      0
    );

    const byClassification: Record<VisitClassification, number> = {
      client_visit: agentSummaries.reduce(
        (s, a) => s + a.byClassification.client_visit,
        0
      ),
      merchant_onboarding: agentSummaries.reduce(
        (s, a) => s + a.byClassification.merchant_onboarding,
        0
      ),
      follow_up: agentSummaries.reduce(
        (s, a) => s + a.byClassification.follow_up,
        0
      ),
      prospecting: agentSummaries.reduce(
        (s, a) => s + a.byClassification.prospecting,
        0
      ),
    };

    return {
      monthId: m.monthId,
      label: m.label,
      shortLabel: m.shortLabel,
      totalVisits,
      targetVisits,
      uniqueBusinessesVisited,
      totalDistanceKm,
      totalFieldHours,
      avgVisitsPerAgentDay,
      meanCoveragePct,
      punctualityRatePct,
      totalPipelineInfluencedNgn,
      byClassification,
      agentSummaries,
    };
  });
}

export function getTerritoryCoverageMetrics(): TerritoryCoverageMetrics[] {
  const savedLocations =
    ((seed as unknown as { map?: { savedLocations?: Array<{ address?: string }> } })
      .map?.savedLocations ?? []);

  return DEMO_AGENT_DESCRIPTORS.map((agent) => {
    const healthMeta = COVERAGE_HEALTH_META[agent.healthTier];
    const zoneMatches = savedLocations.filter((loc) =>
      (loc.address ?? "").toLowerCase().includes(agent.zone.toLowerCase())
    ).length;
    const totalBusinessesInZone = Math.max(
      agent.businesses.length + 3,
      zoneMatches + 4
    );
    const visitedBusinessesInZone = Math.min(
      totalBusinessesInZone,
      Math.round((totalBusinessesInZone * agent.coveragePct) / 100)
    );

    return {
      userId: agent.userId,
      agentName: agent.agentName,
      territoryName: agent.territoryName,
      agentColor: agent.color,
      assignedAreaKm2: agent.assignedAreaKm2,
      coveredAreaKm2: agent.coveredAreaKm2,
      coveragePct: agent.coveragePct,
      healthTier: agent.healthTier,
      healthColor: healthMeta.color,
      healthLabel: healthMeta.label,
      visitsThisWeek: agent.businesses.length * 2,
      targetVisits: 12,
      totalBusinessesInZone,
      visitedBusinessesInZone,
      uncoveredGapHint: agent.uncoveredGapHint,
    };
  });
}

export function getAgentVisitHistory(userId: number | null): {
  stops: EnrichedVisitStop[];
  polyline: [number, number][];
  totalDistanceKm: number;
  totalDurationMins: number;
  efficiencyPct: number;
} {
  const currentWeek = getInitialWeeklyActivityRecords()[0];
  if (!currentWeek) {
    return {
      stops: [],
      polyline: [],
      totalDistanceKm: 0,
      totalDurationMins: 0,
      efficiencyPct: 0,
    };
  }

  if (userId == null) {
    const stops = currentWeek.agentBreakdown
      .flatMap((a) => a.stops)
      .sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt))
      .map((s, idx) => ({ ...s, sequence: idx + 1 }));
    const polyline = currentWeek.agentBreakdown.flatMap((a) => a.polyline);
    const totalDurationMins = Math.round(
      stops.reduce((acc, s) => acc + s.durationSeconds, 0) / 60
    );
    return {
      stops,
      polyline,
      totalDistanceKm: currentWeek.totalDistanceKm,
      totalDurationMins,
      efficiencyPct: currentWeek.travelEfficiencyPct,
    };
  }

  const agentRecord = currentWeek.agentBreakdown.find((a) => a.userId === userId);
  if (!agentRecord) {
    return {
      stops: [],
      polyline: [],
      totalDistanceKm: 0,
      totalDurationMins: 0,
      efficiencyPct: 0,
    };
  }

  const totalDurationMins = Math.round(
    agentRecord.stops.reduce((acc, s) => acc + s.durationSeconds, 0) / 60
  );

  return {
    stops: agentRecord.stops,
    polyline: agentRecord.polyline,
    totalDistanceKm: agentRecord.distanceKm,
    totalDurationMins,
    efficiencyPct: agentRecord.efficiencyPct,
  };
}
