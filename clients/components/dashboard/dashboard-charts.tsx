"use client";

import ArrowUp from "@/assets/images/arrow-57deg.png";
import { useDashboardOverview } from "@/hooks/use-dashboard";
import { useLeadPipeline, useLeads } from "@/hooks/use-crm";
import { getActiveCompanyContext } from "@/lib/company-context";
import {
  buildCalibratedLeadsTrendChart,
  hasLeadsTrendData,
  LEADS_TREND_BAR_COLORS,
} from "@/lib/dashboard-leads-chart";
import { useAuthStore } from "@/store/auth";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { TinyButton } from "../ui/tiny-button";

const activitiesData = [
  { name: "Mon", value: 30 },
  { name: "Tue", value: 25 },
  { name: "Wed", value: 40 },
  { name: "Thu", value: 35 },
  { name: "Fri", value: 55 },
  { name: "Sat", value: 45 },
  { name: "Sun", value: 60 },
];

export function MyActivitiesChart() {
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const basePath = role === "agent" ? "/agent" : "/admin";

  const { data: overview } = useDashboardOverview({
    company_id: companyId ?? undefined,
    basePath,
  });

  const metric = overview?.activity_metric;
  const activityScore = metric?.activity_score ?? 0;
  const direction = metric?.direction ?? "flat";

  const activityValue = `${activityScore > 0 ? "+" : ""}${Math.round(activityScore)}%`;

  const chartData =
    metric?.current_week_daily?.length === 7
      ? metric.current_week_daily
      : activitiesData;

  const hasData = chartData.some((item) => item.value > 0);

  const referenceLine =
    hasData
      ? Math.round(
        chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length
      )
      : 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full" />;

  return (
    <div className="bg-[#78B3B3] rounded-3xl w-full py-6 text-white h-full flex flex-col relative overflow-hidden shadow-2xl">
      <div className="flex justify-between items-start relative z-10 px-8.5">
        <div>
          <h3 className="text-white/80 text-[13px] font-bold tracking-tight">
            My Activities
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-4xl font-bold tracking-tighter leading-9">
              {activityValue}
            </span>
            <Image
              src={ArrowUp}
              alt="Arrow Up Right Icon"
              width={18}
              height={18}
              className={`self-end pb-1.5 ${direction === "down" ? "rotate-90 [filter:brightness(0)_saturate(100%)_invert(24%)_sepia(87%)_saturate(2642%)_hue-rotate(338deg)_brightness(97%)_contrast(104%)]" : ""}`}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 w-full min-h-25 mt-2 relative z-10">
        {hasData ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minHeight={0}
            minWidth={0}
          >
            <AreaChart
              data={chartData}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="white" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="white" stopOpacity={0} />
                </linearGradient>
              </defs>
              <ReferenceLine
                y={referenceLine}
                stroke="white"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="white"
                strokeWidth={4}
                fillOpacity={1}
                fill="url(#colorValue)"
                dot={false}
                activeDot={{ r: 6, fill: "white", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center">
            <div className="w-full h-0.75 rounded-full bg-white opacity-50" />
          </div>
        )}
      </div>

      {/* Decorative dashed lines spanning the card */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute left-[30%] top-0 bottom-0 border-l border-dashed border-white" />
        <div className="absolute left-0 right-0 top-[60%] border-t border-dashed border-white" />
      </div>
    </div>
  );
}

export function TotalLeadsChart() {
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const basePath = role === "agent" ? "/agent" : "/admin";
  const isAgent = role === "agent";

  const { data: overview } = useDashboardOverview({
    company_id: companyId ?? undefined,
    basePath,
  });

  const { data: pipeline, isLoading: pipelineLoading } = useLeadPipeline(
    !isAgent ? (companyId ?? undefined) : undefined,
    basePath,
  );

  const { data: agentLeads, isLoading: agentLeadsLoading } = useLeads(
    isAgent && companyId ? { company_id: companyId, source: "agent_upload", per_page: 1 } : {},
    basePath,
  );

  const totalLeads = isAgent
    ? (agentLeads?.pagination?.total ?? 0)
    : (pipeline?.total ?? overview?.kpis?.total_leads ?? 0);

  const isLoading = isAgent ? agentLeadsLoading : pipelineLoading;

  const leadsChartData = useMemo(
    () => buildCalibratedLeadsTrendChart(overview?.leads_trend ?? []),
    [overview?.leads_trend],
  );

  const hasLeadsTrend = hasLeadsTrendData(overview?.leads_trend ?? []);
  const showLeadsChart = hasLeadsTrend || (!isLoading && totalLeads > 0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full" />;

  return (
    <div className="bg-white rounded-3xl px-7 py-3.75 text-dash-dark h-full flex flex-col shadow-2xl relative">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-dash-dark text-[16px] font-semibold">
            Total Leads
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-4xl font-bold tracking-tighter">
              {isLoading ? "—" : totalLeads.toLocaleString()}
            </span>
            <span className="text-dash-dark/40 text-sm font-bold mt-2">
              {isAgent ? "My uploads" : "Leads"}
            </span>
          </div>
        </div>
        <TinyButton>View</TinyButton>
      </div>

      <div className="w-full h-10.25 mt-auto">
        {showLeadsChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={leadsChartData}
              barGap={4}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <YAxis domain={[0, "dataMax"]} hide />
              <XAxis hide padding={{ left: 0, right: 0 }} />
              <Bar
                dataKey="v1"
                fill={LEADS_TREND_BAR_COLORS.rise}
                radius={10}
                barSize={15}
              />
              <Bar
                dataKey="v2"
                fill={LEADS_TREND_BAR_COLORS.fall}
                radius={10}
                barSize={15}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center">
            <div className="w-full h-0.75 rounded-full bg-dash-dark/15" />
          </div>
        )}
      </div>
    </div>
  );
}
