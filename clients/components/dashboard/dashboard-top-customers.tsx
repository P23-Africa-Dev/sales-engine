"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { FilterSelect } from "@/components/ui/filter-select";
import { useDashboardOverview } from "@/hooks/use-dashboard";
import {
  buildTopLeadsChartData,
  getLeadConversionRate,
  getTopLeadsCenterRate,
  getTopLeadsDateRange,
  TOP_LEADS_FILTER_OPTIONS,
  type TopLeadsFilter,
} from "@/lib/dashboard-top-leads";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";

const filterOptions = [...TOP_LEADS_FILTER_OPTIONS];

const avatarPalette = ["#B29D8B", "#7BB6B8", "#D086E6", "#FD6046", "#146AFA"] as const;

function formatLabel(value?: string | null) {
  if (!value) {
    return "Prospect";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function TopCustomers() {
  const [filter, setFilter] = useState<TopLeadsFilter>("Weekly");
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const basePath = role === "agent" ? "/agent" : "/admin";
  const dateRange = useMemo(() => getTopLeadsDateRange(filter), [filter]);

  const { data: overview } = useDashboardOverview({
    company_id: companyId ?? undefined,
    basePath,
    from_date: dateRange.from_date,
    to_date: dateRange.to_date,
  });

  const topProspects = useMemo(
    () => (overview?.top_prospects ?? []).slice(0, 3),
    [overview?.top_prospects],
  );

  const fallbackRate = useMemo(
    () => getLeadConversionRate(overview?.crm_pipeline_snapshot, overview?.kpis),
    [overview?.crm_pipeline_snapshot, overview?.kpis],
  );

  const chartData = useMemo(
    () => buildTopLeadsChartData(topProspects, fallbackRate),
    [topProspects, fallbackRate],
  );

  const centerRate = useMemo(
    () => getTopLeadsCenterRate(chartData),
    [chartData],
  );

  const legendItems = chartData.map((item) => ({
    id: item.id,
    name: item.name,
    fill: item.fill,
  }));

  return (
    <div className="bg-[#09232D] rounded-[20px] p-4 md:p-5 lg:p-6 flex flex-col w-full lg:w-80.75 h-auto lg:h-125 shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-white font-medium text-[14px]">Top Leads</h3>
        <FilterSelect
          value={filter}
          onChange={setFilter}
          options={filterOptions}
        />
      </div>

      {/* Radial Bar Chart */}
      <div className="relative h-48 md:h-56 lg:h-66 w-full mx-auto">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[24px] font-bold text-white mt-1">
            {centerRate}%
          </span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="35%"
            outerRadius="95%"
            barSize={16}
            data={chartData}
            startAngle={90}
            endAngle={450}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: "#0E2F3C" }}
              cornerRadius={10}
              dataKey="value"
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-3 md:mb-4 lg:mb-6.25">
        {legendItems.map((item) => (
          <div key={item.id} className="flex items-center gap-2.5">
            <div
              className="w-[14px] h-[14px] rounded-full"
              style={{ background: item.fill }}
            />
            <span className="text-[10px] font-medium text-white">
              {item.name}
            </span>
          </div>
        ))}
      </div>

      {/* Customer List */}
      <div className="flex flex-col gap-3">
        {topProspects.length === 0 ? (
          <div className="p-3 rounded-[15px] text-[11px] text-white/70 text-center bg-white/5 mt-6">
            No top prospects yet.
          </div>
        ) : (
          topProspects.map((prospect, index) => (
            <div
              key={prospect.id}
              className="flex items-center justify-between p-2 rounded-[15px] transition-colors hover:bg-[#EAEAEA] group/item cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: avatarPalette[index % avatarPalette.length] }}
                >
                  {getInitials(prospect.name)}
                </div>
                <div>
                  <p className="text-[14px] font-bold text-white leading-tight group-hover/item:text-[#041114]">
                    {prospect.name}
                  </p>
                  <p className="text-[10px] font-medium text-white group-hover/item:text-[#7E7E7E]">
                    {formatLabel(prospect.status)}
                  </p>
                </div>
              </div>
              <button className="text-white group-hover/item:text-[#34373C] p-1">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
