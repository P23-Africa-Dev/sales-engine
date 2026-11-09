"use client";

import AIIcon from "@/assets/images/ai-icon.png";
import ArrowUp from "@/assets/images/arrow-57deg.png";
import happyIcon from "@/assets/images/happy.png";
import SearchListIcon from "@/assets/images/search-list-icon.png";
import { FilterSelect } from "@/components/ui/filter-select";
import { useDashboardOverview } from "@/hooks/use-dashboard";
import { useCancelMeeting, useMeetingDetail, useMeetings } from "@/hooks/use-meetings";
import { useCalendarIntegrationStatus } from "@/hooks/use-calendar-integration";
import { getActiveCompanyContext } from "@/lib/company-context";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { canAccessMeetingCreation, canConnectGoogleCalendar, getMeetingAccessNotice, getMeetingCreationTooltip } from "@/lib/calendar-permissions";
import { cn } from "@/lib/utils/sample";
import { CalendarTooltip } from "@/components/ui/calendar-tooltip";
import { useAuthStore } from "@/store/auth";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ScheduleMeetingModal } from "@/components/operations/schedule-meeting-modal";
import { MeetingDetailsModal } from "@/components/dashboard/meeting-details-modal";
import type { MeetingItem } from "@/lib/api/meetings";

export function TopCustomers() {
  const customers = [
    {
      id: 1,
      name: "Lane Wade",
      type: "E-commerce",
      avatar: "https://i.pravatar.cc/150?u=lane",
    },
    {
      id: 2,
      name: "Lane Wade",
      type: "E-commerce",
      avatar: "https://i.pravatar.cc/150?u=lane2",
      active: true,
    },
  ];

  return (
    <div className="bg-dash-dark rounded-4xl p-8 text-white h-full flex flex-col shadow-2xl relative overflow-hidden ring-1 ring-white/5">
      <div className="flex justify-between items-start mb-10">
        <h3 className="text-white font-bold text-lg tracking-tight">
          Top Customers
        </h3>
        <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-white/20 transition-all font-bold text-[10px]">
          <span>Weekly</span>
          <ChevronRight size={10} className="rotate-90" />
        </div>
      </div>

      {/* Accurate Triple Ring Chart */}
      <div className="relative flex justify-center mb-12">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90 drop-shadow-[0_0_20px_rgba(79,209,197,0.15)]">
            {/* Ring 1 (Inner - Red) */}
            <circle
              cx="96"
              cy="96"
              r="38"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="96"
              cy="96"
              r="38"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              strokeDasharray="239"
              strokeDashoffset="48"
              strokeLinecap="round"
              className="text-dash-red"
            />

            {/* Ring 2 (Middle - Orange) */}
            <circle
              cx="96"
              cy="96"
              r="58"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="96"
              cy="96"
              r="58"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              strokeDasharray="364"
              strokeDashoffset="73"
              strokeLinecap="round"
              className="text-dash-orange"
            />

            {/* Ring 3 (Outer - Teal) */}
            <circle
              cx="96"
              cy="96"
              r="78"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="96"
              cy="96"
              r="78"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              strokeDasharray="490"
              strokeDashoffset="40"
              strokeLinecap="round"
              className="text-dash-teal"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[34px] font-black text-white drop-shadow-lg">
              99%
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-6 mb-12 text-[11px] font-bold text-white/70">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-dash-teal" /> Customer 1
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-dash-orange" /> Customer 2
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-dash-red" /> Customer 3
        </div>
      </div>

      <div className="space-y-4">
        {customers.map((c) => (
          <div
            key={c.id}
            className={cn(
              "flex items-center justify-between p-4 rounded-[28px] transition-all cursor-pointer group",
              c.active
                ? "bg-white text-dash-dark shadow-2xl scale-[1.02]"
                : "bg-white/5 text-white hover:bg-white/10",
            )}
          >
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "w-12 h-12 rounded-full border-2 p-0.5 transition-all duration-500",
                  c.active
                    ? "border-dash-teal shadow-inner"
                    : "border-dash-teal/20 group-hover:border-dash-teal",
                )}
              >
                <Image
                  src={c.avatar}
                  alt={c.name}
                  width={48}
                  height={48}
                  className="w-full h-full rounded-full object-cover"
                  unoptimized
                />
              </div>
              <div>
                <p
                  className={cn(
                    "text-sm font-bold tracking-tight",
                    c.active ? "text-dash-dark" : "text-white",
                  )}
                >
                  {c.name}
                </p>
                <p
                  className={cn(
                    "text-[11px] font-semibold",
                    c.active ? "text-dash-dark/40" : "text-white/30",
                  )}
                >
                  {c.type}
                </p>
              </div>
            </div>
            <button
              className={cn(
                "transition-colors",
                c.active
                  ? "text-dash-dark/20"
                  : "text-white/30 hover:text-white",
              )}
            >
              <MoreHorizontal size={22} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const taskFilterOptions = ["Daily", "Weekly", "Monthly"] as const;
type TaskFilter = (typeof taskFilterOptions)[number];

const TASK_COLORS = ["#7BB6B8", "#D086E6"] as const;

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeLabel(value: string | null): string {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPipelineLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRemainingTime(value: string | null): string {
  if (!value) {
    return "Starting soon";
  }

  const start = new Date(value);
  if (Number.isNaN(start.getTime())) {
    return "Starting soon";
  }

  const diffMs = start.getTime() - Date.now();
  if (diffMs <= 0) {
    return "In progress";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m left`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const remMinutes = totalMinutes % 60;
    return remMinutes === 0 ? `${totalHours}h left` : `${totalHours}h ${remMinutes}m left`;
  }

  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours === 0 ? `${days}d left` : `${days}d ${remHours}h left`;
}

export function WeeklyTasks() {
  const [filter, setFilter] = useState<TaskFilter>("Daily");

  return (
    <div className="drop-shadow-[0px_4px_6px_rgba(0,0,0,0.3)]">
      <div className="ticket-cutout w-full lg:max-w-89 rounded-[20px] py-4 px-4 sm:px-7 text-dash-dark h-fit flex flex-col relative border border-dash-dark/5 bg-white mt-4 lg:mt-20">
        <div className="flex justify-between items-start mb-3 px-[11.5px]">
          <h3 className="text-dash-dark font-medium text-sm tracking-tight">
            Weekly Tasks
          </h3>
          <FilterSelect
            value={filter}
            onChange={setFilter}
            options={taskFilterOptions}
          />
        </div>

        <div className="w-full h-px bg-[#D9D6D6] mb-5.5" />

        <div className="flex items-start gap-6 sm:gap-12 mb-5.5">
          <div>
            <p className="text-[50px] font-medium text-[#34373C] tracking-tighter leading-none mb-1">
              70%
            </p>
            <p className="text-[10px] text-[#616263]">Task Completed</p>
          </div>
          <div>
            <p className="text-[50px] font-medium text-[#34373C] tracking-tighter leading-none mb-1">
              31%
            </p>
            <p className="text-[10px] text-[#616263]">
              Better than previous intervals
            </p>
          </div>
        </div>

        <div className="bg-[#CAE3E3] text-[#616263] w-fit px-2.5 py-[6.5px] rounded-3xl flex items-center gap-1 mb-5.5 text-[10px] font-medium shadow-sm">
          <Image src={happyIcon} alt="User" className="w-6 h-6 rounded-full" />
          <p className="mr-2">Your work balance this week. Awesome!</p>
        </div>

        <div className="w-full h-px bg-[#D9D6D6] mb-3.75" />

        <div className="mb-6.5 relative px-5">
          <p className="text-[14px] font-medium text-[#34373C]">Ongoing tasks</p>

          <div className="w-full h-5 bg-[#F5F5F5] rounded-full p-1.5 shadow-inner ring-1 ring-dash-dark/5 mt-6.5">
            <div className="w-[20%] h-full bg-[#FD6046] rounded-full shadow-lg relative">
              <div className="absolute -top-6 -right-1.5 flex items-center gap-1.5  text-white rounded-full text-[9px] font-medium whitespace-nowrap -translate-y-1">
                <Image
                  src={DEFAULT_AVATAR}
                  alt="Attendee"
                  width={16}
                  height={16}
                  className="w-4 h-4 object-cover rounded-full overflow-hidden z-20"
                />
                <div className="bg-[#FD6046] leading-1.5 py-px px-0.75 text-[3px] rounded-r-[3px] absolute left-3.5">
                  Alex ... 42%
                </div>
                <div className="absolute rotate-180 w-1.5 h-1.75 -bottom-1 right-1 bg-[#FD6046] [clip-path:polygon(50%_0%,100%_100%,0%_100%)]" />
              </div>
            </div>
          </div>
        </div>

        <button className="w-full bg-[#D056DC] text-white py-5 rounded-4xl mb-4 flex items-center justify-between px-8 hover:opacity-95 transition-all text-sm group mt-auto">
          View All tasks
          <Image
            src={ArrowUp}
            alt="Arrow Up Right Icon"
            width={18}
            height={18}
            className="text-white/80 self-end pb-1.5"
          />
        </button>
      </div>
    </div>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const TRACKING_STATE_META: Record<
  "in_progress" | "near_destination" | "arrived" | "completed",
  { label: string; className: string }
> = {
  in_progress: { label: "En route", className: "bg-[#FD6046]/10 text-[#FD6046]" },
  near_destination: { label: "Near destination", className: "bg-[#F5A623]/10 text-[#C77700]" },
  arrived: { label: "Arrived", className: "bg-[#7BB6B8]/15 text-[#3F7E80]" },
  completed: { label: "Completed", className: "bg-[#2FA84F]/10 text-[#2FA84F]" },
};

export function WeeklyTasksAgents() {
  const router = useRouter();
  const [filter, setFilter] = useState<TaskFilter>("Daily");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showCreateMeetingModal, setShowCreateMeetingModal] = useState(false);
  const [meetingModalKey, setMeetingModalKey] = useState(0);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<MeetingItem | null>(null);
  const searchParams = useSearchParams();
  const meetingIdParam = searchParams.get('meetingId');
  const meetingIdFromUrl = useMemo(() => {
    if (!meetingIdParam) return null;
    const parsed = parseInt(meetingIdParam, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [meetingIdParam]);
  const activeMeetingId = selectedMeetingId ?? meetingIdFromUrl;
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const basePath = role === "agent" ? "/agent" : "/admin";
  const cancelMeetingMutation = useCancelMeeting();

  const { data: overview } = useDashboardOverview({
    company_id: companyId ?? undefined,
    basePath,
  });

  // Fetch integration status so the widget can reflect organization-level setup state
  const integrationStatusQuery = useCalendarIntegrationStatus(companyId ?? undefined);
  const calendarConnected = integrationStatusQuery.data?.connected === true;
  const canAccessMeetings = canAccessMeetingCreation(role, calendarConnected);
  const isCreateMeetingDisabled = !canAccessMeetings;
  const createMeetingTooltip = getMeetingCreationTooltip(role, calendarConnected);
  const meetingAccessNotice = getMeetingAccessNotice(role, calendarConnected);
  const meetingAccessNoticeTitle = canConnectGoogleCalendar(role) && !calendarConnected
    ? "Google Calendar Not Connected"
    : "Meeting creation unavailable";

  const { data: meetingsData } = useMeetings({
    company_id: companyId ?? undefined,
    per_page: 100,
  });

  const selectedMeetingSummary = useMemo(() => {
    if (activeMeetingId === null) {
      return null;
    }

    return (meetingsData?.meetings ?? []).find((meeting) => meeting.id === activeMeetingId) ?? null;
  }, [meetingsData?.meetings, activeMeetingId]);

  const meetingDetailQuery = useMeetingDetail(activeMeetingId ?? 0, companyId ?? undefined);
  const selectedMeeting = activeMeetingId !== null
    ? meetingDetailQuery.data ?? selectedMeetingSummary
    : null;

  const canManageSelectedMeeting = Boolean(
    selectedMeeting
    && (
      role === "owner"
      || role === "admin"
      || Number(selectedMeeting.created_by_user_id) === Number(user?.id)
    )
  );

  const handleCancelSelectedMeeting = () => {
    if (!selectedMeeting || !companyId) {
      return;
    }

    if (!window.confirm("Cancel this meeting? Attendees will be notified on Google Calendar.")) {
      return;
    }

    cancelMeetingMutation.mutate(
      { meetingId: selectedMeeting.id, companyId },
      {
        onSuccess: () => {
          toast.success("Meeting cancelled successfully.");
          setSelectedMeetingId(null);
        },
        onError: (error: unknown) => {
          const apiError = error as { message?: string };
          toast.error(apiError.message || "Failed to cancel meeting.");
        },
      }
    );
  };

  const formattedDate = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
  });

  const upcomingMeetings = useMemo(() => {
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    return (meetingsData?.meetings ?? [])
      .filter((meeting) => meeting.status === "scheduled" && Boolean(meeting.start_at))
      .map((meeting) => {
        const start = new Date(meeting.start_at);
        return {
          meeting,
          startsAt: start,
        };
      })
      .filter(({ startsAt }) => {
        if (Number.isNaN(startsAt.getTime())) {
          return false;
        }
        return startsAt.getTime() >= dayStart.getTime() && startsAt.getTime() <= dayEnd.getTime();
      })
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map(({ meeting }, index) => ({
        id: meeting.id,
        time: formatTimeLabel(meeting.start_at),
        date: new Date(meeting.start_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        title: meeting.title,
        organizer: meeting.creator?.name ?? "Organizer",
        status: formatPipelineLabel(meeting.status),
        remaining: formatRemainingTime(meeting.start_at ?? null),
        color: TASK_COLORS[index % TASK_COLORS.length],
      }));
  }, [meetingsData?.meetings, selectedDate]);
  const ongoingTask = overview?.ongoing_tasks?.[0] ?? null;
  const progressPercent = Math.max(
    0,
    Math.min(100, Number(ongoingTask?.progress_percent ?? 0))
  );
  const agentName = ongoingTask?.agent?.name ?? "No active task";
  const badgeText = ongoingTask
    ? `${agentName.split(" ")[0]} ... ${Math.round(progressPercent)}%`
    : "No Active Task";
  const trackingStateMeta = ongoingTask
    ? TRACKING_STATE_META[ongoingTask.tracking_state] ?? null
    : null;
  const tasksRoute = role === "agent" ? "/agent/tasks" : "/projects?tab=tasks";

  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(monthIndex);
    setSelectedDate(newDate);
    setShowMonthPicker(false);
  };

  return (
    <div className="drop-shadow-[0px_4px_6px_rgba(0,0,0,0.3)] lg:shrink-0">
      <div className="ticket-cutout w-full lg:w-89 rounded-[20px] pt-4 px-4 sm:px-7 text-dash-dark h-fit flex flex-col relative border border-dash-dark/5 bg-white mt-4 lg:mt-20">
        <div className="flex justify-between items-start mb-3 px-[11.5px]">
          <h3 className="text-dash-dark font-medium text-sm tracking-tight">
            Meeting
          </h3>
          <FilterSelect
            value={filter}
            onChange={setFilter}
            options={taskFilterOptions}
          />
        </div>

        <div className="flex items-center justify-between bg-[#F8F8F8] rounded-full px-4 py-2 mb-2 mx-2 relative">
          <button
            onClick={handlePrevDay}
            className="text-gray-400 hover:text-dash-dark transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMonthPicker(!showMonthPicker)}
              className="flex items-center gap-2 text-[12px] font-medium text-[#09232D] hover:opacity-70 transition-all"
            >
              <span>{formattedDate}</span>
              <ChevronRight size={14} className="rotate-90 text-gray-400" />
            </button>

            {showMonthPicker && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-2 min-w-[120px] max-h-48 overflow-y-auto custom-scrollbar">
                {MONTHS.map((month, idx) => (
                  <button
                    key={month}
                    onClick={() => handleMonthSelect(idx)}
                    className={cn(
                      "w-full text-left px-4 py-2 text-[11px] hover:bg-gray-50 transition-colors",
                      selectedDate.getMonth() === idx ? "text-dash-teal font-bold" : "text-gray-600"
                    )}
                  >
                    {month}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleNextDay}
            className="text-gray-400 hover:text-dash-dark transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="space-y-3 mb-4 min-h-[100px] flex flex-col justify-center">
          {upcomingMeetings.length > 0 ? (
            <div className="space-y-3 w-full">
              {upcomingMeetings.map((task, i) => (
                <div
                  key={task.id}
                  className="rounded-[40px] px-4 py-3 flex items-center gap-4 text-white animate-in fade-in slide-in-from-right-4 duration-300 w-full cursor-pointer"
                  style={{ backgroundColor: task.color }}
                  onClick={() => setSelectedMeetingId(task.id)}
                >
                  <div className="text-[16px] font-bold whitespace-nowrap min-w-[50px]">
                    {task.time}
                  </div>
                  <div className="flex flex-col">
                    <p className="text-[14px] font-bold leading-tight">
                      {task.title}
                    </p>
                    <p className="text-[10px] opacity-80 leading-tight mt-0.5">
                      {task.date} • Organizer: {task.organizer}
                    </p>
                    <p className="text-[10px] opacity-80 leading-tight mt-0.5">
                      Status: {task.status} • {task.remaining}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            meetingAccessNotice && !integrationStatusQuery.isPending ? (
              <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-5 text-amber-800 w-full">
                <p className="text-[13px] font-bold text-amber-900">{meetingAccessNoticeTitle}</p>
                <p className="mt-1 text-[11px] leading-relaxed">
                  {meetingAccessNotice}
                </p>
              </div>
            ) : (
              <div
                className="rounded-[40px] px-4 py-5 flex items-center justify-center text-white w-full"
                style={{ backgroundColor: "#7BB6B8" }}
              >
                <p className="text-[13px] font-semibold opacity-90">No meetings for this day</p>
              </div>
            )
          )}
        </div>

        <div className="flex justify-end mb-2 px-4">
          {isCreateMeetingDisabled && createMeetingTooltip ? (
            <CalendarTooltip message={createMeetingTooltip} side="left">
              <button
                disabled
                className="w-10 h-10 rounded-full border-2 border-[#7BB6B8] flex items-center justify-center text-[#7BB6B8] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={24} />
              </button>
            </CalendarTooltip>
          ) : (
            <button
              disabled={isCreateMeetingDisabled}
              onClick={() => { setMeetingModalKey((k) => k + 1); setShowCreateMeetingModal(true); }}
              className="w-10 h-10 rounded-full border-2 border-[#7BB6B8] flex items-center justify-center text-[#7BB6B8] hover:bg-[#7BB6B8]/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={24} />
            </button>
          )}
        </div>

        <div className="w-full h-px bg-[#D9D6D6] mb-2.75" />

        <div className="mb-4 relative px-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-medium text-[#34373C]">Ongoing tasks</p>
            {trackingStateMeta && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  trackingStateMeta.className,
                )}
              >
                {trackingStateMeta.label}
              </span>
            )}
          </div>

          <div className="w-full h-5 bg-[#F5F5F5] rounded-full p-1.5 shadow-inner ring-1 ring-dash-dark/5 mt-6.5">
            <div className="h-full bg-[#FD6046] rounded-full shadow-lg relative" style={{ width: `${progressPercent}%` }}>
              <div className="absolute -top-6 -right-1.5 flex items-center gap-1.5  text-white rounded-full text-[9px] font-medium whitespace-nowrap -translate-y-1">
                {ongoingTask?.agent?.avatar_url ? (
                  <Image
                    src={ongoingTask.agent.avatar_url}
                    alt={ongoingTask.agent.name}
                    width={16}
                    height={16}
                    className="w-4 h-4 object-cover rounded-full overflow-hidden z-20"
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-white text-[#FD6046] text-[7px] font-bold flex items-center justify-center z-20">
                    {ongoingTask?.agent?.initials ?? "A"}
                  </div>
                )}
                <div className="bg-[#FD6046] leading-1.5 py-px px-0.75 text-[3px] rounded-r-[3px] absolute left-3.5">
                  {badgeText}
                </div>
                <div className="absolute rotate-180 w-1.5 h-1.75 -bottom-1 right-1 bg-[#FD6046] [clip-path:polygon(50%_0%,100%_100%,0%_100%)]" />
              </div>
            </div>
          </div>
        </div>

        <button onClick={() => router.push(tasksRoute)} className="w-full bg-[#8B2FA1] text-white py-5 rounded-4xl mb-2 flex items-center justify-between px-8 hover:opacity-95 transition-all text-sm group mt-auto">
          View All tasks
          <Image
            src={ArrowUp}
            alt="Arrow Up Right Icon"
            width={18}
            height={18}
            className="text-white/80 self-end pb-1.5"
          />
        </button>
      </div>

      <ScheduleMeetingModal
        key={meetingModalKey}
        isOpen={showCreateMeetingModal || editingMeeting != null}
        onClose={() => {
          setShowCreateMeetingModal(false);
          setEditingMeeting(null);
        }}
        defaultDate={selectedDate}
        title={editingMeeting ? "Edit Meeting" : "Schedule Meeting"}
        sourcePage="dashboard"
        initialMeeting={editingMeeting}
        onUpdated={() => {
          setEditingMeeting(null);
          setSelectedMeetingId(null);
        }}
      />

      <MeetingDetailsModal
        isOpen={activeMeetingId !== null && editingMeeting == null}
        onClose={() => setSelectedMeetingId(null)}
        meeting={selectedMeeting ?? null}
        canManage={canManageSelectedMeeting}
        onEdit={() => {
          if (!selectedMeeting) {
            return;
          }
          setEditingMeeting(selectedMeeting);
          setSelectedMeetingId(null);
        }}
        onCancelMeeting={handleCancelSelectedMeeting}
        isCancelling={cancelMeetingMutation.isPending}
      />
    </div>
  );
}

export function CRMPipeline() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const basePath = role === "agent" ? "/agent" : "/admin";
  const crmRoute = role === "agent" ? "/agent/crm" : "/crm";

  const { data: overview } = useDashboardOverview({
    company_id: companyId ?? undefined,
    basePath,
  });

  const topStages = useMemo(() => {
    const stages = overview?.crm_pipeline_snapshot?.stages ?? [];
    return [...stages].sort((a, b) => b.count - a.count).slice(0, 3);
  }, [overview?.crm_pipeline_snapshot?.stages]);

  return (
    <div onClick={() => router.push(crmRoute)} className="py-6 px-2.75 pb-10 bg-[#D056DC] h-fit rounded-[20px] text-white relative overflow-hidden mb-2.5 shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026] cursor-pointer">
      <div className="z-20 relative">
        <div className="w-12.75 h-12.75 rounded-[50px] bg-[#D056DC] backdrop-blur-xl flex items-center justify-center mb-2.25 drop-shadow-[0px_4px_6px_rgba(0,0,0,0.3)]">
          <Image
            src={SearchListIcon}
            alt="Search List Icon"
            width={28}
            height={28}
            className="text-white drop-shadow-md"
          />
        </div>

        <h4 className="text-xs font-bold mb-1 leading-5.5 w-full">
          View CRM Pipeline
        </h4>
        <p className="text-[8px] text-white font-light leading-2.25 pr-3.25">
          Get an intelligent review of your current leads, outreach performance,
          and engagement trends.
        </p>

        {/* <div className="mt-3 space-y-1.5">
          {topStages.length === 0 ? (
            <p className="text-[8px] text-white/85">No pipeline data available yet.</p>
          ) : (
            topStages.map((stage) => (
              <div
                key={stage.status}
                className="flex items-center justify-between rounded-md bg-white/15 px-2 py-1"
              >
                <span className="text-[8px] font-medium">{formatPipelineLabel(stage.status)}</span>
                <span className="text-[8px] font-bold">{stage.count}</span>
              </div>
            ))
          )}
        </div> */}
      </div>
      <div className="absolute w-40 h-51.5 bg-linear-to-l from-[#C248CE] to-[#F7ABFF] -left-10 -top-10 rounded-[50%_50%_45%_45%/60%_60%_40%_40%] transition-all duration-700 z-0" />
    </div>
  );
}

export function AIWorkspace() {
  return (
    <div className="py-4 px-2.75 bg-[#7BB6B8] h-fit rounded-[20px] text-white relative overflow-hidden shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026]">
      <div className="z-20 relative text-[#09232D]">
        <div className="w-12.75 h-12.75 rounded-[50px] bg-[#09232D] backdrop-blur-xl flex items-center justify-center mb-2.25 drop-shadow-[0px_4px_6px_rgba(0,0,0,0.3)]">
          <Image
            src={AIIcon}
            alt="AI Icon"
            width={28}
            height={28}
            className="text-white drop-shadow-md"
          />
        </div>

        <h4 className="text-xs font-bold mb-1 leading-5.5 w-full">
          Prospect Builder
        </h4>
        <p className="text-[8px] font-light leading-2.25 pr-3.25">
          Generate leads, draft outreach, or get recommendations using single
          line prompt
        </p>
        <Link
          href="/sales-engine"
          className="mt-4 text-[10px] w-full font-semibold bg-[#09232D] py-[10.5px] rounded-[10px] flex items-center justify-center gap-1 hover:bg-[#09232D]/90 transition-all text-white"
        >
          Try Now
        </Link>
      </div>
      <div className="absolute w-40 h-51.5 bg-linear-to-l from-[#7BB6B8] to-[#9DD8DA] -left-10 top-20 rounded-[50%_50%_45%_45%/60%_60%_40%_40%] transition-all duration-700 z-0" />
    </div>
  );
}
