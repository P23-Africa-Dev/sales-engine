"use client";

import {
  formatMonthOverlay,
  formatWeekGrowthLabel,
  getRingProgressPercent,
  getRingStrokeDasharray,
  type WeekGrowthDirection,
} from "@/lib/crm-analytics";
import type { CrmDailyTrendPoint } from "@/lib/api/crm";
import { MoreHorizontal } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TotalLeadsCardProps = {
  totalLeads?: number;
  weekGrowthPercent?: number;
  weekGrowthDirection?: WeekGrowthDirection;
  isLoading?: boolean;
};

export function TotalLeadsCard({
  totalLeads = 0,
  weekGrowthPercent = 0,
  weekGrowthDirection = "flat",
  isLoading = false,
}: TotalLeadsCardProps) {
  const ringPercent = getRingProgressPercent(weekGrowthPercent);
  const growthLabel = formatWeekGrowthLabel(weekGrowthPercent, weekGrowthDirection);

  return (
    <div className="se-stat-card bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col justify-between min-w-0 sm:min-w-85">
      <div className="flex justify-between items-start">
        <h3 className="text-[#34373C] text-sm font-medium">Total Leads in Pipeline</h3>
        {/* <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={18} />
        </button> */}
      </div>

      <div className="flex items-center gap-6 mt-4 justify-between">
        <div>
          <div className="flex gap-1.5 items-end">
            <span className="text-[50px] font-medium text-[#0B1215] leading-none tracking-tight">
              {isLoading ? "—" : totalLeads.toLocaleString()}
            </span>
            <span className="text-[#34373C] text-[15px] font-semibold mb-1">Leads</span>
          </div>
          <p className="text-[#34373C] text-[14px] mt-1.5">
            {isLoading ? "Loading trend…" : growthLabel}
          </p>
        </div>

        <div className="relative w-25 h-25 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" stroke="#F3F4F6" strokeWidth="9" fill="transparent" />
            <circle
              cx="50"
              cy="50"
              r="38"
              stroke="#2ae9c9"
              strokeWidth="9"
              fill="transparent"
              strokeDasharray={isLoading ? "0 238.76" : getRingStrokeDasharray(weekGrowthPercent)}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[15px] font-bold text-[#0B1215]">
              {isLoading ? "—" : `${ringPercent}%`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

type LeadsChartProps = {
  dailyTrend?: CrmDailyTrendPoint[];
  monthNewLeads?: number;
  monthLabel?: string;
  highlightDay?: string | null;
  isLoading?: boolean;
};

const EMPTY_TREND: CrmDailyTrendPoint[] = [
  { day: "Mon", value: 0, date: "" },
  { day: "Tues", value: 0, date: "" },
  { day: "Weds", value: 0, date: "" },
  { day: "Thurs", value: 0, date: "" },
  { day: "Fri", value: 0, date: "" },
  { day: "Sat", value: 0, date: "" },
];

export function LeadsChart({
  dailyTrend,
  monthNewLeads = 0,
  monthLabel = "",
  highlightDay,
  isLoading = false,
}: LeadsChartProps) {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const chartData = dailyTrend?.length ? dailyTrend : EMPTY_TREND;
  const overlayLabel =
    monthLabel && !isLoading
      ? formatMonthOverlay(monthNewLeads, monthLabel)
      : isLoading
        ? "Loading…"
        : "";

  if (!isClient) return <div className="h-full w-full min-h-45" />;

  return (
    <div className="se-chart rounded-3xl p-6 border-gray-100 flex-1 min-w-0 sm:min-w-75">
      <div className="flex items-center justify-between mb-1 px-2">
        {chartData.map((point) => (
          <span key={point.day} className="text-[11px] text-gray-400 font-medium">
            {point.day}
          </span>
        ))}
      </div>

      <div className="h-32.5 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="crmGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2ae9c9" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#2ae9c9" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <YAxis hide domain={[0, "dataMax + 50"]} />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: "none",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                padding: "6px 10px",
              }}
              formatter={(value) => [`${value}`, "Leads"]}
            />
            {highlightDay ? (
              <ReferenceLine x={highlightDay} stroke="#94A3B8" strokeDasharray="4 4" strokeWidth={1} />
            ) : null}
            <Area
              type="monotone"
              dataKey="value"
              stroke="#2ae9c9"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#crmGradient)"
              dot={false}
              activeDot={{ r: 5, fill: "#2ae9c9", strokeWidth: 2, stroke: "white" }}
            />
          </AreaChart>
        </ResponsiveContainer>

        {overlayLabel ? (
          <div className="absolute top-2 right-[28%] flex flex-col items-center pointer-events-none">
            <span className="text-[9px] text-gray-400 bg-white/90 px-1.5 py-0.5 rounded whitespace-nowrap">
              {overlayLabel}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
