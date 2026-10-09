"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";
import type { ApiRoleBasePath } from "./crm";

export type EmailRecipient = {
    email: string;
    name?: string | null;
    user_id?: number;
};

export type CrmEmailAttachment = {
    id: number;
    filename: string;
    mime_type?: string | null;
    size_bytes: number;
    sync_status: string;
    download_url?: string | null;
};

export type CrmEmailMessage = {
    id: number;
    thread_id: number;
    lead_id?: number | null;
    gmail_message_id: string;
    gmail_thread_id?: string | null;
    direction: "sent" | "received";
    status: "sending" | "sent" | "delivered" | "failed";
    from_name?: string | null;
    from_email?: string | null;
    to_recipients?: EmailRecipient[];
    cc_recipients?: EmailRecipient[];
    bcc_recipients?: EmailRecipient[];
    subject?: string | null;
    body_html?: string | null;
    body_text?: string | null;
    is_read: boolean;
    is_starred: boolean;
    gmail_account_email?: string | null;
    error_message?: string | null;
    sent_at?: string | null;
    received_at?: string | null;
    timestamp?: string | null;
    time_ago?: string | null;
    sent_by?: { id: number; name: string; email: string } | null;
    attachments?: CrmEmailAttachment[];
};

export type CrmEmailThread = {
    id: number;
    lead_id?: number | null;
    gmail_thread_id: string;
    subject?: string | null;
    snippet?: string | null;
    last_message_at?: string | null;
    time_ago?: string | null;
    unread_count: number;
    message_count: number;
    participant_emails?: string[];
    latest_message?: CrmEmailMessage | null;
    messages?: CrmEmailMessage[];
};

export type SendCrmEmailPayload = {
    company_id?: number | string;
    email_account_id?: number;
    to: EmailRecipient[];
    cc?: EmailRecipient[];
    bcc?: EmailRecipient[];
    subject: string;
    body_html?: string;
    body_text?: string;
    attachment_ids?: number[];
    gmail_thread_id?: string;
    reply_to_gmail_message_id?: string;
};

export type CrmEmailActivityItem = {
    id: number;
    action: string;
    metadata?: Record<string, unknown> | null;
    lead?: { id: number; name: string; email?: string | null } | null;
    user?: { id: number; name: string; email: string } | null;
    created_at?: string | null;
};

export type CrmEmailStats = {
    emails_sent_today: number;
    unread_crm_emails: number;
    failed_deliveries: number;
    pending_follow_ups: number;
};

function crmPath(basePath: ApiRoleBasePath, suffix: string): string {
    return `${basePath}/crm${suffix}`;
}

export function listLeadEmails(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    params: { company_id?: number | string; page?: number; per_page?: number; sync?: boolean },
    token: string,
): Promise<ApiEnvelope<{ items: CrmEmailThread[]; pagination: Record<string, unknown> }>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    if (params.page != null) qs.set("page", String(params.page));
    if (params.per_page != null) qs.set("per_page", String(params.per_page));
    if (params.sync) qs.set("sync", "1");
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest({
        method: "GET",
        path: crmPath(basePath, `/leads/${leadId}/emails${query}`),
        token,
    });
}

export function getLeadEmailThread(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    threadId: number | string,
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<{ thread: CrmEmailThread }>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest({
        method: "GET",
        path: crmPath(basePath, `/leads/${leadId}/emails/threads/${threadId}${query}`),
        token,
    });
}

export function sendLeadEmail(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    payload: SendCrmEmailPayload,
    token: string,
): Promise<ApiEnvelope<{ message: CrmEmailMessage }>> {
    return apiRequest({
        method: "POST",
        path: crmPath(basePath, `/leads/${leadId}/emails/send`),
        body: payload,
        token,
    });
}

export function replyLeadEmail(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    threadId: number | string,
    payload: SendCrmEmailPayload,
    token: string,
): Promise<ApiEnvelope<{ message: CrmEmailMessage }>> {
    return apiRequest({
        method: "POST",
        path: crmPath(basePath, `/leads/${leadId}/emails/threads/${threadId}/reply`),
        body: payload,
        token,
    });
}

