import type { DashboardKpis, TopProspect } from "@/lib/api/dashboard";
import type { PipelineSnapshot } from "@/lib/api/crm";

export const TOP_LEADS_FILTER_OPTIONS = ["Weekly", "Monthly", "Yearly"] as const;

export type TopLeadsFilter = (typeof TOP_LEADS_FILTER_OPTIONS)[number];

export const TOP_LEADS_RING_COLORS = ["#7BB6B8", "#146AFA", "#FD6046"] as const;

export type TopLeadsChartItem = {
  id: string;
  name: string;
  value: number;
  fill: string;
};

const LEAD_STATUS_PROGRESS: Record<string, number> = {
  new: 15,
  newly_lead: 15,
  contacted: 35,
  qualified: 55,
  proposal_sent: 75,
  won: 100,
  lost: 0,
};

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTopLeadsDateRange(
  filter: TopLeadsFilter,
  referenceDate = new Date(),
): { from_date: string; to_date: string } {
  const to = new Date(referenceDate);
  const from = new Date(referenceDate);

  switch (filter) {
    case "Weekly":
      from.setDate(to.getDate() - 6);
      break;
    case "Monthly":
      from.setDate(to.getDate() - 29);
      break;
    case "Yearly":
      from.setDate(to.getDate() - 364);
      break;
  }

  return {
    from_date: toDateKey(from),
    to_date: toDateKey(to),
  };
}

export function getLeadStatusProgress(status?: string | null): number {
  if (!status) {
    return LEAD_STATUS_PROGRESS.new;
  }

  return LEAD_STATUS_PROGRESS[status.toLowerCase()] ?? LEAD_STATUS_PROGRESS.new;
}

export function getLeadConversionRate(
  pipeline?: PipelineSnapshot,
  kpis?: Pick<DashboardKpis, "total_leads" | "converted_leads">,
): number {
  const pipelineTotal = pipeline?.total ?? 0;

  if (pipelineTotal > 0) {
    const wonCount = (pipeline?.stages ?? []).reduce((sum, stage) => {
      const status = (stage.status ?? "").toLowerCase();
      return status === "won" ? sum + stage.count : sum;
    }, 0);

    return Math.round((wonCount / pipelineTotal) * 100);
  }

  const totalLeads = kpis?.total_leads ?? 0;
  const convertedLeads = kpis?.converted_leads ?? 0;

  return totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
}

export function getTopLeadsCenterRate(chartData: TopLeadsChartItem[]): number {
  if (chartData.length === 0) {
    return 0;
  }

  return Math.max(...chartData.map((item) => item.value));
}

export function buildTopLeadsChartData(
  prospects: TopProspect[],
  conversionRate: number,
): TopLeadsChartItem[] {
  if (prospects.length === 0) {
    return TOP_LEADS_RING_COLORS.map((fill, index) => ({
      id: `placeholder-${index}`,
      name: `Lead ${index + 1}`,
      value: conversionRate,
      fill,
    }));
  }

  return prospects.slice(0, 3).map((prospect, index) => ({
    id: String(prospect.id),
    name: prospect.name,
    value: getLeadStatusProgress(prospect.status),
    fill: TOP_LEADS_RING_COLORS[index] ?? TOP_LEADS_RING_COLORS[0],
  }));
}
