export type OutreachDashboardMetric = {
  id: string;
  title: string;
  total: number | null;
  primaryLabel: string;
  secondaryLabel: string;
  primaryPercent: number | null;
  secondaryPercent: number | null;
  avatars: number;
  primaryCount?: number | null;
  secondaryCount?: number | null;
};

export type OutreachBusiness = {
  id: string;
  name: string;
  industry: string;
  country: string;
  website: string;
  owner: string;
  created: string;
  avatarColor: string;
  leadType?: "business" | "individual";
  company: string;
  emailsSent: number | null;
  prospects: number | null;
  followUpsCompleted: number | null;
  pipeline?: string;
  pipelineIds?: string[];
  email?: string;
};

export type DashboardOutreach = {
  id: string;
  businessId: string | null;
  name: string;
  channel: string;
  status: string;
  owner: string;
  created: string;
  avatarColor: string;
  leadType?: "business" | "individual";
};

export type OutreachDashboardData = {
  source: string;
  pipelines?: Array<{ id: number; name: string }>;
  counts: { outreach: number; businesses: number };
  metrics: OutreachDashboardMetric[];
  defaultBusinessId: string | null;
  businesses: OutreachBusiness[];
  outreach: DashboardOutreach[];
};
