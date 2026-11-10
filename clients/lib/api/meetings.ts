import { apiRequest, ApiEnvelope } from "./onboarding";

export type MeetingSyncStatus = "pending" | "synced" | "failed" | "pending_setup";
export type MeetingStatus = "scheduled" | "cancelled" | "completed";

export type MeetingAttendee = {
    id?: number;
    user_id?: number | null;
    lead_id?: number | null;
    email: string;
    display_name?: string | null;
    response_status?: "needs_action" | "accepted" | "tentative" | "declined";
    is_optional?: boolean;
    is_organizer?: boolean;
};

export type MeetingReminder = {
    id: number;
    recipient_user_id?: number | null;
    recipient_email: string;
    recipient_name?: string | null;
    offset_minutes?: number | null;
    custom_remind_at?: string | null;
    remind_at: string;
    status: "pending" | "queued" | "sent" | "failed" | "cancelled";
    attempts: number;
    next_retry_at?: string | null;
    sent_at?: string | null;
    last_error?: string | null;
};

export type MeetingSettings = {
    [key: string]: unknown;
};

export type MeetingLead = {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    status?: string | null;
};

export type MeetingItem = {
    id: number;
    company_id: number;
    created_by_user_id: number;
    project_id: number | null;
    task_id: number | null;
    title: string;
    description?: string | null;
    location?: string | null;
    timezone: string;
    start_at: string;
    end_at: string;
    status: MeetingStatus;
    source_page: "dashboard" | "operations" | "project" | "task" | "api" | "agent";
    organizer_email_snapshot?: string | null;
    organizer_name_snapshot?: string | null;
    google_calendar_owner_email?: string | null;
    reminder_config?: Array<{
        offset_minutes?: number | null;
        custom_remind_at?: string | null;
        remind_at: string;
        label?: string;
    }>;
    meeting_settings?: MeetingSettings | null;
    google_event_id?: string | null;
    google_calendar_id?: string | null;
    google_meet_url?: string | null;
    google_html_link?: string | null;
    sync_status: MeetingSyncStatus;
    sync_error_message?: string | null;
    synced_at?: string | null;
    external_updated_at?: string | null;
    attendees?: MeetingAttendee[];
    leads?: MeetingLead[];
    creator?: {
        id: number;
        name: string;
        email: string;
    } | null;
    reminders?: MeetingReminder[];
    created_at?: string;
    updated_at?: string;
};

export type MeetingsListParams = {
    company_id?: number | string;
    status?: MeetingStatus;
    project_id?: number | string;
    task_id?: number | string;
    from?: string;
    to?: string;
    per_page?: number;
};

export type MeetingsListData = {
    items: MeetingItem[];
    pagination: {
        next_page_url: string | null;
        prev_page_url: string | null;
        per_page: number;
    };
};

export type CreateMeetingPayload = {
    company_id: number | string;
    project_id?: number | string | null;
    task_id?: number | string | null;
    title: string;
    description?: string;
    location?: string;
    timezone: string;
    start_at: string;
    end_at: string;
    source_page?: "dashboard" | "operations" | "project" | "task" | "api" | "agent";
    meeting_settings?: MeetingSettings | null;
    reminders?: Array<{
        offset_minutes?: number;
        remind_at?: string;
    }>;
    attendees?: Array<{
        email: string;
        display_name?: string;
        user_id?: number;
        is_optional?: boolean;
    }>;
    lead_ids?: number[];
};

export type UpdateMeetingPayload = Partial<
    Omit<CreateMeetingPayload, "company_id"> & {
        status: MeetingStatus;
        attendees: Array<{
            email: string;
            display_name?: string;
            user_id?: number;
            is_optional?: boolean;
        }>;
    }
> & {
    company_id: number | string;
};

export type MeetingMutationData = {
    meeting: MeetingItem;
    integration: {
        connected: boolean;
        status: string;
        requires_owner_action: boolean;
        google_calendar_owner_email?: string | null;
    };
    warnings: string[];
};

export type MeetingDetailData = {
    meeting: MeetingItem;
};

export function listMeetings(
    params: MeetingsListParams,
    token: string
): Promise<ApiEnvelope<MeetingsListData>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    if (params.status) qs.set("status", params.status);
    if (params.project_id != null) qs.set("project_id", String(params.project_id));
    if (params.task_id != null) qs.set("task_id", String(params.task_id));
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.per_page != null) qs.set("per_page", String(params.per_page));

    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest<MeetingsListData>({
        method: "GET",
        path: `/meetings${query}`,
        token,
    });
}

export function createMeeting(
    payload: CreateMeetingPayload,
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "POST",
        path: "/meetings",
        body: payload,
        token,
    });
}

export function getMeeting(
    meetingId: number | string,
    params: { company_id?: number | string },
    token: string
): Promise<ApiEnvelope<MeetingDetailData>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest<MeetingDetailData>({
        method: "GET",
        path: `/meetings/${meetingId}${query}`,
        token,
    });
}

export function updateMeeting(
    meetingId: number | string,
    payload: UpdateMeetingPayload,
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "PATCH",
        path: `/meetings/${meetingId}`,
        body: payload,
        token,
    });
}

export function cancelMeeting(
    meetingId: number | string,
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "POST",
        path: `/meetings/${meetingId}/cancel`,
        body: payload,
        token,
    });
}

export function deleteMeeting(
    meetingId: number | string,
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "DELETE",
        path: `/meetings/${meetingId}`,
        body: payload,
        token,
    });
}

export function resyncMeeting(
    meetingId: number | string,
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<MeetingMutationData>> {
    return apiRequest<MeetingMutationData>({
        method: "POST",
        path: `/meetings/${meetingId}/resync`,
        body: payload,
        token,
    });
}
