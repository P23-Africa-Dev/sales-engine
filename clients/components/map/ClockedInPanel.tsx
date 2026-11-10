"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Clock3, Crosshair, Eye, EyeOff, Users } from "lucide-react";
import type { AttendanceMapSnapshotItem } from "@/lib/api/attendance";
import { getAgentInitials } from "@/lib/tracking/map-visualization";

type ClockedInPanelProps = {
  items: AttendanceMapSnapshotItem[];
  isLoading?: boolean;
  selectedUserId: number | null;
  onSelect: (item: AttendanceMapSnapshotItem) => void;
  showAttendanceLink?: boolean;
  followAllActive?: boolean;
  focusMode?: boolean;
  onFollowSelected?: () => void;
  onToggleFollowAll?: () => void;
  onToggleFocusMode?: () => void;
};

export function ClockedInPanel({
  items,
  isLoading = false,
  selectedUserId,
  onSelect,
  showAttendanceLink = true,
  followAllActive = false,
  focusMode = false,
  onFollowSelected,
  onToggleFollowAll,
  onToggleFocusMode,
}: ClockedInPanelProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="w-5 h-5 border-2 border-gray-200 border-t-dash-teal rounded-full animate-spin" />
        <p className="text-[12px] text-gray-400">Loading clocked-in agents…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Clock3 size={24} className="text-gray-200" />
        <p className="text-[12px] text-gray-400">No agents clocked in today</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-2">
      <div className="flex flex-wrap gap-2 pb-1">
        {onToggleFollowAll ? (
          <button
            type="button"
            onClick={onToggleFollowAll}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              followAllActive
                ? "bg-[#2F5E71] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Users size={12} />
            {followAllActive ? "Following all" : "Follow all"}
          </button>
        ) : null}
        {onFollowSelected ? (
          <button
            type="button"
            disabled={selectedUserId == null}
            onClick={onFollowSelected}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40"
          >
            <Crosshair size={12} />
            Follow agent
          </button>
        ) : null}
        {onToggleFocusMode ? (
          <button
            type="button"
            onClick={onToggleFocusMode}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              focusMode
                ? "bg-amber-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {focusMode ? <EyeOff size={12} /> : <Eye size={12} />}
            {focusMode ? "Exit focus" : "Focus"}
          </button>
        ) : null}
      </div>

      {items.map((item) => {
        const isSelected = selectedUserId === item.user_id;
        const clockInLabel = item.clock_in_at
          ? format(parseISO(item.clock_in_at), "h:mm a")
          : "—";

        return (
          <button
            key={item.user_id}
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-all rounded-[20px] ${
              isSelected ? "bg-[#0A192F]" : "bg-[#F8FAFC] hover:bg-gray-100"
            }`}
          >
            <ClockInListAvatar name={item.agent_name} avatarUrl={item.avatar_url} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p
                  className={`text-[14px] font-bold truncate ${
                    isSelected ? "text-white" : "text-dash-dark"
                  }`}
                >
                  {item.agent_name}
                </p>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    item.is_late
                      ? isSelected
                        ? "bg-orange-500/20 text-orange-200"
                        : "bg-orange-50 text-orange-600"
                      : isSelected
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {item.is_late ? "Late" : "On time"}
                </span>
              </div>
              <p
                className={`text-[12px] truncate ${
                  isSelected ? "text-white/60" : "text-gray-400"
                }`}
              >
                Clocked in {clockInLabel}
              </p>
            </div>
          </button>
        );
      })}

      {showAttendanceLink ? (
        <Link
          href="/operations"
          className="block text-center text-[12px] font-semibold text-[#2F5E71] pt-2"
        >
          Open Journey History
        </Link>
      ) : null}
    </div>
  );
}

function ClockInListAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (avatarUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="h-10 w-10 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="h-10 w-10 rounded-full bg-[#75ADAF]/20 text-[#2F5E71] flex items-center justify-center text-[12px] font-bold">
      {getAgentInitials(name)}
    </div>
  );
}
