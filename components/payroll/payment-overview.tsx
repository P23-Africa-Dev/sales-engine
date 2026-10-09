"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import ArrowDown from "@/assets/images/arrow-down.png";
import { getCurrentDateParts } from "@/lib/utils/date";
import type { PayrollOverview } from "@/lib/api/payroll";
import { formatPayrollMoney } from "@/lib/payroll/currency";

const paymentOverviewData = [
  { bar: 78, line: 74 },
  { bar: 52, line: 38 },
  { bar: 30, line: 32 },
  { bar: 70, line: 55 },
  { bar: 74, line: 48 },
  { bar: 56, line: 52 },
  { bar: 50, line: 42 },
  { bar: 44, line: 40 },
  { bar: 86, line: 44, highlighted: true },
  { bar: 32, line: 30 },
];

function PillBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { highlighted?: boolean };
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const r = Math.min(width, height) / 2;
  const fill = payload?.highlighted ? "#6366F1" : "#EEF0F4";
  return (
    <rect x={x} y={y} width={width} height={height} rx={r} ry={r} fill={fill} />
  );
}

const miniChartData = [
  { v: 30 },
  { v: 55 },
  { v: 38 },
  { v: 62 },
  { v: 44 },
  { v: 70 },
  { v: 50 },
  { v: 66 },
];

const darkChartData = [
  { v: 20 },
  { v: 40 },
  { v: 28 },
  { v: 55 },
  { v: 38 },
  { v: 68 },
  { v: 48 },
  { v: 75 },
];

function MiniChart({
  color = "#E18695",
  gradId,
}: {
  color?: string;
  gradId: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={miniChartData}
        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={1} />
            <stop offset="95%" stopColor="#D9D9D9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="natural"
          dataKey="v"
          stroke={color}
          strokeWidth={0}
          fillOpacity={1}
          fill={`url(#${gradId})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface PaymentOverviewProps {
  overview?: PayrollOverview | null;
  currency: string;
}

export function PaymentOverview({ overview, currency }: PaymentOverviewProps) {
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isAgent = user?.active_company?.role === "agent";
  const { day, weekDay, month } = getCurrentDateParts();

  const todayPresentAgents = overview?.today_present_agents ?? 0;
  const todayPayrollValue = formatPayrollMoney(overview?.today_payroll_value ?? 0, currency);
  const totalPayroll = formatPayrollMoney(overview?.total_payroll ?? 0, currency);
  const payrollTrend = overview?.payroll_rise
    ? { label: "Rise", color: "#2F6C0E" }
    : overview?.payroll_fall
      ? { label: "Fall", color: "#B42318" }
      : { label: "Stable", color: "#6B7280" };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="p-3 sm:p-5 flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[20px] font-bold text-[#0B1215] font-[poppins] pt-1.5">
            Payment Overview
          </h2>

          <div className="flex items-center gap-2.5 bg-white rounded-2xl pl-1.5 pr-4 py-1.5 shadow-[0px_2px_10px_rgba(0,0,0,0.08)]">
            <div className="w-11 h-11 rounded-full bg-[#E8612D] flex items-center justify-center shrink-0">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="8.5" cy="9.5" r="1.6" fill="white" />
                <circle cx="15.5" cy="9.5" r="1.6" fill="white" />
                <path
                  d="M7.5 13.5 C 8.5 17, 15.5 17, 16.5 13.5 C 16.5 16.5, 13.5 17.5, 12 17.5 C 10.5 17.5, 7.5 16.5, 7.5 13.5 Z"
                  fill="white"
                />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-bold text-[#E8612D]">
                As at Today
              </p>
              <p className="text-[12px] text-[#8B95A1] mt-0.5">
                {weekDay}, {month} {day}th
              </p>
            </div>
          </div>
        </div>

        {/* Combined bar + line chart */}
        <div className="mt-4 h-50 lg:h-auto lg:flex-1 lg:min-h-40">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={paymentOverviewData}
                margin={{ top: 10, right: 10, left: 10, bottom: 6 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="5 5"
                  stroke="#E5E7EB"
                />
                <XAxis hide />
                <YAxis hide domain={[0, 100]} />
                <Bar
                  dataKey="bar"
                  barSize={22}
                  shape={(props: object) => <PillBar {...props} />}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="line"
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={{
                    r: 5,
                    fill: "white",
                    stroke: "#6366F1",
                    strokeWidth: 2,
                  }}
                  activeDot={{
                    r: 6,
                    fill: "white",
                    stroke: "#6366F1",
                    strokeWidth: 2,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col lg:max-w-71.5 gap-2.5">
        <div className="bg-white rounded-[20px] px-4 py-4 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026] w-71.5 h-42.25 flex flex-col">
          <p className="text-[22px] sm:text-[28px] lg:text-[32px] font-bold text-[#34373C] leading-tight tracking-tight font-[poppins]">
            {formatPayrollMoney(overview?.total_commission ?? 0, currency)}
          </p>
          <p className="text-[14px] font-light text-[#34373C] mb-2.5">
            Total Commissions
          </p>
          <div className="flex items-end gap-2 shrink-0">
            <div className="w-full h-9">
              {mounted ? (
                <MiniChart color="#E18695" gradId="commGrad" />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
            <div className="inline-flex items-center gap-1 text-[15px] font-medium">
              {todayPresentAgents} <Image src={ArrowDown} alt="" width={7} />
            </div>
          </div>
        </div>

        {!isAgent && (
          <div className="bg-white flex rounded-[20px] px-4 py-0 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026] w-71.5 h-17 items-center">
            <div className="shrink-0 mr-2">
              <p className="text-[16px] sm:text-[20px] font-bold text-[#34373C] tracking-tight font-[poppins]">
                {formatPayrollMoney(overview?.pending_approval ?? 0, currency)}
              </p>
              <p className="text-[12px] font-light text-[#34373C] leading-none">
                Pending Approvals
              </p>
            </div>
            <div className="w-full h-9">
              {mounted ? (
                <MiniChart color="#E18695" gradId="commGrad" />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
            <div className="inline-flex items-center gap-1 text-[15px] font-medium ml-3.5">
              20% <Image src={ArrowDown} alt="" width={7} />
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#09232D] min-h-55 lg:max-h-67.25 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-3xl lg:max-w-115.25 py-5 px-3.75 flex-1 min-w-0 relative overflow-hidden flex flex-col">
        <div className="relative z-10 flex flex-col flex-1">
          <div className="px-4.5 py-3.25 bg-[#041820] rounded-[20px] w-fit shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026]">
            <p className="text-[28px] sm:text-[38px] lg:text-[48px] text-white leading-tight tracking-tight">
              {totalPayroll}
            </p>
            <p className="text-[14px] font-light text-white mt-0.75">
              Total Payroll
            </p>
          </div>

          {/* Chart */}
          <div className="mt-auto pt-4 h-20 lg:h-27.75 flex items-baseline">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={darkChartData}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="payrollDarkGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#95E1C0" />
                      <stop offset="95%" stopColor="#95E1C0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#95E1C0"
                    strokeWidth={0}
                    fillOpacity={1}
                    fill="url(#payrollDarkGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full" />
            )}

            <span className="inline-flex items-center gap-1 text-[16px] sm:text-[20px] lg:text-[24px] font-medium text-[#95E1C0] px-2.5 py-0.5 rounded-full shrink-0">
              {payrollTrend.label}
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path
                  d="M5 8V2M2 5l3-3 3 3"
                  stroke="#95E1C0"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
