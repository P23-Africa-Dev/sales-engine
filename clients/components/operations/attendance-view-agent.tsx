"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, Download, Clock, ChevronDown, Loader2, CalendarDays, TrendingUp } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { AddAgentModal } from "./add-agent-modal";
import { OpsTableRow, OpsTableNameCol, OpsTableCol, OpsTableStatus, OpsTableContainer } from "./ops-table";
import { useAttendanceStats, useAttendanceToday, useClockIn, useClockOut, useAttendanceHistory } from "@/hooks/use-attendance";
import { useFieldActivityReporter } from "@/components/tracking/field-activity-reporter-provider";
import { JourneyHistoryPanel } from "@/components/operations/journey-history-panel";
import {
  AgentDayReviewModal,
  AgentPileInboxButton,
  AgentPileInboxPanel,
} from "@/components/operations/agent-field-review";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import type { AgentAttendanceRecord } from "@/lib/api/attendance";
import { resolveAvatarSrc } from "@/lib/avatar";

type AttendanceItem = {
  id: number | string;
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
  role: string;
  status: string;
  subText: string;
  active: boolean;
  avatar: string;
  date: string;
};

function mapRecord(record: AgentAttendanceRecord, userName: string, avatarUrl?: string | null): AttendanceItem {
  const lat = record.metadata?.clock_in_latitude;
  const lng = record.metadata?.clock_in_longitude;
  return {
    id: record.id,
    name: userName,
    address: lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "No location data",
    checkIn: record.clock_in_at
      ? format(parseISO(record.clock_in_at), "h:mma")
      : "No check in record",
    checkOut: record.clock_out_at
      ? format(parseISO(record.clock_out_at), "h:mma")
      : record.status !== "absent"
      ? "Still Active"
      : "No check out record",
    role: "Field Agent",
    status: record.status === "present" || record.status === "late" ? "Present" : "Absent",
    subText:
      record.is_late
        ? "Late"
        : record.clock_out_at
        ? "Checked Out"
        : record.status !== "absent"
        ? "Active"
        : "Absent",
    active: !!record.clock_in_at && !record.clock_out_at,
    avatar: resolveAvatarSrc(avatarUrl ?? null),
    date: record.attendance_date,
  };
}

