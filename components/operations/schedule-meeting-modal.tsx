"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Check, ChevronDown, Loader2, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { canConnectGoogleCalendar } from "@/lib/calendar-permissions";
import { useCreateMeeting, useUpdateMeeting } from "@/hooks/use-meetings";
import { useLeads } from "@/hooks/use-crm";
import type { LeadApiItem } from "@/lib/api/crm";
import {
    useDisconnectCalendarIntegration,
    useCalendarIntegrationReconnect,
    useCalendarIntegrationStatus,
    useCalendarIntegrationSwitch,
    useCreateCalendarConnectUrl,
} from "@/hooks/use-calendar-integration";
import { useMeetingAttendeeCandidates } from "@/hooks/use-meeting-attendees";
import type { MeetingAttendeeCandidate } from "@/lib/api/meeting-attendees";
import type { CreateMeetingPayload, MeetingItem } from "@/lib/api/meetings";
import { resolveUserTimezone } from "@/lib/meeting-timezone";

const REMINDER_PRESETS = [
    { label: "5 minutes before", value: 5 },
    { label: "15 minutes before", value: 15 },
    { label: "30 minutes before", value: 30 },
    { label: "1 hour before", value: 60 },
    { label: "3 hours before", value: 180 },
    { label: "1 day before", value: 1440 },
    { label: "3 days before", value: 4320 },
] as const;

const COMMON_TIMEZONES = [
    "Africa/Lagos",
    "UTC",
    "Africa/Nairobi",
    "Africa/Cairo",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
] as const;

type ScheduleMeetingModalProps = {
    isOpen: boolean;
    onClose: () => void;
    defaultDate?: Date;
    title?: string;
    sourcePage?: "dashboard" | "operations" | "project" | "task" | "api" | "agent";
    projectId?: number | string;
    taskId?: number | string;
    initialMeeting?: MeetingItem | null;
    onCreated?: (meeting: MeetingItem) => void;
    onUpdated?: (meeting: MeetingItem) => void;
};

function toInputDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultStart(date?: Date): string {
    const base = date ? new Date(date) : new Date();
    base.setHours(9, 0, 0, 0);
    if (!date) base.setDate(base.getDate() + 1);
    return toInputDateTime(base);
}

function defaultEnd(start: string): string {
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 1);
        fallback.setHours(10, 0, 0, 0);
        return toInputDateTime(fallback);
    }

    startDate.setHours(startDate.getHours() + 1);
    return toInputDateTime(startDate);
}

function toInputDate(value: string): string {
    return value.slice(0, 10);
}

function toInputTime(value: string): string {
    return value.slice(11, 16);
}

