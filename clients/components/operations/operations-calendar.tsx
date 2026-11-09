'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { useCancelMeeting, useMeetingDetail, useMeetings } from '@/hooks/use-meetings';
import { useCalendarIntegrationStatus } from '@/hooks/use-calendar-integration';
import { canAccessMeetingCreation, canConnectGoogleCalendar, getMeetingAccessNotice, getMeetingCreationTooltip } from '@/lib/calendar-permissions';
import { CalendarTooltip } from '@/components/ui/calendar-tooltip';
import { MeetingDetailsModal } from '@/components/dashboard/meeting-details-modal';
import type { MeetingItem } from '@/lib/api/meetings';
import { ScheduleMeetingModal } from './schedule-meeting-modal';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const TASK_COLORS = ['#7EB5AE', '#E1A6E7', '#9CC7F9'] as const;

type OperationsCalendarProps = {
    projectId?: string | number;
    taskId?: string | number;
};

function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatStatusLabel(status?: string): string {
    if (!status) return 'Pending';
    return status
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function formatTimeLabel(value?: string): string {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatDateLabel(value?: string): string {
    if (!value) return 'No due date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No due date';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}

export function OperationsCalendar({ projectId, taskId }: OperationsCalendarProps) {
    const user = useAuthStore((s) => s.user);
    const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [month, setMonth] = useState(selectedDate.getMonth());
    const [year, setYear] = useState(selectedDate.getFullYear());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createModalKey, setCreateModalKey] = useState(0);
    const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
    const [editingMeeting, setEditingMeeting] = useState<MeetingItem | null>(null);
    const cancelMeetingMutation = useCancelMeeting();

    // Fetch integration status so the calendar can reflect organization-level setup state
    const integrationStatusQuery = useCalendarIntegrationStatus(
        companyId ?? undefined
    );
    const calendarConnected = integrationStatusQuery.data?.connected === true;
    const canAccessMeetings = canAccessMeetingCreation(role, calendarConnected);
    const isCreateDisabled = !canAccessMeetings;
    const createTooltip = getMeetingCreationTooltip(role, calendarConnected);
    const meetingAccessNotice = getMeetingAccessNotice(role, calendarConnected);
    const meetingAccessNoticeTitle = canConnectGoogleCalendar(role) && !calendarConnected
        ? 'Google Calendar Not Connected'
        : 'Meeting creation unavailable';

    const { data: meetingsData, isPending } = useMeetings({
        company_id: companyId ?? undefined,
        project_id: projectId,
        task_id: taskId,
        per_page: 100,
    });

    const viewerId = Number(user?.id ?? 0);
    const viewerEmail = String(user?.email ?? '').trim().toLowerCase();
    const hasMeetingContext = projectId != null || taskId != null;

    const selfMeetings = useMemo(() => {
        const meetings = meetingsData?.meetings ?? [];

        if (hasMeetingContext) {
            return meetings;
        }

        return meetings.filter((meeting) => {
            if (meeting.project_id !== null && meeting.project_id !== undefined) {
                return false;
            }

            const createdBy = Number(meeting.created_by_user_id ?? 0);
            const invited = (meeting.attendees ?? []).some((attendee) => {
                const attendeeUserId = attendee.user_id != null ? Number(attendee.user_id) : 0;
                const attendeeEmail = String(attendee.email ?? '').trim().toLowerCase();

                return (viewerId > 0 && attendeeUserId === viewerId)
                    || (viewerEmail !== '' && attendeeEmail === viewerEmail);
            });

            return (viewerId > 0 && createdBy === viewerId) || invited;
        });
    }, [hasMeetingContext, meetingsData?.meetings, viewerEmail, viewerId]);

    const meetingsByDate = useMemo(() => {
        const grouped: Record<string, Array<{ id: number; time: string; title: string; desc: string; bg: string; shadow: string }>> = {};

        selfMeetings.forEach((meeting, index) => {
            if (!meeting.start_at) {
                return;
            }

            const dueDate = new Date(meeting.start_at);
            if (Number.isNaN(dueDate.getTime())) {
                return;
            }

            const dateKey = toDateKey(dueDate);
            const color = TASK_COLORS[index % TASK_COLORS.length];
            grouped[dateKey] ??= [];
            grouped[dateKey].push({
                id: meeting.id,
                time: formatTimeLabel(meeting.start_at),
                title: meeting.title,
                desc: `Status: ${formatStatusLabel(meeting.status)}`,
                bg: color,
                shadow: color === '#7EB5AE' ? 'rgba(126,181,174,0.35)' : color === '#E1A6E7' ? 'rgba(225,166,231,0.35)' : 'rgba(156,199,249,0.35)',
            });
        });

        return grouped;
    }, [selfMeetings]);

    const dayTasks = meetingsByDate[toDateKey(selectedDate)] ?? [];

    const upcomingMeetings = useMemo(() => {
        const now = new Date();

        return selfMeetings
            .filter((meeting) => {
                if (!meeting.start_at) return false;
                const dueDate = new Date(meeting.start_at);
                return !Number.isNaN(dueDate.getTime()) && dueDate >= now;
            })
            .sort((a, b) => new Date(a.start_at ?? '').getTime() - new Date(b.start_at ?? '').getTime())
            .slice(0, 2);
    }, [selfMeetings]);

    const meetingDetailQuery = useMeetingDetail(selectedMeetingId ?? 0, companyId ?? undefined);
    const selectedMeetingSummary = useMemo(
        () => selfMeetings.find((meeting) => meeting.id === selectedMeetingId) ?? null,
        [selfMeetings, selectedMeetingId]
    );
    const selectedMeeting = selectedMeetingId != null
        ? meetingDetailQuery.data ?? selectedMeetingSummary
        : null;
    const canManageSelectedMeeting = Boolean(
        selectedMeeting
        && (
            role === 'owner'
            || role === 'admin'
            || Number(selectedMeeting.created_by_user_id) === Number(user?.id)
        )
    );

    const handleCancelSelectedMeeting = () => {
        if (!selectedMeeting || !companyId) {
            return;
        }

        if (!window.confirm('Cancel this meeting? Attendees will be notified on Google Calendar.')) {
            return;
        }

        cancelMeetingMutation.mutate(
            { meetingId: selectedMeeting.id, companyId },
            {
                onSuccess: () => {
                    toast.success('Meeting cancelled successfully.');
                    setSelectedMeetingId(null);
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || 'Failed to cancel meeting.');
                },
            }
        );
    };

    const modalSourcePage = taskId != null ? 'task' : projectId != null ? 'project' : 'operations';

    const prevMonth = () => {
        if (month === 0) {
            const nextYear = year - 1;
            setMonth(11);
            setYear(nextYear);
            setSelectedDate(new Date(nextYear, 11, 1));
            return;
        }

        const nextMonth = month - 1;
        setMonth(nextMonth);
        setSelectedDate(new Date(year, nextMonth, 1));
    };

    const nextMonth = () => {
        if (month === 11) {
            const nextYear = year + 1;
            setMonth(0);
            setYear(nextYear);
            setSelectedDate(new Date(nextYear, 0, 1));
            return;
        }

        const nextMonth = month + 1;
        setMonth(nextMonth);
        setSelectedDate(new Date(year, nextMonth, 1));
    };

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);

    const isSelected = (day: number) => {
        return (
            selectedDate.getDate() === day &&
            selectedDate.getMonth() === month &&
            selectedDate.getFullYear() === year
        );
    };

    const handleSelectDay = (day: number) => {
        setSelectedDate(new Date(year, month, day));
    };

    const getDayLabel = (day: number) => {
        const date = new Date(year, month, day);
        return DAY_LABELS[date.getDay()];
    };

    return (
        <>
            <div className="relative flex min-h-[430px] flex-col">
                <div className="mb-4 flex items-center justify-between px-2">
                    <h3 className="text-[17px] font-extrabold tracking-tight text-[#094B5C]">Schedule Meeting</h3>
                    <MoreVertical size={20} className="cursor-pointer text-[#094B5C]" strokeWidth={2.5} />
                </div>

                <div className="mb-8 flex items-center justify-center gap-12">
                    <button onClick={prevMonth} className="p-1 text-gray-300 transition-colors hover:text-[#094B5C]">
                        <ChevronLeft size={20} strokeWidth={2} />
                    </button>
                    <span className="text-[17px] font-semibold text-[#094B5C]">
                        {MONTHS[month]}, {year}
                    </span>
                    <button onClick={nextMonth} className="p-1 text-gray-300 transition-colors hover:text-[#094B5C]">
                        <ChevronRight size={20} strokeWidth={2} />
                    </button>
                </div>

                <div className="no-scrollbar mb-2 flex gap-6 overflow-x-auto px-2 pb-4">
                    {days.map((day) => {
                        const selected = isSelected(day);

                        return (
                            <div
                                key={day}
                                className="flex min-w-[32px] cursor-pointer flex-col items-center"
                                onClick={() => handleSelectDay(day)}
                            >
                                <span
                                    className={`mb-3 text-[13px] font-medium transition-colors ${selected ? 'text-[#7EB5AE]' : 'text-gray-400'
                                        }`}
                                >
                                    {getDayLabel(day)}
                                </span>
                                <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] transition-all ${selected
                                        ? 'bg-[#F26442] font-semibold text-white shadow-lg'
                                        : 'font-medium text-gray-300 hover:bg-gray-100 hover:text-[#094B5C]'
                                        }`}
                                >
                                    {day}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mb-3 space-y-2">
                    {meetingAccessNotice && !integrationStatusQuery.isPending ? (
                        <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-[11px] text-amber-800">
                            <p className="font-bold mb-1 text-amber-900">{meetingAccessNoticeTitle}</p>
                            <p className="leading-relaxed">
                                {meetingAccessNotice}
                            </p>
                        </div>
                    ) : isPending ? (
                        <div className="rounded-[20px] border border-gray-100 bg-gray-50 px-4 py-3 text-[12px] text-gray-500">
                            Loading meetings...
                        </div>
                    ) : dayTasks.length > 0 ? (
                        dayTasks.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setSelectedMeetingId(item.id)}
                                className="flex cursor-pointer items-center rounded-[24px] px-6 py-2 transition-transform hover:scale-[1.01]"
                                style={{ backgroundColor: item.bg, boxShadow: `0 10px 20px ${item.shadow}` }}
                            >
                                <div className="flex w-full items-center gap-6">
                                    <span className="w-14 shrink-0 text-[12px] font-medium text-white">{item.time}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[12px] font-bold leading-snug text-white">{item.title}</p>
                                        <p className="mt-1 text-[11px] leading-snug text-white/90">{item.desc}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="rounded-[20px] border border-dashed border-gray-200 px-4 py-6 text-center text-[12px] font-medium text-gray-400">
                            No self meeting scheduled for this day.
                        </div>
                    )}
                </div>

                <div className="mb-2 border-t border-[#D9D6D6] pt-3">
                    <p className="mb-2 px-1 text-[13px] font-semibold text-[#34373C]">Upcoming Self Meetings</p>
                    {upcomingMeetings.length > 0 ? (
                        <div className="space-y-2">
                            {upcomingMeetings.map((meeting) => (
                                <div
                                    key={meeting.id}
                                    onClick={() => setSelectedMeetingId(meeting.id)}
                                    className="cursor-pointer rounded-[16px] bg-[#F8FAFB] px-4 py-3 transition-colors hover:bg-gray-100"
                                >
                                    <p className="text-[12px] font-bold text-[#0B1215]">{meeting.title}</p>
                                    <p className="mt-1 text-[11px] text-gray-500">
                                        {formatDateLabel(meeting.start_at)} • {formatStatusLabel(meeting.status)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="px-1 text-[11px] text-gray-400">No upcoming standalone meetings.</p>
                    )}
                </div>

                <div className="absolute bottom-[50px] right-2">
                    {isCreateDisabled && createTooltip ? (
                        <CalendarTooltip message={createTooltip} side="left">
                            <button
                                disabled
                                className="flex h-8 w-8 items-center justify-center rounded-full border-[2px] border-[#7EB5AE] text-[#7EB5AE] shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Plus size={10} strokeWidth={2.5} />
                            </button>
                        </CalendarTooltip>
                    ) : (
                        <button
                            disabled={isCreateDisabled}
                            onClick={() => { setCreateModalKey((k) => k + 1); setShowCreateModal(true); }}
                            className="flex h-8 w-8 items-center justify-center rounded-full border-[2px] border-[#7EB5AE] text-[#7EB5AE] shadow-sm transition-all hover:bg-[#7EB5AE] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Plus size={10} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            </div>

            <ScheduleMeetingModal
                key={createModalKey}
                isOpen={showCreateModal || editingMeeting != null}
                onClose={() => {
                    setShowCreateModal(false);
                    setEditingMeeting(null);
                }}
                defaultDate={selectedDate}
                title={
                    editingMeeting
                        ? 'Edit Meeting'
                        : projectId != null
                            ? 'Schedule Project Meeting'
                            : taskId != null
                                ? 'Schedule Task Meeting'
                                : 'Schedule Meeting'
                }
                sourcePage={modalSourcePage}
                projectId={projectId}
                taskId={taskId}
                initialMeeting={editingMeeting}
                onUpdated={() => {
                    setEditingMeeting(null);
                    setSelectedMeetingId(null);
                }}
            />

            <MeetingDetailsModal
                isOpen={selectedMeetingId != null && editingMeeting == null}
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
        </>
    );
}