export function markLeadEmailRead(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    messageId: number | string,
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<{ message: CrmEmailMessage }>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest({
        method: "PATCH",
        path: crmPath(basePath, `/leads/${leadId}/emails/messages/${messageId}/read${query}`),
        token,
    });
}

export function markLeadEmailUnread(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    messageId: number | string,
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<{ message: CrmEmailMessage }>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest({
        method: "PATCH",
        path: crmPath(basePath, `/leads/${leadId}/emails/messages/${messageId}/unread${query}`),
        token,
    });
}

export function moveLeadEmail(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    messageId: number | string,
    destination: "inbox" | "spam",
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<{ message: CrmEmailMessage }>> {
    return apiRequest({
        method: "POST",
        path: crmPath(basePath, `/leads/${leadId}/emails/messages/${messageId}/move`),
        body: {
            destination,
            company_id: params.company_id,
        },
        token,
    });
}

export type GmailLabel = {
    id: string;
    name: string;
    type: string;
    messageListVisibility?: string | null;
    labelListVisibility?: string | null;
};

export function listGmailLabels(
    basePath: ApiRoleBasePath,
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<{ items: GmailLabel[] }>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest({
        method: "GET",
        path: crmPath(basePath, `/emails/gmail/labels${query}`),
        token,
    });
}

export function createGmailLabel(
    basePath: ApiRoleBasePath,
    name: string,
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<{ label: GmailLabel }>> {
    return apiRequest({
        method: "POST",
        path: crmPath(basePath, `/emails/gmail/labels`),
        body: { name, company_id: params.company_id },
        token,
    });
}

export function updateGmailLabel(
    basePath: ApiRoleBasePath,
    labelId: string,
    name: string,
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<{ label: GmailLabel }>> {
    return apiRequest({
        method: "PATCH",
        path: crmPath(basePath, `/emails/gmail/labels/${encodeURIComponent(labelId)}`),
        body: { name, company_id: params.company_id },
        token,
    });
}

export function deleteGmailLabel(
    basePath: ApiRoleBasePath,
    labelId: string,
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<null>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest({
        method: "DELETE",
        path: crmPath(basePath, `/emails/gmail/labels/${encodeURIComponent(labelId)}${query}`),
        token,
    });
}

export function modifyLeadEmailLabels(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    messageId: number | string,
    payload: { add?: string[]; remove?: string[]; company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<{ message: CrmEmailMessage; label_ids: string[] }>> {
    return apiRequest({
        method: "POST",
        path: crmPath(basePath, `/leads/${leadId}/emails/messages/${messageId}/labels`),
        body: payload,
        token,
    });
}

export function deleteLeadEmail(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    messageId: number | string,
    params: { company_id?: number | string },
    token: string,
): Promise<ApiEnvelope<null>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest({
        method: "DELETE",
        path: crmPath(basePath, `/leads/${leadId}/emails/messages/${messageId}${query}`),
        token,
    });
}

export function uploadLeadEmailAttachment(
    basePath: ApiRoleBasePath,
    leadId: number | string,
    file: File,
    companyId: number | string | undefined,
    token: string,
): Promise<ApiEnvelope<{ attachment: CrmEmailAttachment }>> {
    const formData = new FormData();
    formData.append("file", file);
    if (companyId != null) formData.append("company_id", String(companyId));

    return apiRequest({
        method: "POST",
        path: crmPath(basePath, `/leads/${leadId}/emails/attachments`),
        body: formData,
        token,
    });
}

export function getCrmEmailActivity(
    basePath: ApiRoleBasePath,
    params: { company_id?: number | string; limit?: number },
    token: string,
): Promise<ApiEnvelope<{ items: CrmEmailActivityItem[]; stats: CrmEmailStats }>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    if (params.limit != null) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest({
        method: "GET",
        path: crmPath(basePath, `/emails/activity${query}`),
        token,
    });
}
