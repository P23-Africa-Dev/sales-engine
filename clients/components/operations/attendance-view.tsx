"use client";

import { useState, useEffect, startTransition } from "react";
import Link from "next/link";
import { MapPin, Search, SlidersHorizontal, BookmarkPlus, ChevronLeft, ChevronRight, Loader2, Settings, X, ArrowUpRight, Clock, CalendarDays, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { useAttendanceSettings, useUpdateAttendanceSettings } from "@/hooks/use-attendance";
import {
  AttendanceTimezoneSelect,
  DEFAULT_ATTENDANCE_TIMEZONE,
} from "@/components/attendance/attendance-timezone-select";
import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns";
import { AddAgentModal } from "./add-agent-modal";
import { OpsTableRow, OpsTableNameCol, OpsTableCol, OpsTableStatus, OpsTableContainer } from "./ops-table";
import { useAttendanceMetrics, useAttendanceRecords, useAgentAttendanceHistory } from "@/hooks/use-attendance";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { AgentAttendanceRecord } from "@/lib/api/attendance";
import {
  mapManagementAttendanceRecord,
  type ManagementAttendanceListItem,
} from "@/lib/attendance-management-ui";

type AttendanceItem = ManagementAttendanceListItem;

const SPARK_PRESENT = [{ v: 8 }, { v: 14 }, { v: 10 }, { v: 18 }, { v: 12 }, { v: 16 }, { v: 20 }];
const SPARK_ABSENT = [{ v: 20 }, { v: 14 }, { v: 18 }, { v: 10 }, { v: 16 }, { v: 12 }, { v: 8 }];

function MgmtStatCard({
  value,
  label,
  href,
  accentBg,
  strokeColor,
  gradientId,
  data,
  isLoading,
}: {
  value: number;
  label: string;
  href: string;
  accentBg: string;
  strokeColor: string;
  gradientId: string;
  data: { v: number }[];
  isLoading: boolean;
}) {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col min-h-44 overflow-hidden relative">
      <div className="flex items-start justify-between gap-2 mb-1">
        {isLoading ? (
          <div className="w-20 h-14 bg-gray-100 animate-pulse rounded-xl" />
        ) : (
          <h2 className="text-[52px] font-bold text-[#1A1A1A] leading-none tracking-tight">
            {value}
          </h2>
        )}
        <Link
          href={href}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold text-white shrink-0 mt-1 hover:opacity-90 transition-opacity"
          style={{ background: accentBg }}
        >
          View All
          <ArrowUpRight size={11} />
        </Link>
      </div>
      <p className="text-[13px] font-medium text-gray-500 mb-auto">{label}</p>
      <div className="h-14 w-full mt-3 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string; ring: string }> = {
  present:         { label: "Present",   bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-400",  ring: "ring-emerald-200"  },
  late:            { label: "Late",      bg: "bg-orange-50",   text: "text-orange-600",  dot: "bg-orange-400",   ring: "ring-orange-200"   },
  absent:          { label: "Absent",    bg: "bg-red-50",      text: "text-red-600",     dot: "bg-red-400",      ring: "ring-red-200"      },
  auto_clocked_out:{ label: "Auto-Out",  bg: "bg-gray-100",    text: "text-gray-500",    dot: "bg-gray-400",     ring: "ring-gray-200"     },
  clocked_out:     { label: "Present",   bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-400",  ring: "ring-emerald-200"  },
};

function formatDuration(minutes: number | null): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function HistoryEntry({ record }: { record: AgentAttendanceRecord }) {
  const date = parseISO(record.attendance_date);
  const dayLabel  = format(date, "EEE");
  const dayNum    = format(date, "d");
  const monthLabel= format(date, "MMM");
  const clockIn   = record.clock_in_at  ? format(parseISO(record.clock_in_at),  "h:mma") : null;
  const clockOut  = record.clock_out_at ? format(parseISO(record.clock_out_at), "h:mma") : null;
  const cfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.present;
  const duration  = formatDuration(record.work_duration_minutes);

  return (
    <div className="flex items-stretch gap-3 group">
      {/* Date column */}
      <div className="flex flex-col items-center w-10 shrink-0 pt-0.5">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none">{dayLabel}</p>
        <p className="text-[18px] font-black text-[#0B1215] leading-tight">{dayNum}</p>
        <p className="text-[9px] text-gray-400 uppercase leading-none">{monthLabel}</p>
      </div>

      {/* Timeline line + dot */}
      <div className="flex flex-col items-center gap-0 shrink-0">
        <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ring-2 ${cfg.dot} ${cfg.ring}`} />
        <div className="w-px flex-1 bg-gray-100 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-3">
        <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] group-hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-shadow">
          <div className="flex items-start justify-between gap-2">
            {/* Times */}
            <div className="flex flex-col gap-1">
              {clockIn ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-[11px] font-bold text-[#0B1215]">{clockIn}</span>
                  </div>
                  {clockOut && (
                    <>
                      <span className="text-[10px] text-gray-300">→</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                        <span className="text-[11px] text-gray-500">{clockOut}</span>
                      </div>
                    </>
                  )}
                  {!clockOut && (
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-gray-400 italic">No clock in recorded</span>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {duration && (
                  <div className="flex items-center gap-1">
                    <Clock size={9} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400 font-medium">{duration}</span>
                  </div>
                )}
                {record.is_late && (
                  <span className="text-[9px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">Late arrival</span>
                )}
                {record.is_auto_clocked_out && (
                  <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Auto clocked-out</span>
                )}
              </div>
            </div>

            {/* Status badge */}
            <span className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
              {cfg.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttendanceHistoryPanel({
  selected,
  companyId,
}: {
  selected: AttendanceItem;
  companyId: number | string | undefined;
}) {
  const toDate = format(new Date(), "yyyy-MM-dd");
  const fromDate = format(subDays(new Date(), 29), "yyyy-MM-dd");

  const { data, isLoading } = useAgentAttendanceHistory(selected.userId, {
    company_id: companyId,
    from_date: fromDate,
    to_date: toDate,
    per_page: 60,
  });

  const records: AgentAttendanceRecord[] = data?.items ?? [];
  const summary = data?.summary;

  const presentCount = summary?.present_days ?? 0;
  const lateCount    = summary?.late_days ?? 0;
  const absentCount  = summary?.absent_days ?? 0;
  const attendanceRate = summary?.attendance_rate_percent ?? 0;

  return (
    <div className="flex flex-col rounded-3xl overflow-hidden shadow-[0px_4px_14px_rgba(9,35,45,0.18)]">
      {/* Dark header */}
      <div className="bg-dash-dark px-5 py-5 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Attendance History</p>
            <p className="text-[15px] font-bold text-white mt-0.5">{selected.name}</p>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full">
            <CalendarDays size={11} className="text-white/60" />
            <span className="text-[10px] font-bold text-white/70">Last 30 days</span>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/8 border border-white/10 rounded-2xl px-3 py-3 flex flex-col items-center gap-0.5">
            <span className="text-[22px] font-black text-white leading-none">{presentCount}</span>
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wide">Present</span>
            </div>
          </div>
          <div className="bg-white/8 border border-white/10 rounded-2xl px-3 py-3 flex flex-col items-center gap-0.5">
            <span className="text-[22px] font-black text-white leading-none">{lateCount}</span>
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wide">Late</span>
            </div>
          </div>
          <div className="bg-white/8 border border-white/10 rounded-2xl px-3 py-3 flex flex-col items-center gap-0.5">
            <span className="text-[22px] font-black text-white leading-none">{absentCount}</span>
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="text-[9px] font-bold text-red-400 uppercase tracking-wide">Absent</span>
            </div>
          </div>
        </div>

        {/* Attendance rate bar */}
        {(summary?.total_days ?? 0) > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={10} className="text-white/50" />
                <span className="text-[10px] text-white/50 font-medium">Attendance rate</span>
              </div>
              <span className="text-[11px] font-bold text-white">
                {attendanceRate}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-400 transition-all duration-500"
                style={{ width: `${attendanceRate}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Scrollable timeline */}
      <div className="bg-[#F8F9FA] flex-1 overflow-y-auto max-h-80 p-4 pt-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={22} className="animate-spin text-gray-300" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <CalendarDays size={28} className="text-gray-300" />
            <p className="text-[12px] text-gray-400 font-medium">No history available</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {records.map((record) => (
              <HistoryEntry key={record.id} record={record} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 5;

const DAYS_OF_WEEK = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

function AttendanceSettingsModal({
  companyId,
  onClose,
}: {
  companyId: number | string;
  onClose: () => void;
}) {
  const { data: settings, isLoading } = useAttendanceSettings(companyId);
  const updateMutation = useUpdateAttendanceSettings();

  const [openingTime, setOpeningTime] = useState("09:00");
  const [closingTime, setClosingTime] = useState("17:00");
  const [workingDays, setWorkingDays] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [autoClockout, setAutoClockout] = useState(true);
  const [timezone, setTimezone] = useState(DEFAULT_ATTENDANCE_TIMEZONE);

  useEffect(() => {
    if (settings) {
      startTransition(() => {
        if (settings.opening_time) setOpeningTime(settings.opening_time.slice(0, 5));
        if (settings.closing_time) setClosingTime(settings.closing_time.slice(0, 5));
        if (settings.working_days) setWorkingDays(settings.working_days);
        if (settings.clockin_window_minutes !== undefined) setWindowMinutes(settings.clockin_window_minutes);
        if (settings.auto_clockout_enabled !== undefined) setAutoClockout(settings.auto_clockout_enabled);
        if (settings.timezone) setTimezone(settings.timezone);
      });
    }
  }, [settings]);

  function toggleDay(day: string) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function handleSave() {
    updateMutation.mutate(
      {
        company_id: companyId,
        opening_time: openingTime,
        closing_time: closingTime,
        working_days: workingDays,
        clockin_window_minutes: windowMinutes,
        auto_clockout_enabled: autoClockout,
        timezone,
      },
      {
        onSuccess: () => {
          toast.success("Attendance settings saved.");
          onClose();
        },
        onError: (err: Error) => toast.error(err.message || "Failed to save settings."),
      }
    );
  }

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-[16px] font-black text-dash-dark">Attendance Settings</h3>
            <p className="text-[12px] text-gray-400 mt-0.5">Configure attendance windows for your team</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Working Days */}
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Working Days</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => toggleDay(day.key)}
                      className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-all ${workingDays.includes(day.key)
                        ? "bg-dash-dark text-white border-dash-dark"
                        : "bg-gray-50 text-gray-500 border-gray-200 hover:border-dash-dark/30"
                        }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opening / Closing times */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Opening Time</label>
                  <input
                    type="time"
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-dash-dark outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Closing Time</label>
                  <input
                    type="time"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-dash-dark outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all"
                  />
                </div>
              </div>

              {/* Clock in window */}
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Clock in Window <span className="normal-case font-normal text-gray-400">(minutes before/after opening)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(Number(e.target.value))}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-dash-dark outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">Agents can clock in up to {windowMinutes} minutes before/after opening time.</p>
              </div>

              {/* Auto-clockout */}
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Timezone
                </label>
                <AttendanceTimezoneSelect value={timezone} onChange={setTimezone} />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Opening and closing times are interpreted in this timezone.
                </p>
              </div>

              <div className="flex items-center justify-between py-4 px-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div>
                  <p className="text-[13px] font-bold text-dash-dark">Auto Clock out</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Automatically clock out agents at closing time</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoClockout((v) => !v)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 ${autoClockout ? "bg-dash-dark" : "bg-gray-300"
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${autoClockout ? "translate-x-6" : "translate-x-0"
                      }`}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-600 hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || isLoading}
            className="flex-1 py-3 rounded-xl bg-dash-dark text-white text-[13px] font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {updateMutation.isPending && <Loader2 size={13} className="animate-spin" />}
            {updateMutation.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AttendanceView({ basePath }: { basePath: string }) {
  const today = format(new Date(), "yyyy-MM-dd");

  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState<"all" | "present" | "late" | "clocked_out" | "absent">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "agent" | "supervisor">("all");
  const [clockStateFilter, setClockStateFilter] = useState<"all" | "clocked_in" | "clocked_out">("all");
  const [periodFilter, setPeriodFilter] = useState<"day" | "week" | "month" | "range">("day");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const { user } = useAuthStore();
  const { apiCompanyId } = getActiveCompanyContext(user);

  const resolvePeriodRange = () => {
    if (periodFilter === "week") {
      const now = new Date();
      return {
        from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        to: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    }

    if (periodFilter === "month") {
      const now = new Date();
      return {
        from: format(startOfMonth(now), "yyyy-MM-dd"),
        to: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }

    if (periodFilter === "range") {
      const start = fromDate <= toDate ? fromDate : toDate;
      const end = toDate >= fromDate ? toDate : fromDate;
      return { from: start, to: end };
    }

    return null;
  };

  const periodRange = resolvePeriodRange();
  const statusParam = statusFilter === "all" ? undefined : statusFilter;
  const roleParam = roleFilter === "all" ? undefined : roleFilter;
  const clockStateParam = clockStateFilter === "all" ? undefined : clockStateFilter;

  const { data: metricsData } = useAttendanceMetrics(apiCompanyId ?? undefined, date);
  const { data: recordsData, isLoading: recordsLoading } = useAttendanceRecords({
    company_id: apiCompanyId ?? undefined,
    ...(periodRange
      ? { from_date: periodRange.from, to_date: periodRange.to }
      : { date }),
    status: statusParam,
    role: roleParam,
    clock_state: clockStateParam,
    search: search || undefined,
    per_page: PAGE_SIZE,
    page,
  });

  const attendanceList: AttendanceItem[] = (recordsData?.items ?? []).map(mapManagementAttendanceRecord);
  const pagination = recordsData?.pagination;
  const totalPages = Math.max(1, pagination?.last_page ?? 1);
  const currentPage = pagination?.current_page ?? page;
  const paginated = attendanceList;

  const activeId = selectedId ?? (paginated[0]?.id ?? null);
  const selected = paginated.find((i) => i.id === activeId) ?? paginated[0] ?? null;

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleDateChange = (val: string) => {
    setDate(val);
    setPeriodFilter("day");
    setPage(1);
    setSelectedId(null);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRoleFilter("all");
    setClockStateFilter("all");
    setPeriodFilter("day");
    setDate(today);
    setFromDate(today);
    setToDate(today);
    setPage(1);
    setSelectedId(null);
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-[20px] font-extrabold text-dash-dark shrink-0">
          <span className="lg:hidden">Attendance Overview</span>
        </h1>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:justify-end min-w-0 mt-2 lg:-mt-16 xl:-mt-20 transition-all duration-300 relative z-10">
          {/* Date picker */}
          <input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="bg-white border border-[#D7D7D7] rounded-2xl px-4 py-2.5 text-[13px] text-dash-dark outline-none focus:ring-2 focus:ring-dash-dark/10 shrink-0"
            style={{ boxShadow: "0px 1px 3px 0px #0000004D" }}
          />

          {/* Search */}
          <div className="relative w-full md:w-114.5 group shrink-0">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-dark transition-colors"
              size={18}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by agent name..."
              className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all font-sans"
              style={{
                height: "46px",
                borderRadius: "24px",
                border: "0.7px solid #D7D7D7",
                boxShadow: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026",
              }}
            />
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${showFilters ? "text-white" : "text-gray-500"
              }`}
            style={{
              background: showFilters ? "#34373C" : "#F8F8F8",
              border: showFilters ? "0.5px solid #34373C" : "0.5px solid #D1D1D1",
              boxShadow: showFilters ? "none" : "0 2px 8px rgba(0, 0, 0, 0.06)",
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 400,
                fontSize: "10px",
                lineHeight: "100%",
              }}
            >
              Filter
            </span>
          </button>

          <Link
            href="/map?tab=clocked-in"
            className="flex items-center gap-2 px-5 py-3 bg-white border border-[#D7D7D7] text-dash-dark rounded-xl text-[13px] font-bold hover:bg-gray-50 transition-all shrink-0"
            style={{ boxShadow: "0px 1px 3px 0px #0000004D" }}
          >
            <MapPin size={14} strokeWidth={2} />
            <span className="hidden sm:inline">Clocked-In Map</span>
          </Link>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-[#D7D7D7] text-dash-dark rounded-xl text-[13px] font-bold hover:bg-gray-50 transition-all shrink-0 cursor-pointer"
            style={{ boxShadow: "0px 1px 3px 0px #0000004D" }}
          >
            <Settings size={14} strokeWidth={2} />
            <span className="hidden sm:inline">Config</span>
          </button>

          {/* <button
            onClick={() => setShowAddAgent(true)}
            className="flex items-center gap-2 px-5 py-3 bg-dash-dark text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shrink-0 cursor-pointer"
            style={{ boxShadow: "0 4px 14px rgba(9, 35, 45, 0.3)" }}
          >
            <BookmarkPlus size={15} strokeWidth={2} />
            <span className="hidden sm:inline whitespace-nowrap">Add New Agent</span>
            <span className="sm:hidden">New</span>
          </button> */}
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Period</label>
            <div className="flex gap-1">
              {([
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
                ["range", "Range"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setPeriodFilter(value);
                    setPage(1);
                    setSelectedId(null);
                  }}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${periodFilter === value
                    ? "bg-dash-dark text-white"
                    : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {periodFilter === "range" && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gray-400 px-1">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPage(1);
                    setSelectedId(null);
                  }}
                  className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] text-dash-dark outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-gray-400 px-1">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPage(1);
                    setSelectedId(null);
                  }}
                  className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] text-dash-dark outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
            <SearchableSelect
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v as "all" | "present" | "late" | "clocked_out" | "absent"); setPage(1); }}
              options={[{ value: "all", label: "All Status" }, { value: "present", label: "Present" }, { value: "late", label: "Late" }, { value: "clocked_out", label: "Clocked Out" }, { value: "absent", label: "Absent" }]}
              className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Clock</label>
            <SearchableSelect
              value={clockStateFilter}
              onChange={(v) => { setClockStateFilter(v as "all" | "clocked_in" | "clocked_out"); setPage(1); }}
              options={[{ value: "all", label: "All" }, { value: "clocked_in", label: "Clocked In" }, { value: "clocked_out", label: "Clocked Out" }]}
              className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Role</label>
            <SearchableSelect
              value={roleFilter}
              onChange={(v) => { setRoleFilter(v as "all" | "admin" | "agent" | "supervisor"); setPage(1); }}
              options={[{ value: "all", label: "All Roles" }, { value: "admin", label: "Admin" }, { value: "agent", label: "Field Agent" }, { value: "supervisor", label: "Supervisor" }]}
              className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark cursor-pointer"
            />
          </div>

          {(search.trim() !== "" || statusFilter !== "all" || roleFilter !== "all" || clockStateFilter !== "all" || periodFilter !== "day") && (
            <div className="flex flex-col justify-end">
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}



      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-5 mt-2">


        {/* ── Left: attendance list ──────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">

          {/* ── Stats Cards ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <MgmtStatCard
              value={metricsData?.present ?? 0}
              label="Present Agents Today"
              href={`${basePath}/operations/attendance`}
              accentBg="#4BB89E"
              strokeColor="#4BB89E"
              gradientId="mgmtGradPresent"
              data={SPARK_PRESENT}
              isLoading={!metricsData}
            />
            <MgmtStatCard
              value={metricsData?.absent ?? 0}
              label="Absent Agents Today"
              href={`${basePath}/operations/attendance`}
              accentBg="#EF7129"
              strokeColor="#EF7129"
              gradientId="mgmtGradAbsent"
              data={SPARK_ABSENT}
              isLoading={!metricsData}
            />
          </div>

          <OpsTableContainer className="grow-0 flex flex-col h-140">
            {/* Header */}
            <div className="flex justify-end mb-5 shrink-0">
              <Link
                href={`${basePath}/operations/attendance`}
                className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors"
              >
                Attendance List
              </Link>
            </div>

            {/* Scrollable rows */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {recordsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : paginated.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-[14px] font-medium">
                  No attendance records found.
                </div>
              ) : (
                <div className="space-y-3">
                  {paginated.map((item) => {
                    const isSelected = item.id === activeId;
                    return (
                      <OpsTableRow
                        key={item.id}
                        isSelected={isSelected}
                        onClick={() => setSelectedId(item.id)}
                        avatar={item.avatar}
                        avatarAlt={item.name}
                      >
                        <OpsTableNameCol
                          name={item.name}
                          subText={item.address}
                          isSelected={isSelected}
                        />
                        <OpsTableCol
                          label="Check In"
                          value={item.checkIn}
                          isSelected={isSelected}
                          className="hidden sm:block w-28 sm:w-32"
                        />
                        <OpsTableCol
                          label="Check Out"
                          value={item.checkOut}
                          isSelected={isSelected}
                          className="hidden md:block w-36 sm:w-40"
                        />
                        <OpsTableCol
                          label="Role"
                          value={item.role}
                          isSelected={isSelected}
                          className="hidden lg:block w-28 sm:w-32"
                        />
                        <OpsTableStatus
                          label={item.status}
                          subText={item.subText}
                          isSelected={isSelected}
                          badgeClass={
                            item.active
                              ? "bg-[#2F6C0E] text-white"
                              : "bg-[#EF7129] text-white"
                          }
                        />
                      </OpsTableRow>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="shrink-0 flex items-center justify-between pt-5 mt-4 border-t border-gray-100">
              <p className="text-[12px] text-gray-400">
                Showing{" "}
                {paginated.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, pagination?.total ?? paginated.length)} of {pagination?.total ?? paginated.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-full text-[13px] font-bold transition-all ${p === currentPage
                      ? "bg-dash-dark text-white shadow-sm"
                      : "text-gray-400 hover:bg-gray-100"
                      }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </OpsTableContainer>
        </div>

        {/* ── Right: detail sidebar ──────────────────────────── */}
        <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">
          {selected ? (
            <>
              {/* Agent Info Card */}
              <div className="px-4 sm:px-8">
                <div className="flex items-start gap-5">
                  <div className="flex-1 space-y-3 min-w-0">
                    <div>
                      <h3 className="text-[13px] font-extrabold text-dash-dark leading-tight">
                        {selected.name}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-45">
                        {selected.address}
                      </p>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-dash-dark mb-0.5">Role</p>
                      <p className="text-[12px] text-gray-400">{selected.role}</p>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-dash-dark mb-0.5">Check In</p>
                      <p className="text-[12px] text-gray-400">{selected.checkIn}</p>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-dash-dark mb-0.5">Check Out</p>
                      <p className="text-[12px] text-gray-400">{selected.checkOut}</p>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-center">
                    <div className="bg-white p-2 rounded-[30px]">
                      <div className="w-32 h-32 rounded-[22px] overflow-hidden shadow-md">
                        <img
                          src={selected.avatar}
                          className="w-full h-full object-cover"
                          alt={selected.name}
                        />
                      </div>
                      <div className="mt-2.5 flex flex-col items-center gap-1">
                        <p className="text-[13px] font-bold text-dash-dark">{selected.name}</p>
                        <span
                          className={`px-2.5 py-0.75 rounded-full text-[9px] font-bold ${selected.active
                            ? "bg-[#22C55E] text-white"
                            : "bg-[#F48243]/20 text-[#F48243]"
                            }`}
                        >
                          {selected.status}
                        </span>
                      </div>
                    </div>
                    {/* <div className="flex items-center gap-3 mt-4">
                      <svg width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="16.2378" cy="16.2378" r="15.9878" fill="#EAEAEA" stroke="#DFDFDF" strokeWidth="0.5" />
                        <path d="M13.9717 18.5035H19.2584M13.9717 14.7273H16.615" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M18.2543 23.33C21.4135 23.12 23.9299 20.5678 24.137 17.3639C24.1775 16.7369 24.1775 16.0875 24.137 15.4605C23.9299 12.2565 21.4135 9.70435 18.2543 9.49435C17.1765 9.42271 16.0512 9.42286 14.9756 9.49435C11.8164 9.70435 9.29995 12.2565 9.09289 15.4605C9.05237 16.0875 9.05237 16.7369 9.09289 17.3639C9.16831 18.5308 9.68439 19.6113 10.292 20.5236C10.6447 21.1623 10.4119 21.9595 10.0445 22.6558C9.77953 23.1579 9.64706 23.4089 9.75343 23.5903C9.85979 23.7716 10.0974 23.7774 10.5726 23.789C11.5123 23.8118 12.1459 23.5454 12.6489 23.1745C12.9342 22.9642 13.0768 22.859 13.1751 22.8469C13.2734 22.8348 13.4669 22.9145 13.8538 23.0738C14.2015 23.217 14.6052 23.3054 14.9756 23.33C16.0512 23.4015 17.1765 23.4017 18.2543 23.33Z" stroke="#2F5E71" strokeLinejoin="round" />
                      </svg>
                      <svg width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="16.2378" cy="16.2378" r="15.9878" fill="#EAEAEA" stroke="#DFDFDF" strokeWidth="0.5" />
                        <path d="M24.1674 15.4826V14.8916C24.1674 13.4268 24.1674 12.6943 23.725 12.2392C23.2825 11.7842 22.5705 11.7842 21.1464 11.7842H19.5766C18.8837 11.7842 18.878 11.7828 18.255 11.471L15.7388 10.2119C14.6882 9.68616 14.1629 9.4233 13.6033 9.44156C13.0437 9.45983 12.5357 9.75643 11.5197 10.3496L10.5923 10.891C9.84598 11.3267 9.47282 11.5446 9.26765 11.907C9.0625 12.2695 9.0625 12.7108 9.0625 13.5936V19.7994C9.0625 20.9592 9.0625 21.5392 9.32099 21.862C9.493 22.0767 9.73403 22.2211 10.0005 22.269C10.401 22.3409 10.8913 22.0546 11.8719 21.4821C12.5378 21.0933 13.1787 20.6896 13.9753 20.7991C14.6428 20.8908 15.2631 21.312 15.8597 21.6105" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M13.5942 9.44067V20.7693" stroke="#2F5E71" strokeLinejoin="round" />
                        <path d="M18.8809 11.7063V14.7273" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M20.7692 16.6155C22.6085 16.6155 24.1678 18.1384 24.1678 19.9861C24.1678 21.8631 22.5831 23.1804 21.1193 24.076C21.0126 24.1363 20.8919 24.1679 20.7692 24.1679C20.6465 24.1679 20.5258 24.1363 20.4192 24.076C18.9581 23.1716 17.3706 21.8696 17.3706 19.9861C17.3706 18.1384 18.93 16.6155 20.7692 16.6155Z" stroke="#2F5E71" />
                        <path d="M20.8633 20.014H20.7689M20.9577 20.014C20.9577 20.1183 20.8732 20.2028 20.7689 20.2028C20.6646 20.2028 20.5801 20.1183 20.5801 20.014C20.5801 19.9097 20.6646 19.8252 20.7689 19.8252C20.8732 19.8252 20.9577 19.9097 20.9577 20.014Z" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <svg width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="16.2378" cy="16.2378" r="15.9878" fill="#EAEAEA" stroke="#DFDFDF" strokeWidth="0.5" />
                        <path d="M16.6154 9.06299C20.7865 9.06299 24.1679 12.4443 24.1679 16.6154C24.1679 20.7866 20.7865 24.1679 16.6154 24.1679C12.4443 24.1679 9.06299 20.7866 9.06299 16.6154M14.281 9.43069C13.5189 9.67812 12.81 10.0434 12.1758 10.5051M10.5051 12.1757C10.0433 12.8101 9.678 13.5192 9.43057 14.2814" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16.6157 13.5945V19.6364M19.6367 16.6154H13.5947" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div> */}
                  </div>
                </div>
              </div>

              {/* Attendance history panel */}
              <AttendanceHistoryPanel selected={selected} companyId={apiCompanyId ?? undefined} />
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-[13px]">
              Select a record to view details
            </div>
          )}
        </div>
      </div>

      {showAddAgent && <AddAgentModal onClose={() => setShowAddAgent(false)} />}
      {showSettings && apiCompanyId && (
        <AttendanceSettingsModal
          companyId={apiCompanyId}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
