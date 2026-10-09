"use client";

import { createPortal } from "react-dom";
import { useMemo } from "react";
import { Loader2, X } from "lucide-react";
import type { MeetingItem } from "@/lib/api/meetings";

type MeetingDetailsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    meeting: MeetingItem | null;
    canManage?: boolean;
    onEdit?: () => void;
    onCancelMeeting?: () => void;
    isCancelling?: boolean;
};

function formatDateTime(value?: string | null): string {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatReminderLabel(reminder: {
    label?: string;
    offset_minutes?: number | null;
    remind_at?: string | null;
}): string {
    if (reminder.label && reminder.label.trim() !== "") {
        return reminder.label;
    }

    if (typeof reminder.offset_minutes === "number") {
        if (reminder.offset_minutes < 60) {
            return `${reminder.offset_minutes} minutes before`;
        }

        if (reminder.offset_minutes < 1440) {
            return `${Math.floor(reminder.offset_minutes / 60)} hours before`;
        }

        return `${Math.floor(reminder.offset_minutes / 1440)} days before`;
    }

    if (reminder.remind_at) {
        return `Custom (${formatDateTime(reminder.remind_at)})`;
    }

    return "Custom reminder";
}

export function MeetingDetailsModal({
    isOpen,
    onClose,
    meeting,
    canManage = false,
    onEdit,
    onCancelMeeting,
    isCancelling = false,
}: MeetingDetailsModalProps) {
    const internalAttendees = useMemo(() => {
        if (!meeting?.attendees) {
            return [];
        }

        return meeting.attendees.filter((attendee) => attendee.user_id != null);
    }, [meeting]);

    const externalAttendees = useMemo(() => {
        if (!meeting?.attendees) {
            return [];
        }

        return meeting.attendees.filter((attendee) => attendee.user_id == null);
    }, [meeting]);

    const reminderItems = useMemo(() => {
        if (!meeting) {
            return [];
        }

        if (meeting.reminder_config && meeting.reminder_config.length > 0) {
            return meeting.reminder_config.map((reminder) => ({
                label: reminder.label,
                offset_minutes: reminder.offset_minutes,
                remind_at: reminder.remind_at,
            }));
        }

        const seen = new Set<string>();
        const fromReminders: Array<{
            label?: string;
            offset_minutes?: number | null;
            remind_at?: string | null;
        }> = [];

        for (const reminder of meeting.reminders ?? []) {
            const key =
                typeof reminder.offset_minutes === "number"
                    ? `offset:${reminder.offset_minutes}`
                    : `at:${reminder.remind_at}`;

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            fromReminders.push({
                offset_minutes: reminder.offset_minutes,
                remind_at: reminder.remind_at,
            });
        }

        return fromReminders;
    }, [meeting]);

    if (!isOpen || !meeting) {
        return null;
    }

    const canEditOrCancel = canManage && meeting.status === "scheduled";

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            <div className="relative w-full max-w-2xl rounded-3xl border border-gray-100 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <h2 className="text-[16px] font-bold text-[#09232D]">Meeting Details</h2>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="max-h-[75dvh] space-y-4 overflow-y-auto px-6 py-4 text-[12px] text-[#0B1215]">
                    <div>
                        <p className="text-[18px] font-bold text-[#09232D]">{meeting.title}</p>
                        <p className="mt-1 text-[12px] text-gray-500">Status: {meeting.status}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Date & Time</p>
                            <p className="mt-1 font-medium">
                                {formatDateTime(meeting.start_at)} - {formatDateTime(meeting.end_at)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Timezone</p>
                            <p className="mt-1 font-medium">{meeting.timezone || "-"}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Organizer</p>
                            <p className="mt-1 font-medium">
                                {meeting.creator?.name ?? meeting.organizer_name_snapshot ?? "-"} (
                                {meeting.creator?.email ?? meeting.organizer_email_snapshot ?? "-"})
                            </p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Location</p>
                            <p className="mt-1 font-medium">{meeting.location?.trim() ? meeting.location : "Not set"}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Meet Link</p>
                            {meeting.google_meet_url ? (
                                <a
                                    className="mt-1 block truncate font-medium text-[#094B5C] underline"
                                    href={meeting.google_meet_url}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {meeting.google_meet_url}
                                </a>
                            ) : (
                                <p className="mt-1 font-medium">Not available</p>
                            )}
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Calendar Link</p>
                            {meeting.google_html_link ? (
                                <a
                                    className="mt-1 block truncate font-medium text-[#094B5C] underline"
                                    href={meeting.google_html_link}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Open in Google Calendar
                                </a>
                            ) : (
                                <p className="mt-1 font-medium">Not available</p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Description</p>
                        <p className="mt-1 whitespace-pre-wrap">
                            {meeting.description?.trim() ? meeting.description : "No description provided."}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Internal Attendees</p>
                            {internalAttendees.length > 0 ? (
                                <ul className="mt-1 space-y-1">
                                    {internalAttendees.map((attendee) => (
                                        <li key={`${attendee.email}-${attendee.id ?? "internal"}`}>
                                            {attendee.display_name || attendee.email} ({attendee.email})
                                            {attendee.is_organizer ? " · Organizer" : ""}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-1">None</p>
                            )}
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">External Attendees</p>
                            {externalAttendees.length > 0 ? (
                                <ul className="mt-1 space-y-1">
                                    {externalAttendees.map((attendee) => (
                                        <li key={`${attendee.email}-${attendee.id ?? "external"}`}>
                                            {attendee.display_name || attendee.email} ({attendee.email})
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-1">None</p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Linked Leads</p>
                        {meeting.leads && meeting.leads.length > 0 ? (
                            <ul className="mt-1 space-y-1">
                                {meeting.leads.map((lead) => (
                                    <li key={lead.id}>
                                        {lead.name}
                                        {lead.email ? ` (${lead.email})` : ""}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-1">None</p>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Reminder Schedule</p>
                        {reminderItems.length > 0 ? (
                            <ul className="mt-1 space-y-1">
                                {reminderItems.map((reminder, index) => (
                                    <li key={`${meeting.id}-reminder-${index}`}>{formatReminderLabel(reminder)}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-1">No reminders configured.</p>
                        )}
                    </div>
                </div>

                {canEditOrCancel && (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
                        <button
                            type="button"
                            onClick={onCancelMeeting}
                            disabled={isCancelling}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                        >
                            {isCancelling && <Loader2 className="animate-spin" size={14} />}
                            {isCancelling ? "Cancelling…" : "Cancel Meeting"}
                        </button>
                        <button
                            type="button"
                            onClick={onEdit}
                            disabled={isCancelling}
                            className="rounded-xl bg-[#09232D] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                            Edit Meeting
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