function combineDateAndTime(dateValue: string, timeValue: string): Date | null {
    if (!dateValue || !timeValue) {
        return null;
    }

    const combined = new Date(`${dateValue}T${timeValue}:00`);

    return Number.isNaN(combined.getTime()) ? null : combined;
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getTimeZoneOptions(): string[] {
    const base = [...COMMON_TIMEZONES];
    const intlWithSupportedValues = Intl as typeof Intl & {
        supportedValuesOf?: (key: string) => string[];
    };

    if (typeof Intl !== "undefined" && typeof intlWithSupportedValues.supportedValuesOf === "function") {
        try {
            const list = intlWithSupportedValues.supportedValuesOf("timeZone");
            return Array.from(new Set([...base, ...list])).sort((a, b) => a.localeCompare(b));
        } catch {
            return base;
        }
    }

    return base;
}

type FormState = {
    meetingTitle: string;
    meetingDescription: string;
    meetingDate: string;
    startTime: string;
    endTime: string;
    timezone: string;
    externalEmailInput: string;
    externalAttendees: Array<{ email: string; display_name?: string }>;
    selectedInternalAttendeeIds: number[];
    internalSearch: string;
    selectedLeadIds: number[];
    leadSearch: string;
    selectedReminderOffsets: number[];
    customReminderInput: string;
    errors: Record<string, string>;
};

function buildDefaultFormState(defaultDate?: Date): FormState {
    const nextStart = defaultStart(defaultDate);
    const timezoneOptions = getTimeZoneOptions();
    const deviceTimezone = resolveUserTimezone();
    const defaultTimezone = timezoneOptions.includes(deviceTimezone)
        ? deviceTimezone
        : timezoneOptions[0] ?? deviceTimezone;

    return {
        meetingTitle: "",
        meetingDescription: "",
        meetingDate: toInputDate(nextStart),
        startTime: toInputTime(nextStart),
        endTime: toInputTime(defaultEnd(nextStart)),
        timezone: defaultTimezone,
        externalEmailInput: "",
        externalAttendees: [],
        selectedInternalAttendeeIds: [],
        internalSearch: "",
        selectedLeadIds: [],
        leadSearch: "",
        selectedReminderOffsets: [],
        customReminderInput: "",
        errors: {},
    };
}

function buildFormStateFromMeeting(meeting: MeetingItem): FormState {
    const start = new Date(meeting.start_at);
    const end = new Date(meeting.end_at);
    const startValue = Number.isNaN(start.getTime()) ? defaultStart() : toInputDateTime(start);
    const endValue = Number.isNaN(end.getTime()) ? defaultEnd(startValue) : toInputDateTime(end);
    const timezoneOptions = getTimeZoneOptions();
    const meetingTimezone = meeting.timezone?.trim() || resolveUserTimezone();
    const timezone = timezoneOptions.includes(meetingTimezone)
        ? meetingTimezone
        : timezoneOptions[0] ?? meetingTimezone;

    const inviteableAttendees = (meeting.attendees ?? []).filter((attendee) => !attendee.is_organizer);
    const selectedInternalAttendeeIds = inviteableAttendees
        .map((attendee) => attendee.user_id)
        .filter((id): id is number => typeof id === "number");
    const externalAttendees = inviteableAttendees
        .filter((attendee) => attendee.user_id == null)
        .map((attendee) => ({
            email: attendee.email,
            display_name: attendee.display_name ?? undefined,
        }));

    const selectedReminderOffsets = (meeting.reminder_config ?? [])
        .map((reminder) => reminder.offset_minutes)
        .filter((offset): offset is number => typeof offset === "number");

    const customReminder = (meeting.reminder_config ?? []).find(
        (reminder) => reminder.offset_minutes == null && reminder.custom_remind_at
    );

    return {
        meetingTitle: meeting.title ?? "",
        meetingDescription: meeting.description ?? "",
        meetingDate: toInputDate(startValue),
        startTime: toInputTime(startValue),
        endTime: toInputTime(endValue),
        timezone,
        externalEmailInput: "",
        externalAttendees,
        selectedInternalAttendeeIds,
        internalSearch: "",
        selectedLeadIds: (meeting.leads ?? []).map((lead) => lead.id),
        leadSearch: "",
        selectedReminderOffsets,
        customReminderInput: customReminder?.custom_remind_at
            ? toInputDateTime(new Date(customReminder.custom_remind_at))
            : "",
        errors: {},
    };
}

export function ScheduleMeetingModal({
    isOpen,
    onClose,
    defaultDate,
    title,
    sourcePage = "operations",
    projectId,
    taskId,
    initialMeeting = null,
    onCreated,
    onUpdated,
}: ScheduleMeetingModalProps) {
    const user = useAuthStore((state) => state.user);
    const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
    const createMeetingMutation = useCreateMeeting();
    const updateMeetingMutation = useUpdateMeeting();
    const isEditMode = initialMeeting != null;
    const modalTitle = title ?? (isEditMode ? "Edit Meeting" : "Schedule Meeting");
    const integrationStatusQuery = useCalendarIntegrationStatus(companyId ?? undefined);
    const connectUrlMutation = useCreateCalendarConnectUrl();
    const disconnectMutation = useDisconnectCalendarIntegration();
    const switchMutation = useCalendarIntegrationSwitch();
    const reconnectMutation = useCalendarIntegrationReconnect();
    const attendeeCandidatesQuery = useMeetingAttendeeCandidates(companyId ?? undefined);
    const leadsQuery = useLeads(companyId ? { company_id: companyId } : {});

    // Stable reference for attendee candidates so downstream memos don't re-run on every render
    const attendeeCandidates = useMemo(
        () => attendeeCandidatesQuery.data ?? [],
        [attendeeCandidatesQuery.data]
    );

    // Single form state — reset is one atomic setState call (no cascading re-renders)
    const [form, setForm] = useState<FormState>(() => buildDefaultFormState(defaultDate));

    const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const clearError = (field: string) => {
        setForm((prev) => ({ ...prev, errors: { ...prev.errors, [field]: "" } }));
    };

    const {
        meetingTitle,
        meetingDescription,
        meetingDate,
        startTime,
        endTime,
        timezone,
        externalEmailInput,
        externalAttendees,
        selectedInternalAttendeeIds,
        internalSearch,
        selectedLeadIds,
        leadSearch,
        selectedReminderOffsets,
        customReminderInput,
        errors,
    } = form;

    const isSubmitting = createMeetingMutation.isPending || updateMeetingMutation.isPending;
    const canConnectIntegration = canConnectGoogleCalendar(role);
    const integration = integrationStatusQuery.data;
    const timezoneOptions = useMemo(() => getTimeZoneOptions(), []);
    const [isTimezoneDropdownOpen, setIsTimezoneDropdownOpen] = useState(false);
    const [timezoneSearch, setTimezoneSearch] = useState("");
    const timezoneDropdownRef = useRef<HTMLDivElement | null>(null);

    const filteredTimezoneOptions = useMemo(() => {
        const query = timezoneSearch.trim().toLowerCase();

        if (query === "") {
            return timezoneOptions;
        }

        return timezoneOptions.filter((option) => option.toLowerCase().includes(query));
    }, [timezoneOptions, timezoneSearch]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        queueMicrotask(() => {
            setForm(initialMeeting ? buildFormStateFromMeeting(initialMeeting) : buildDefaultFormState(defaultDate));
        });
        // Reset only when the modal opens or the meeting being edited changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid resetting while typing
    }, [isOpen, initialMeeting?.id, defaultDate]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleOAuthMessage = (event: MessageEvent) => {
            const payload = event.data as {
                type?: string;
                status?: "success" | "error";
                message?: string;
            };

            if (!payload || payload.type !== "google-calendar-oauth") {
                return;
            }

            if (payload.status === "success") {
                toast.success(payload.message || "Google Calendar connected successfully.");
                integrationStatusQuery.refetch();
                return;
            }

            toast.error(payload.message || "Google Calendar connection failed. Please retry.");
            integrationStatusQuery.refetch();
        };

        window.addEventListener("message", handleOAuthMessage);

        return () => {
            window.removeEventListener("message", handleOAuthMessage);
        };
    }, [integrationStatusQuery, isOpen]);

    useEffect(() => {
        if (!isTimezoneDropdownOpen) {
            return;
        }

        const handleOutsideClick = (event: MouseEvent) => {
            if (!timezoneDropdownRef.current) {
                return;
            }

            if (!timezoneDropdownRef.current.contains(event.target as Node)) {
                setIsTimezoneDropdownOpen(false);
            }
        };

        document.addEventListener("mousedown", handleOutsideClick);

        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
        };
    }, [isTimezoneDropdownOpen]);

    const effectiveSourcePage =
        sourcePage === "operations"
            ? taskId != null
                ? "task"
                : projectId != null
                    ? "project"
                    : "operations"
            : sourcePage;

    const selectedInternalAttendees = useMemo(
        () => attendeeCandidates.filter((candidate) => selectedInternalAttendeeIds.includes(candidate.id)),
        [attendeeCandidates, selectedInternalAttendeeIds]
    );

    const filteredAttendeeCandidates = useMemo(() => {
        const search = internalSearch.trim().toLowerCase();
        if (search === "") return attendeeCandidates;
        return attendeeCandidates.filter((candidate) =>
            [candidate.name, candidate.email, candidate.display_role, candidate.company_role]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(search))
        );
    }, [attendeeCandidates, internalSearch]);

    const allLeads = leadsQuery.data?.leads ?? [];

    const filteredLeads = useMemo(() => {
        const q = leadSearch.trim().toLowerCase();
        if (!q) return allLeads;
        return allLeads.filter((lead) =>
            [lead.name, lead.email, lead.phone, lead.location, lead.source]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [allLeads, leadSearch]);

    const selectedLeads = useMemo(
        () => allLeads.filter((lead) => selectedLeadIds.includes(lead.id)),
        [allLeads, selectedLeadIds]
    );

    const toggleLead = (lead: LeadApiItem) => {
        setForm((prev) => ({
            ...prev,
            selectedLeadIds: prev.selectedLeadIds.includes(lead.id)
                ? prev.selectedLeadIds.filter((id) => id !== lead.id)
                : [...prev.selectedLeadIds, lead.id],
        }));
    };

    const toggleInternalAttendee = (candidate: MeetingAttendeeCandidate) => {
        setForm((prev) => ({
            ...prev,
            selectedInternalAttendeeIds: prev.selectedInternalAttendeeIds.includes(candidate.id)
                ? prev.selectedInternalAttendeeIds.filter((id) => id !== candidate.id)
                : [...prev.selectedInternalAttendeeIds, candidate.id],
        }));
    };

    const toggleReminderOffset = (offsetMinutes: number) => {
        setForm((prev) => {
            const exists = prev.selectedReminderOffsets.includes(offsetMinutes);

            return {
                ...prev,
                selectedReminderOffsets: exists
                    ? prev.selectedReminderOffsets.filter((value) => value !== offsetMinutes)
                    : [...prev.selectedReminderOffsets, offsetMinutes].sort((a, b) => a - b),
            };
        });
    };

    const addExternalEmails = (value: string): void => {
        const emails = value
            .split(/[\n,;]+/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .filter((email) => isValidEmail(email))
            .map((email) => email.toLowerCase());

        if (emails.length === 0) return;

        setForm((prev) => {
            const existing = new Set(prev.externalAttendees.map((item) => item.email.toLowerCase()));
            const next = [...prev.externalAttendees];
            emails.forEach((email) => {
                if (!existing.has(email)) {
                    existing.add(email);
                    next.push({ email });
                }
            });
            return { ...prev, externalAttendees: next };
        });
    };

    const handleExternalEmailCommit = (value?: string) => {
        const raw = (value ?? externalEmailInput).trim();
        if (raw === "") return;

        if (!isValidEmail(raw)) {
            toast.error("Enter a valid email address.");
            return;
        }

        addExternalEmails(raw);
        setField("externalEmailInput", "");
    };

    const handleConnectGoogleCalendar = () => {
        if (!companyId) {
            toast.error("Company context is required.");
            return;
        }

        connectUrlMutation.mutate(
            { company_id: companyId },
            {
                onSuccess: (response) => {
                    const authorizationUrl = response.data.authorization_url;
                    if (!authorizationUrl) {
                        toast.error("Unable to open Google authorization URL.");
                        return;
                    }

                    const popup = window.open(authorizationUrl, "google-calendar-connect", "width=560,height=720");
                    if (!popup) {
                        window.location.href = authorizationUrl;
                        return;
                    }

                    toast.info("Complete Google sign in in the popup. Connection status will update automatically.");
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to start Google Calendar connection.");
                },
            }
        );
    };

    const openAuthorizationPopup = (authorizationUrl: string, popupName: string) => {
        const popup = window.open(authorizationUrl, popupName, "width=560,height=720");
        if (!popup) {
            window.location.href = authorizationUrl;
            return;
        }

        toast.info("Complete Google sign in in the popup. Connection status will update automatically.");
    };

    const handleDisconnectGoogleCalendar = () => {
        if (!companyId) {
            toast.error("Company context is required.");
            return;
        }

        disconnectMutation.mutate(
            { company_id: companyId },
            {
                onSuccess: () => {
                    toast.success("Google Calendar disconnected successfully.");
                    integrationStatusQuery.refetch();
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to disconnect Google Calendar.");
                },
            }
        );
    };

    const handleSwitchGoogleCalendar = () => {
        if (!companyId) {
            toast.error("Company context is required.");
            return;
        }

        switchMutation.mutate(
            { company_id: companyId },
            {
                onSuccess: (response) => {
                    const authorizationUrl = response.data.authorization_url;
                    if (!authorizationUrl) {
                        toast.error("Unable to open Google authorization URL.");
                        return;
                    }

                    openAuthorizationPopup(authorizationUrl, "google-calendar-switch");
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to start Google Calendar account switch.");
                },
            }
        );
    };

    const handleReconnectGoogleCalendar = () => {
        if (!companyId) {
            toast.error("Company context is required.");
            return;
        }

        reconnectMutation.mutate(
            { company_id: companyId },
            {
                onSuccess: (response) => {
                    const authorizationUrl = response.data.authorization_url;
                    if (!authorizationUrl) {
                        toast.error("Unable to open Google authorization URL.");
                        return;
                    }

                    openAuthorizationPopup(authorizationUrl, "google-calendar-reconnect");
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string };
                    toast.error(apiError.message || "Failed to start Google Calendar reconnect.");
                },
            }
        );
    };

    const validate = (): boolean => {
        const nextErrors: Record<string, string> = {};

        if (!meetingTitle.trim()) nextErrors.title = "Meeting title is required.";
        if (!meetingDescription.trim()) nextErrors.description = "Meeting description is required.";
        if (!meetingDate.trim()) nextErrors.date = "Meeting date is required.";
        if (!timezone.trim()) nextErrors.timezone = "Timezone is required.";

        const startDate = combineDateAndTime(meetingDate, startTime);
        const endDate = combineDateAndTime(meetingDate, endTime);

        if (!startDate) nextErrors.start_at = "Valid start date/time is required.";
        if (!endDate) nextErrors.end_at = "Valid end date/time is required.";
        if (startDate && endDate && endDate <= startDate) nextErrors.end_at = "End time must be after start time.";

        setForm((prev) => ({ ...prev, errors: nextErrors }));
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = () => {
        if (!validate()) return;

        // Defensive guard: block if calendar disconnected while modal was open
        if (integration && !integration.connected) {
            toast.error(
                isEditMode
                    ? "Connect your Google Calendar before updating this meeting."
                    : "Connect your Google Calendar before scheduling a meeting."
            );
            return;
        }

        if (!companyId) {
            toast.error("Company context is required.");
            return;
        }

        const startDate = combineDateAndTime(meetingDate, startTime);
        const endDate = combineDateAndTime(meetingDate, endTime);

        if (!startDate || !endDate) {
            toast.error("Please provide a valid meeting date and time.");
            return;
        }

        const attendees = [
            ...externalAttendees.map((attendee) => ({ email: attendee.email, display_name: attendee.display_name })),
            ...selectedInternalAttendees.map((candidate) => ({
                email: candidate.email,
                display_name: candidate.name,
                user_id: candidate.id,
            })),
        ].reduce<Array<{ email: string; display_name?: string; user_id?: number }>>((accumulator, attendee) => {
            const normalizedEmail = attendee.email.toLowerCase();
            const existingIndex = accumulator.findIndex((item) => item.email.toLowerCase() === normalizedEmail);
            if (existingIndex >= 0) {
                accumulator[existingIndex] = attendee;
                return accumulator;
            }
            accumulator.push(attendee);
            return accumulator;
        }, []);

        const reminders: NonNullable<CreateMeetingPayload["reminders"]> = selectedReminderOffsets.map((offsetMinutes) => ({
            offset_minutes: offsetMinutes,
        }));

        const normalizedCustomReminder = customReminderInput.trim();
        if (normalizedCustomReminder !== "") {
            const parsedCustomReminder = new Date(normalizedCustomReminder);
            if (!Number.isNaN(parsedCustomReminder.getTime())) {
                reminders.push({ remind_at: parsedCustomReminder.toISOString() });
            }
        }

        const showResultToast = (meeting: MeetingItem, warning?: string) => {
            if (meeting.sync_status === "synced") {
                toast.success(isEditMode ? "Meeting updated successfully." : "Meeting scheduled successfully.");
                return;
            }

            toast.error(
                warning
                || meeting.sync_error_message
                || (isEditMode
                    ? "The meeting was updated, but Google Calendar sync did not finish."
                    : "The meeting was saved, but Google Calendar sync did not finish.")
            );
        };

        if (isEditMode && initialMeeting) {
            updateMeetingMutation.mutate(
                {
                    meetingId: initialMeeting.id,
                    payload: {
                        company_id: companyId,
                        project_id: projectId ?? initialMeeting.project_id ?? undefined,
                        task_id: taskId ?? initialMeeting.task_id ?? undefined,
                        title: meetingTitle.trim(),
                        description: meetingDescription.trim(),
                        timezone: timezone.trim(),
                        start_at: startDate.toISOString(),
                        end_at: endDate.toISOString(),
                        attendees,
                        lead_ids: selectedLeadIds,
                        reminders,
                    },
                },
                {
                    onSuccess: (response) => {
                        const meeting = response.data.meeting;
                        showResultToast(meeting, response.data.warnings?.[0]);
                        onUpdated?.(meeting);
                        onClose();
                    },
                    onError: (error: unknown) => {
                        const apiError = error as { message?: string; errors?: Record<string, string[]> };
                        if (apiError.errors?.google_calendar?.[0]) {
                            toast.error(apiError.errors.google_calendar[0]);
                            return;
                        }
                        const mapped: Record<string, string> = {};
                        if (apiError.errors?.title?.[0]) mapped.title = apiError.errors.title[0];
                        if (apiError.errors?.start_at?.[0]) mapped.start_at = apiError.errors.start_at[0];
                        if (apiError.errors?.end_at?.[0]) mapped.end_at = apiError.errors.end_at[0];
                        if (Object.keys(mapped).length > 0) setForm((prev) => ({ ...prev, errors: { ...prev.errors, ...mapped } }));
                        toast.error(apiError.message || "Failed to update meeting.");
                    },
                }
            );
            return;
        }

        createMeetingMutation.mutate(
            {
                company_id: companyId,
                project_id: projectId ?? undefined,
                task_id: taskId ?? undefined,
                title: meetingTitle.trim(),
                description: meetingDescription.trim(),
                timezone: timezone.trim(),
                start_at: startDate.toISOString(),
                end_at: endDate.toISOString(),
                source_page: effectiveSourcePage,
                attendees,
                lead_ids: selectedLeadIds.length > 0 ? selectedLeadIds : undefined,
                reminders,
            },
            {
                onSuccess: (response) => {
                    const meeting = response.data.meeting;
                    showResultToast(meeting, response.data.warnings?.[0]);
                    onCreated?.(meeting);
                    onClose();
                },
                onError: (error: unknown) => {
                    const apiError = error as { message?: string; errors?: Record<string, string[]> };
                    // Handle server-side Google Calendar guard
                    if (apiError.errors?.google_calendar?.[0]) {
                        toast.error(apiError.errors.google_calendar[0]);
                        return;
                    }
                    const mapped: Record<string, string> = {};
                    if (apiError.errors?.title?.[0]) mapped.title = apiError.errors.title[0];
                    if (apiError.errors?.start_at?.[0]) mapped.start_at = apiError.errors.start_at[0];
                    if (apiError.errors?.end_at?.[0]) mapped.end_at = apiError.errors.end_at[0];
                    if (Object.keys(mapped).length > 0) setForm((prev) => ({ ...prev, errors: { ...prev.errors, ...mapped } }));
                    toast.error(apiError.message || "Failed to schedule meeting.");
                },
            }
        );
    };

    // Lock body scroll while modal is open
    useEffect(() => {
        if (!isOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const modalContent = (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-meeting-modal-title"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal panel */}
            <div className="relative flex w-full max-w-lg flex-col rounded-3xl border border-gray-100 bg-white shadow-2xl max-h-[90dvh]">
                {/* ── Header (never scrolls) ── */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
                    <h2
                        id="schedule-meeting-modal-title"
                        className="text-[16px] font-bold text-[#09232D]"
                    >
                        {modalTitle}
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-5 py-4 space-y-4">
                    {/* Google Calendar status banner */}
                    {!integration?.connected && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-[12px] font-bold text-amber-900 mb-1">
                                Google Calendar Not Connected
                            </p>
                            <p className="text-[11px] text-amber-800 leading-relaxed">
                                {canConnectIntegration
                                    ? "Google Calendar has not been connected for your account. Connect it below to enable meeting scheduling and automatic invites."
                                    : "Meeting creation is currently unavailable because your Google Calendar account has not been connected yet."}
                            </p>
                            {integration?.last_error_message && (
                                <p className="mt-1.5 text-[10px] text-amber-700 font-medium">
                                    Error: {integration?.last_error_message}
                                </p>
                            )}
                            {canConnectIntegration && (
                                <div className="mt-2.5 flex flex-wrap gap-2">
                                    <button
                                        onClick={handleConnectGoogleCalendar}
                                        disabled={connectUrlMutation.isPending}
                                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                                    >
                                        {connectUrlMutation.isPending ? "Preparing..." : "Connect Google"}
                                    </button>

                                    <button
                                        onClick={handleReconnectGoogleCalendar}
                                        disabled={reconnectMutation.isPending}
                                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                                    >
                                        {reconnectMutation.isPending ? "Preparing..." : "Reconnect"}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {integration?.connected && (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                            <p className="text-[12px] text-[#0B1215]">
                                Google Calendar is connected
                                {(integration.connected_google_email ?? integration.organizer_email)
                                    ? ` as ${integration.connected_google_email ?? integration.organizer_email}.`
                                    : "."}
                            </p>
                            {canConnectIntegration && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSwitchGoogleCalendar}
                                        disabled={switchMutation.isPending}
                                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                                    >
                                        {switchMutation.isPending ? "Preparing..." : "Switch Account"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDisconnectGoogleCalendar}
                                        disabled={disconnectMutation.isPending}
                                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                                    >
                                        {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleReconnectGoogleCalendar}
                                        disabled={reconnectMutation.isPending}
                                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                                    >
                                        {reconnectMutation.isPending ? "Preparing..." : "Reconnect"}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Meeting Title */}
                    <div>
                        <label
                            htmlFor="meeting-title"
                            className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]"
                        >
                            Meeting Title
                        </label>
                        <input
                            id="meeting-title"
                            value={meetingTitle}
                            onChange={(event) => {
                                setField("meetingTitle", event.target.value);
                                clearError("title");
                            }}
                            className={[
                                "w-full rounded-xl border bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]",
                                errors.title ? "border-red-400" : "border-gray-200",
                            ].join(" ")}
                            placeholder="e.g. Sprint planning, Client check in…"
                        />
                        {errors.title && (
                            <p className="mt-1 text-[11px] text-red-500">{errors.title}</p>
                        )}
                    </div>

                    {/* Meeting Description */}
                    <div>
                        <label
                            htmlFor="meeting-description"
                            className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]"
                        >
                            Description
                        </label>
                        <textarea
                            id="meeting-description"
                            value={meetingDescription}
                            onChange={(event) => {
                                setField("meetingDescription", event.target.value);
                                clearError("description");
                            }}
                            rows={3}
                            className={[
                                "w-full rounded-xl border bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C] resize-none",
                                errors.description ? "border-red-400" : "border-gray-200",
                            ].join(" ")}
                            placeholder="Agenda, goals, or context for this meeting…"
                        />
                        {errors.description && (
                            <p className="mt-1 text-[11px] text-red-500">{errors.description}</p>
                        )}
                    </div>

                    {/* Date + Timezone */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label
                                htmlFor="meeting-date"
                                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]"
                            >
                                Date
                            </label>
                            <input
                                id="meeting-date"
                                type="date"
                                value={meetingDate}
                                onChange={(event) => {
                                    setField("meetingDate", event.target.value);
                                    clearError("date");
                                }}
                                className={[
                                    "w-full rounded-xl border bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]",
                                    errors.date ? "border-red-400" : "border-gray-200",
                                ].join(" ")}
                            />
                            {errors.date && (
                                <p className="mt-1 text-[11px] text-red-500">{errors.date}</p>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="meeting-timezone"
                                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]"
                            >
                                Timezone
                            </label>
                            <div className="relative" ref={timezoneDropdownRef}>
                                <button
                                    id="meeting-timezone"
                                    type="button"
                                    onClick={() => setIsTimezoneDropdownOpen((prev) => !prev)}
                                    className={[
                                        "flex w-full items-center justify-between rounded-xl border bg-gray-50 py-2.5 px-3 text-sm text-[#0B1215] outline-none transition-colors focus:border-[#094B5C]",
                                        errors.timezone ? "border-red-400" : "border-gray-200",
                                    ].join(" ")}
                                    aria-haspopup="listbox"
                                    aria-expanded={isTimezoneDropdownOpen}
                                >
                                    <span className="truncate">{timezone}</span>
                                    <ChevronDown size={16} className="text-gray-500" />
                                </button>

                                {isTimezoneDropdownOpen && (
                                    <div className="absolute z-30 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-xl">
                                        <div className="border-b border-gray-100 px-2 py-2">
                                            <div className="relative">
                                                <Search
                                                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                                                    size={14}
                                                />
                                                <input
                                                    autoFocus
                                                    value={timezoneSearch}
                                                    onChange={(event) => setTimezoneSearch(event.target.value)}
                                                    placeholder="Search timezone..."
                                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-2 text-[12px] text-[#0B1215] outline-none transition-colors focus:border-[#094B5C]"
                                                />
                                            </div>
                                        </div>

                                        <div className="max-h-48 overflow-y-auto py-1">
                                            {filteredTimezoneOptions.length === 0 ? (
                                                <p className="px-3 py-2 text-[11px] text-gray-500">No timezone found.</p>
                                            ) : (
                                                filteredTimezoneOptions.map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        onClick={() => {
                                                            setField("timezone", option);
                                                            clearError("timezone");
                                                            setTimezoneSearch("");
                                                            setIsTimezoneDropdownOpen(false);
                                                        }}
                                                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-[#0B1215] hover:bg-[#F2F7F8]"
                                                        role="option"
                                                        aria-selected={timezone === option}
                                                    >
                                                        <span className="truncate">{option}</span>
                                                        {timezone === option && <Check size={14} className="text-[#094B5C]" />}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {errors.timezone && (
                                <p className="mt-1 text-[11px] text-red-500">{errors.timezone}</p>
                            )}
                        </div>
                    </div>

                    {/* Start Time + End Time */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label
                                htmlFor="meeting-start-time"
                                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]"
                            >
                                Start Time
                            </label>
                            <input
                                id="meeting-start-time"
                                type="time"
                                value={startTime}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setField("startTime", value);
                                    setForm((prev) => ({ ...prev, endTime: prev.endTime || value }));
                                    clearError("start_at");
                                }}
                                className={[
                                    "w-full rounded-xl border bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]",
                                    errors.start_at ? "border-red-400" : "border-gray-200",
                                ].join(" ")}
                            />
                            {errors.start_at && (
                                <p className="mt-1 text-[11px] text-red-500">{errors.start_at}</p>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="meeting-end-time"
                                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]"
                            >
                                End Time
                            </label>
                            <input
                                id="meeting-end-time"
                                type="time"
                                value={endTime}
                                onChange={(event) => {
                                    setField("endTime", event.target.value);
                                    clearError("end_at");
                                }}
                                className={[
                                    "w-full rounded-xl border bg-gray-50 py-2.5 px-3 text-sm outline-none transition-colors focus:border-[#094B5C]",
                                    errors.end_at ? "border-red-400" : "border-gray-200",
                                ].join(" ")}
                            />
                            {errors.end_at && (
                                <p className="mt-1 text-[11px] text-red-500">{errors.end_at}</p>
                            )}
                        </div>
                    </div>

                    {/* Reminder schedule */}
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                            Reminder Schedule
                        </p>
                        <p className="mb-2 text-[10px] text-gray-500">
                            Select one or more reminders for this meeting.
                        </p>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {REMINDER_PRESETS.map((preset) => {
                                const checked = selectedReminderOffsets.includes(preset.value);

                                return (
                                    <label
                                        key={preset.value}
                                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] text-[#0B1215]"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleReminderOffset(preset.value)}
                                            className="h-3.5 w-3.5 rounded border-gray-300 text-[#094B5C] focus:ring-[#094B5C]"
                                        />
                                        <span>{preset.label}</span>
                                    </label>
                                );
                            })}
                        </div>

                        <div className="mt-2">
                            <label
                                htmlFor="custom-reminder"
                                className="mb-1 block text-[10px] font-semibold text-gray-600"
                            >
                                Custom reminder time
                            </label>
                            <input
                                id="custom-reminder"
                                type="datetime-local"
                                value={customReminderInput}
                                onChange={(event) => setField("customReminderInput", event.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 px-3 text-[12px] outline-none transition-colors focus:border-[#094B5C]"
                            />
                        </div>
                    </div>

                    {/* Internal attendees */}
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                                    Internal Attendees
                                </p>
                                <p className="text-[10px] text-gray-500">
                                    Select company members to invite.
                                </p>
                            </div>
                            {selectedInternalAttendees.length > 0 && (
                                <span className="rounded-full bg-[#09232D] px-2 py-1 text-[10px] font-semibold text-white">
                                    {selectedInternalAttendees.length} selected
                                </span>
                            )}
                        </div>

                        <div className="relative mb-2">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                size={14}
                            />
                            <input
                                value={internalSearch}
                                onChange={(event) => setField("internalSearch", event.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-[12px] outline-none transition-colors focus:border-[#094B5C]"
                                placeholder="Search company members…"
                            />
                        </div>

                        <div className="max-h-44 space-y-1.5 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
                            {attendeeCandidatesQuery.isPending ? (
                                <div className="rounded-xl bg-white px-3 py-3 text-[11px] text-gray-500">
                                    Loading company members…
                                </div>
                            ) : filteredAttendeeCandidates.length === 0 ? (
                                <div className="rounded-xl bg-white px-3 py-3 text-[11px] text-gray-500">
                                    No company members match your search.
                                </div>
                            ) : (
                                filteredAttendeeCandidates.map((candidate) => {
                                    const isSelected = selectedInternalAttendeeIds.includes(candidate.id);

                                    return (
                                        <button
                                            key={candidate.id}
                                            type="button"
                                            onClick={() => toggleInternalAttendee(candidate)}
                                            className={[
                                                "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all",
                                                isSelected
                                                    ? "border-[#094B5C] bg-white shadow-sm"
                                                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50",
                                            ].join(" ")}
                                        >
                                            <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EAF2F3] text-[11px] font-bold text-[#094B5C]">
                                                {candidate.avatar_url ? (
                                                    <Image
                                                        src={candidate.avatar_url}
                                                        alt={candidate.name}
                                                        fill
                                                        sizes="36px"
                                                        className="object-cover"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <span>{candidate.name.slice(0, 2).toUpperCase()}</span>
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-[12px] font-semibold text-[#0B1215]">
                                                        {candidate.name}
                                                    </p>
                                                    <span className="rounded-full bg-[#EEF4F4] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#094B5C]">
                                                        {candidate.display_role}
                                                    </span>
                                                </div>
                                                <p className="truncate text-[10px] text-gray-500">
                                                    {candidate.email}
                                                </p>
                                            </div>

                                            <div
                                                className={[
                                                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                                                    isSelected
                                                        ? "border-[#094B5C] bg-[#094B5C] text-white"
                                                        : "border-gray-300 bg-white text-transparent",
                                                ].join(" ")}
                                            >
                                                ✓
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {selectedInternalAttendees.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {selectedInternalAttendees.map((candidate) => (
                                    <button
                                        key={candidate.id}
                                        type="button"
                                        onClick={() => toggleInternalAttendee(candidate)}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-[#094B5C] px-3 py-1 text-[10px] font-semibold text-white"
                                    >
                                        {candidate.name}
                                        <span className="text-white/75" aria-hidden="true">×</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Leads */}
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                                    Leads
                                </p>
                                <p className="text-[10px] text-gray-500">
                                    Select CRM leads to associate with this meeting.
                                </p>
                            </div>
                            {selectedLeads.length > 0 && (
                                <span className="rounded-full bg-dash-dark px-2 py-1 text-[10px] font-semibold text-white">
                                    {selectedLeads.length} selected
                                </span>
                            )}
                        </div>

                        <div className="relative mb-2">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                size={14}
                            />
                            <input
                                value={leadSearch}
                                onChange={(e) => setField("leadSearch", e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-[12px] outline-none transition-colors focus:border-[#094B5C]"
                                placeholder="Search leads…"
                            />
                        </div>

                        <div className="max-h-44 space-y-1.5 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
                            {leadsQuery.isPending ? (
                                <div className="rounded-xl bg-white px-3 py-3 text-[11px] text-gray-500">
                                    Loading leads…
                                </div>
                            ) : filteredLeads.length === 0 ? (
                                <div className="rounded-xl bg-white px-3 py-3 text-[11px] text-gray-500">
                                    No leads match your search.
                                </div>
                            ) : (
                                filteredLeads.map((lead) => {
                                    const isSelected = selectedLeadIds.includes(lead.id);
                                    return (
                                        <button
                                            key={lead.id}
                                            type="button"
                                            onClick={() => toggleLead(lead)}
                                            className={[
                                                "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all",
                                                isSelected
                                                    ? "border-[#094B5C] bg-white shadow-sm"
                                                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50",
                                            ].join(" ")}
                                        >
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF2F3] text-[11px] font-bold text-[#094B5C]">
                                                {lead.name.slice(0, 2).toUpperCase()}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="truncate text-[12px] font-semibold text-[#0B1215]">
                                                        {lead.name}
                                                    </p>
                                                    {lead.status && (
                                                        <span className="rounded-full bg-[#EEF4F4] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#094B5C]">
                                                            {lead.status.replace(/_/g, " ")}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="truncate text-[10px] text-gray-500">
                                                    {lead.email ?? lead.phone ?? lead.location ?? "No contact info"}
                                                </p>
                                            </div>

                                            <div
                                                className={[
                                                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                                                    isSelected
                                                        ? "border-[#094B5C] bg-[#094B5C] text-white"
                                                        : "border-gray-300 bg-white text-transparent",
                                                ].join(" ")}
                                            >
                                                ✓
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {selectedLeads.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {selectedLeads.map((lead) => (
                                    <button
                                        key={lead.id}
                                        type="button"
                                        onClick={() => toggleLead(lead)}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-[#094B5C] px-3 py-1 text-[10px] font-semibold text-white"
                                    >
                                        {lead.name}
                                        <span className="text-white/75" aria-hidden="true">×</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* External attendees */}
                    <div>
                        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                            External Attendees
                        </label>
                        <p className="mb-2 text-[10px] text-gray-500">
                            Press Enter or Tab to add. Click a chip to remove.
                        </p>
                        <div className="relative">
                            <Users
                                className="pointer-events-none absolute left-3 top-3 text-gray-400"
                                size={14}
                            />
                            <div className="min-h-[72px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 pl-9 text-sm focus-within:border-[#094B5C] transition-colors">
                                <div className="flex flex-wrap gap-2">
                                    {externalAttendees.map((attendee) => (
                                        <button
                                            key={attendee.email}
                                            type="button"
                                            onClick={() => {
                                                setForm((prev) => ({
                                                    ...prev,
                                                    externalAttendees: prev.externalAttendees.filter((item) => item.email !== attendee.email),
                                                }));
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-[#094B5C] px-3 py-1 text-[10px] font-semibold text-white"
                                        >
                                            {attendee.email}
                                            <span className="text-white/75" aria-hidden="true">×</span>
                                        </button>
                                    ))}
                                    <input
                                        value={externalEmailInput}
                                        onChange={(event) => setField("externalEmailInput", event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === "Tab") {
                                                const hasValue = externalEmailInput.trim() !== "";
                                                if (hasValue) {
                                                    event.preventDefault();
                                                    handleExternalEmailCommit();
                                                }
                                            }
                                        }}
                                        onBlur={() => handleExternalEmailCommit()}
                                        className="min-w-[200px] flex-1 bg-transparent outline-none text-sm"
                                        placeholder={
                                            externalAttendees.length === 0
                                                ? "example@email.com"
                                                : "Add another email…"
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Footer (never scrolls) ── */}
                <div className="flex flex-shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#09232D] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting && <Loader2 className="animate-spin" size={14} />}
                        {isSubmitting
                            ? isEditMode
                                ? "Saving…"
                                : "Creating…"
                            : isEditMode
                                ? "Save Changes"
                                : "Create Meeting"}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
