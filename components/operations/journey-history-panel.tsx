"use client";

import Link from "next/link";
import { format, parse, parseISO, subDays } from "date-fns";
import {
  CalendarDays,
  Clock,
  Download,
  Loader2,
  MapPinned,
  Navigation,
  Route,
} from "lucide-react";
import { useAgentJourneys, useMyJourneys } from "@/hooks/use-field-journeys";
import type { JourneyCard } from "@/lib/api/field-activity";
import {
  buildJourneysCsv,
  downloadTextFile,
} from "@/lib/tracking/export-journeys-csv";

function formatKm(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function JourneyEntry({
  journey,
  href,
}: {
  journey: JourneyCard;
  href: string;
}) {
  const date = journey.date ? parse(journey.date, "yyyy-MM-dd", new Date()) : null;
  const dayLabel = date ? format(date, "EEE") : "—";
  const dayNum = date ? format(date, "d") : "—";
  const monthLabel = date ? format(date, "MMM") : "";
  const clockIn = journey.clock_in_at
    ? format(parseISO(journey.clock_in_at), "h:mma")
    : null;
  const clockOut = journey.clock_out_at
    ? format(parseISO(journey.clock_out_at), "h:mma")
    : null;
  const isActive = journey.status === "active";
  const hasNoRoutePoints = !isActive && journey.distance_meters <= 0;

  return (
    <div className="flex items-stretch gap-3 group">
      <div className="flex flex-col items-center w-10 shrink-0 pt-0.5">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none">
          {dayLabel}
        </p>
        <p className="text-[18px] font-black text-[#0B1215] leading-tight">{dayNum}</p>
        <p className="text-[9px] text-gray-400 uppercase leading-none">{monthLabel}</p>
      </div>

      <div className="flex flex-col items-center gap-0 shrink-0">
        <div
          className={`w-3 h-3 rounded-full mt-1 shrink-0 ring-2 ${
            isActive
              ? "bg-sky-500 ring-sky-100"
              : "bg-[#2F5E71] ring-[#2F5E71]/20"
          }`}
        />
        <div className="w-px flex-1 bg-gray-100 mt-1" />
      </div>

      <div className="flex-1 min-w-0 pb-3">
        <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] group-hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-shadow">
          <div className="flex items-start justify-between gap-2 mb-2">
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
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                        <span className="text-[11px] text-gray-500">{clockOut}</span>
                      </div>
                    </>
                  )}
                  {isActive && !clockOut && (
                    <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                      Live
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-gray-400 italic">No clock in recorded</span>
              )}
            </div>
            <span
              className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide ${
                isActive
                  ? "bg-sky-50 text-sky-700"
                  : "bg-[#EEF4F4] text-[#094B5C]"
              }`}
            >
              {isActive ? "Active" : "Completed"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-3">
            <div className="flex items-center gap-1.5">
              <Route size={10} className="text-gray-400" />
              <span className="text-[10px] text-gray-500 font-medium">
                {formatKm(journey.distance_meters)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPinned size={10} className="text-gray-400" />
              <span className="text-[10px] text-gray-500 font-medium">
                {journey.stop_count} stops · {journey.visit_count} visits
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={10} className="text-gray-400" />
              <span className="text-[10px] text-gray-500 font-medium">
                {formatDuration(journey.active_seconds)} active
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Navigation size={10} className="text-gray-400" />
              <span className="text-[10px] text-gray-500 font-medium">
                {journey.unknown_stop_count > 0
                  ? `${journey.unknown_stop_count} unknown`
                  : journey.travel_efficiency != null
                    ? `${Math.round(journey.travel_efficiency * 100)}% efficiency`
                    : "—"}
              </span>
            </div>
          </div>

          {hasNoRoutePoints && (
            <p className="mb-2 text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1">
              Session exists, but route points were not captured for this day.
            </p>
          )}

          <Link
            href={href}
            className="inline-flex items-center justify-center w-full rounded-xl bg-[#0B1215] text-white text-[11px] font-bold py-2 hover:bg-[#1a2428] transition-colors"
          >
            View Journey
          </Link>
        </div>
      </div>
    </div>
  );
}

type JourneyHistoryPanelProps = {
  selected: { userId: number | string; name: string };
  companyId: number | string | undefined;
  journeyBasePath?: string;
  /** Managers pass "managed"; agents viewing self pass "mine". */
  mode?: "managed" | "mine";
};

export function JourneyHistoryPanel({
  selected,
  companyId,
  journeyBasePath = "/operations/journeys",
  mode = "managed",
}: JourneyHistoryPanelProps) {
  const toDate = format(new Date(), "yyyy-MM-dd");
  const fromDate = format(subDays(new Date(), 29), "yyyy-MM-dd");
  const params = {
    company_id: companyId,
    from: fromDate,
    to: toDate,
    preset: "last_30_days" as const,
    per_page: 30,
  };

  const managedQuery = useAgentJourneys(
    mode === "managed" ? selected.userId : undefined,
    params,
  );
  const mineQuery = useMyJourneys(mode === "mine" ? params : { company_id: undefined });

  const data = mode === "mine" ? mineQuery.data : managedQuery.data;
  const isLoading = mode === "mine" ? mineQuery.isLoading : managedQuery.isLoading;

  const journeys = data?.items ?? [];
  const summary = data?.summary;

  const handleExportCsv = () => {
    if (journeys.length === 0) return;
    const csv = buildJourneysCsv(journeys, selected.name);
    const stamp = format(new Date(), "yyyy-MM-dd");
    downloadTextFile(`journey-history-${selected.userId}-${stamp}.csv`, csv);
  };

  return (
    <div className="flex flex-col rounded-3xl overflow-hidden shadow-[0px_4px_14px_rgba(9,35,45,0.18)]">
      <div className="bg-dash-dark px-5 py-5 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              Journey History
            </p>
            <p className="text-[15px] font-bold text-white mt-0.5">{selected.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={journeys.length === 0 || isLoading}
              className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-40 px-3 py-1.5 rounded-full transition-colors"
              title="Export CSV"
            >
              <Download size={11} className="text-white/70" />
              <span className="text-[10px] font-bold text-white/70">Export</span>
            </button>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full">
              <CalendarDays size={11} className="text-white/60" />
              <span className="text-[10px] font-bold text-white/70">Last 30 days</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/8 border border-white/10 rounded-2xl px-3 py-3 flex flex-col items-center gap-0.5">
            <span className="text-[22px] font-black text-white leading-none">
              {summary?.journey_count ?? 0}
            </span>
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span className="text-[9px] font-bold text-sky-400 uppercase tracking-wide">
                Days
              </span>
            </div>
          </div>
          <div className="bg-white/8 border border-white/10 rounded-2xl px-3 py-3 flex flex-col items-center gap-0.5">
            <span className="text-[18px] font-black text-white leading-none">
              {formatKm(summary?.distance_meters ?? 0)}
            </span>
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wide">
                Distance
              </span>
            </div>
          </div>
          <div className="bg-white/8 border border-white/10 rounded-2xl px-3 py-3 flex flex-col items-center gap-0.5">
            <span className="text-[22px] font-black text-white leading-none">
              {summary?.visit_count ?? 0}
            </span>
            <div className="flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wide">
                Visits
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#F8F9FA] flex-1 overflow-y-auto max-h-80 p-4 pt-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={22} className="animate-spin text-gray-300" />
          </div>
        ) : journeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Route size={28} className="text-gray-300" />
            <p className="text-[12px] text-gray-400 font-medium">No journeys yet</p>
            <p className="text-[10px] text-gray-400 text-center max-w-[220px]">
              Journeys appear when Field Activity is enabled and the agent clocks in.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {journeys.map((journey) => (
              <JourneyEntry
                key={journey.id}
                journey={journey}
                href={`${journeyBasePath}/${journey.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