async function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is required to record attendance."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) {
          reject(new Error("A valid GPS location is required to record attendance."));
          return;
        }
        resolve({ latitude, longitude });
      },
      () => reject(new Error("A valid GPS location is required to record attendance.")),
      { timeout: 10000, enableHighAccuracy: true }
    );
  });
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string; ring: string }> = {
  present:          { label: "Present",   bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-400",  ring: "ring-emerald-200"  },
  late:             { label: "Late",      bg: "bg-orange-50",   text: "text-orange-600",  dot: "bg-orange-400",   ring: "ring-orange-200"   },
  absent:           { label: "Absent",    bg: "bg-red-50",      text: "text-red-600",     dot: "bg-red-400",      ring: "ring-red-200"      },
  auto_clocked_out: { label: "Auto-Out",  bg: "bg-gray-100",    text: "text-gray-500",    dot: "bg-gray-400",     ring: "ring-gray-200"     },
  clocked_out:      { label: "Present",   bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-400",  ring: "ring-emerald-200"  },
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
  agentName,
  records,
  isLoading,
}: {
  agentName: string;
  records: AgentAttendanceRecord[];
  isLoading: boolean;
}) {
  const presentCount = records.filter(r => r.status === "present" || r.status === "clocked_out" || r.status === "auto_clocked_out").length;
  const lateCount    = records.filter(r => r.is_late).length;
  const absentCount  = records.filter(r => r.status === "absent").length;
  const attendanceRate = records.length > 0
    ? Math.round(((presentCount + lateCount) / records.length) * 100)
    : 0;

  return (
    <div className="flex flex-col rounded-3xl overflow-hidden shadow-[0px_4px_14px_rgba(9,35,45,0.18)]">
      {/* Dark header */}
      <div className="bg-dash-dark px-5 py-5 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Attendance History</p>
            <p className="text-[15px] font-bold text-white mt-0.5">{agentName}</p>
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
        {records.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={10} className="text-white/50" />
                <span className="text-[10px] text-white/50 font-medium">Attendance rate</span>
              </div>
              <span className="text-[11px] font-bold text-white">{attendanceRate}%</span>
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

export function AttendanceViewAgent() {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [page, setPage] = useState(1);
  const [dayReviewOpen, setDayReviewOpen] = useState(false);
  const [pileInboxOpen, setPileInboxOpen] = useState(false);

  const { user } = useAuthStore();
  const { apiCompanyId } = getActiveCompanyContext(user);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: todayData, isLoading: todayLoading, isError: todayError } = useAttendanceToday();
  const { data: statsData, isLoading: statsLoading } = useAttendanceStats(apiCompanyId ?? undefined, year, month);
  const { data: historyData, isLoading: historyLoading } = useAttendanceHistory({
    company_id: apiCompanyId ?? undefined,
    per_page: 50,
  });

  const clockInMut = useClockIn();
  const clockOutMut = useClockOut();
  const fieldActivity = useFieldActivityReporter();

  const attendanceList: AttendanceItem[] = (historyData?.items ?? []).map((r) =>
    mapRecord(r, user?.name ?? "Me", user?.avatar),
  );

  const filtered = attendanceList.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.address.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeId = selectedId ?? (paginated[0]?.id ?? null);
  const selected = attendanceList.find((i) => i.id === activeId) ?? paginated[0] ?? null;

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleClockAction = async () => {
    const clockIn = todayData?.can_clock_in ?? false;
    const clockOut = todayData?.can_clock_out ?? false;
    if (!clockIn && !clockOut) return;
    if (!apiCompanyId) {
      toast.error("No active company found.");
      return;
    }

    let latitude: number;
    let longitude: number;
    try {
      ({ latitude, longitude } = await getCurrentPosition());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A valid GPS location is required.");
      return;
    }

    // ISO with timezone — the backend normalizes to the org timezone.
    const recorded_at = new Date().toISOString();
    const payload = {
      company_id: apiCompanyId,
      recorded_at,
      latitude,
      longitude,
    };

    if (clockIn) {
      clockInMut.mutate(payload, {
        onSuccess: () => {
          toast.success("Clocked in successfully!", {
            action: {
              label: "View on map",
              onClick: () => window.location.assign("/agent/map"),
            },
          });
        },
        onError: (err: Error) => toast.error(err.message ?? "Failed to clock in."),
      });
    } else if (clockOut) {
      // Push any buffered journey points before the session is closed,
      // otherwise the final leg of the route is rejected and lost.
      try {
        await fieldActivity.flush();
      } catch {
        // Best effort — clock-out proceeds regardless.
      }
      clockOutMut.mutate(payload, {
        onSuccess: () => {
          toast.success("Clocked out successfully!");
          setDayReviewOpen(true);
        },
        onError: (err: Error) => toast.error(err.message ?? "Failed to clock out."),
      });
    } else {
      toast.error("No clock action available right now.");
    }
  };

  const isClockPending = clockInMut.isPending || clockOutMut.isPending;
  const canClockIn = todayData?.can_clock_in ?? false;
  const canClockOut = todayData?.can_clock_out ?? false;

  const presentDays = statsData?.present_days ?? 0;
  const lateDays = statsData?.late_days ?? 0;
  const undertimeDays = statsData?.undertime_days ?? statsData?.absent_days ?? 0;

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-6 mb-2">
        <h1 className="text-[18px] font-extrabold text-dash-dark shrink-0 whitespace-nowrap">
          My Attendance Stats
        </h1>

        {/* Search - Centered */}
        <div className="flex-1 flex justify-center min-w-0">
          <div className="relative w-full max-w-145 group">
            <Search
              className="absolute left-6 top-1/2 -translate-y-1/2 text-dash-dark group-focus-within:text-dash-dark transition-colors"
              size={20}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search"
              className="w-full bg-white pl-15 pr-6 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all font-sans"
              style={{
                height: "52px",
                borderRadius: "30px",
                border: "1px solid #E5E5E5",
                boxShadow:
                  "0px 10px 25px -5px rgba(0, 0, 0, 0.1), 0px 8px 10px -6px rgba(0, 0, 0, 0.1)",
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <AgentPileInboxButton onClick={() => setPileInboxOpen(true)} />
          {/* Monthly Filter */}
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-all">
            <span>Monthly</span>
            <ChevronDown size={16} />
          </button>

          {/* Download */}
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-all">
            <Download size={16} className="text-gray-400" />
            <span>Download</span>
          </button>

          {/* Filter */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl text-[13px] font-medium transition-all ${
              showFilters
                ? "bg-dash-dark text-white border-dash-dark"
                : "bg-white text-gray-600 border-[#E5E5E5] hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal
              size={16}
              className={showFilters ? "text-white" : "text-gray-400"}
            />
            <span>Filter</span>
          </button>

          {/* Clock In / Out */}
          {!todayLoading && (
            <button
              onClick={handleClockAction}
              disabled={isClockPending || (!canClockIn && !canClockOut)}
              title={
                !canClockIn && !canClockOut
                  ? todayData?.message ?? (todayError ? "Attendance settings not configured" : "No action available right now")
                  : undefined
              }
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0D1E25] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClockPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Clock size={16} />
              )}
              <span>
                {isClockPending
                  ? "Processing..."
                  : canClockIn
                  ? "Clock In"
                  : canClockOut
                  ? "Clock Out"
                  : "Clocked Out"}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Today's attendance status banner */}
      {!todayLoading && todayData && !todayData.window_active && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 text-[13px] font-medium">
          <Clock size={15} className="shrink-0 text-amber-500" />
          <span>{todayData.message || (todayData.working_day ? "Outside attendance window" : "Not a working day")}</span>
        </div>
      )}
      {!todayLoading && todayError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-medium">
          <Clock size={15} className="shrink-0 text-red-400" />
          <span>Attendance settings not configured. Contact your administrator.</span>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-5 mt-2">
        {/* ── Left: attendance list ──────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Stats Cards */}
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {statsLoading ? (
              <div className="flex items-center justify-center w-full h-35">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <StatCard
                  value={String(presentDays).padStart(2, "0")}
                  unit="Days"
                  label="Total Attendance"
                  strokeColor="#6B9A9A"
                  gradientId="gradTealAgent"
                  data={STAT_DATA_1}
                />
                <StatCard
                  value={String(lateDays).padStart(2, "0")}
                  unit="Days"
                  label="Late Attendance"
                  strokeColor="#EF8E5B"
                  gradientId="gradOrangeAgent"
                  data={STAT_DATA_2}
                />
                <StatCard
                  value={String(undertimeDays).padStart(2, "0")}
                  unit={undertimeDays === 1 ? "Day" : "Days"}
                  label="Undertime"
                  strokeColor="#5E6268"
                  gradientId="gradGrayAgent"
                  data={STAT_DATA_3}
                />
              </>
            )}
          </div>

          <OpsTableContainer className="grow-0 flex flex-col h-140">
            {/* Header */}
            <div className="flex justify-end mb-5 shrink-0">
              <Link
                href="/agent/operations/attendance"
                className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors"
              >
                Attendance List
              </Link>
            </div>

            {/* Scrollable rows */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {historyLoading ? (
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
                Showing {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
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
                    className={`w-9 h-9 rounded-full text-[13px] font-bold transition-all ${
                      p === currentPage
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
                      <p className="text-[13px] font-bold text-dash-dark mb-0.5">Date</p>
                      <p className="text-[12px] text-gray-400">{selected.date}</p>
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
                          className={`px-2.5 py-0.75 rounded-full text-[9px] font-bold ${
                            selected.active
                              ? "bg-[#22C55E] text-white"
                              : "bg-[#F48243]/20 text-[#F48243]"
                          }`}
                        >
                          {selected.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance history panel */}
              <AttendanceHistoryPanel
                agentName={user?.name ?? "Me"}
                records={historyData?.items ?? []}
                isLoading={historyLoading}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-[13px]">
              Select a record to view details
            </div>
          )}
        </div>
      </div>

      {showAddAgent && <AddAgentModal onClose={() => setShowAddAgent(false)} />}
      <AgentDayReviewModal
        open={dayReviewOpen}
        onClose={() => setDayReviewOpen(false)}
        onPile={() => setPileInboxOpen(true)}
      />
      <AgentPileInboxPanel open={pileInboxOpen} onClose={() => setPileInboxOpen(false)} />
    </div>
  );
}

// ─── Chart data ───────────────────────────────────────────────────────────────
const STAT_DATA_1 = [
  { value: 10 },
  { value: 30 },
  { value: 20 },
  { value: 40 },
  { value: 30 },
  { value: 35 },
  { value: 20 },
];
const STAT_DATA_2 = [
  { value: 20 },
  { value: 40 },
  { value: 25 },
  { value: 45 },
  { value: 35 },
  { value: 20 },
  { value: 10 },
];
const STAT_DATA_3 = [
  { value: 40 },
  { value: 20 },
  { value: 30 },
  { value: 20 },
  { value: 40 },
  { value: 30 },
  { value: 20 },
];

// ─── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({
  value,
  unit,
  label,
  strokeColor,
  gradientId,
  data,
}: {
  value: string;
  unit: string;
  label: string;
  strokeColor: string;
  gradientId: string;
  data: { value: number }[];
}) {
  return (
    <div className="px-5 sm:px-6 pb-2 bg-white rounded-[20px] overflow-hidden border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative flex flex-col min-h-35 flex-1 min-w-50 shrink-0">
      <div className="flex flex-col pt-5 sm:pt-6">
        <div className="flex items-baseline gap-1.5 mb-1">
          <h2 className="text-[48px] font-bold text-[#34373C] leading-none tracking-[-0.04em]">
            {value}
          </h2>
          <span className="text-[18px] font-bold text-[#34373C]">{unit}</span>
        </div>
        <p className="text-[12px] font-medium text-[#A3A3A3]">{label}</p>
      </div>
      <div className="w-full h-12 mt-auto -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.8} />
                <stop offset="95%" stopColor="#D9D9D9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={3}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
