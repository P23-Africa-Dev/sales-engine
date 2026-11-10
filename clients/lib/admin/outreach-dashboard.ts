export type OutreachDashboardMetric = {
  id: string;
  title: string;
  total: number | null;
  primaryLabel: string;
  secondaryLabel: string;
  primaryPercent: number | null;
  secondaryPercent: number | null;
  avatars: number;
};

export type OutreachBusiness = {
  id: string;
  name: string;
  industry: string;
  country: string;
  website: string;
  contact: string;
  owner: string;
  created: string;
  avatarColor: string;
  company: string;
  readinessPercent: number;
  pipelineValue: number;
  outreachCount: number;
  emailsSent: number | null;
  prospects: number | null;
  followUpsCompleted: number | null;
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
};

export type OutreachDashboardData = {
  source: string;
  samplePeriod: string;
  counts: { outreach: number; businesses: number };
  metrics: OutreachDashboardMetric[];
  defaultBusinessId: string | null;
  businesses: OutreachBusiness[];
  outreach: DashboardOutreach[];
};
