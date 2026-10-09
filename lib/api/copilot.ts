"use client";

import { API_BASE_URL, apiRequest, ApiEnvelope, ApiRequestError } from "./onboarding";
import { getSupportAwareApiTransport } from "@/lib/auth/support-session";

export type CopilotSource = string;

export type CopilotMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources: CopilotSource[];
    tool: string | null;
    payload: unknown;
    created_at: string;
};

export type CopilotThread = {
    thread_id: string;
    company_id: number;
    user_id: number;
    created_at: string;
    updated_at: string;
    messages: CopilotMessage[];
    message_count?: number;
    pagination?: {
        has_more: boolean;
        next_cursor: string | null;
        loaded_count: number;
    };
};

export type CopilotThreadSummary = {
    thread_id: string;
    updated_at: string;
    created_at: string;
    message_count: number;
    last_message_preview: string | null;
};

export type CopilotThreadSearchResult = {
    thread_id: string;
    title: string;
    updated_at: string;
    snippet: string;
    match_message_id: string;
    match_role: string;
    message_count: number;
};

export type CopilotThreadSearchResponse = {
    items: CopilotThreadSearchResult[];
    pagination: {
        has_more: boolean;
        next_cursor: string | null;
        scanned_threads: number;
    };
};

export type CopilotChatContext = {
    latitude?: number;
    longitude?: number;
    focus?: "all" | "visits" | "followups" | "tasks";
    limit?: number;
};

export type CopilotChatRequest = {
    message: string;
    company_id?: number | string;
    thread_id?: string;
    action_args?: Record<string, unknown>;
    action_confirmed?: boolean;
    idempotency_key?: string;
    client_timezone?: string;
    context?: CopilotChatContext;
};

export type CopilotChatResponse = {
    thread_id: string;
    role: string;
    company_id: number;
    intent: {
        type: string;
        tool: string | null;
        confidence: number;
    };
    response: {
        content: string;
        tool: string | null;
        sources: CopilotSource[];
        payload: unknown;
    };
};

export type StreamEventProcessing = {
    label: string;
};

export type StreamEventMeta = {
    thread_id: string;
};

export type StreamEventDelta = {
    chunk: string;
};

export type StreamEventDone = {
    thread_id: string;
    message: string;
    tool: string | null;
    sources: CopilotSource[];
    payload: unknown;
};

export type WeeklySummaryQueueResponse = {
    report_id: string;
    status: string;
    queued: boolean;
};

export type WeeklySummaryStatusResponse = {
    report_id: string;
    status: "queued" | "running" | "completed" | "failed";
    progress: number;
    error: string | null;
    available: boolean;
    drive_file_id?: number | null;
};

const WEEKLY_SUMMARY_STATUSES = new Set<WeeklySummaryStatusResponse["status"]>([
    "queued",
    "running",
    "completed",
    "failed",
]);

export function normalizeWeeklySummaryStatus(raw: Record<string, unknown>): WeeklySummaryStatusResponse {
    const rawStatus = typeof raw.status === "string" ? raw.status : "queued";
    const status = WEEKLY_SUMMARY_STATUSES.has(rawStatus as WeeklySummaryStatusResponse["status"])
        ? (rawStatus as WeeklySummaryStatusResponse["status"])
        : "queued";
    const downloadReady = raw.download_ready === true || raw.available === true || status === "completed";

    return {
        report_id: String(raw.report_id ?? ""),
        status,
        progress: typeof raw.progress === "number" ? raw.progress : Number(raw.progress) || 0,
        error: typeof raw.error === "string" ? raw.error : null,
        available: status === "completed" && downloadReady,
        drive_file_id: raw.drive_file_id != null ? Number(raw.drive_file_id) : null,
    };
}

export type CopilotAssigneeOption = {
    id: number;
    name: string;
    email: string;
    role: string | null;
};

function buildQuery(companyId?: number | string): string {
    if (companyId === undefined || companyId === null || String(companyId).trim() === "") {
        return "";
    }

    return `?company_id=${encodeURIComponent(String(companyId))}`;
}

function buildQueryString(params?: Record<string, string | number | null | undefined>): string {
    if (!params) {
        return "";
    }

    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
            continue;
        }

        const normalized = String(value).trim();
        if (normalized === "") {
            continue;
        }

        search.set(key, normalized);
    }

    const query = search.toString();
    return query ? `?${query}` : "";
}

export function listCopilotThreads(
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<{ items: CopilotThreadSummary[] }>> {
    return apiRequest<{ items: CopilotThreadSummary[] }>({
        method: "GET",
        path: `/copilot/threads${buildQuery(companyId)}`,
        token,
    });
}

export function searchCopilotThreads(
    token: string,
    query: string,
    companyId?: number | string,
    limit = 15,
    cursor?: string
): Promise<ApiEnvelope<CopilotThreadSearchResponse>> {
    const params = new URLSearchParams();
    params.set("q", query.trim());

    if (limit > 0) {
        params.set("limit", String(limit));
    }

    if (cursor) {
        params.set("cursor", cursor);
    }

    if (companyId !== undefined && companyId !== null && String(companyId).trim() !== "") {
        params.set("company_id", String(companyId));
    }

    return apiRequest<CopilotThreadSearchResponse>({
        method: "GET",
        path: `/copilot/threads/search?${params.toString()}`,
        token,
    });
}

export function getCopilotThread(
    threadId: string,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<{ thread: CopilotThread }>> {
    return apiRequest<{ thread: CopilotThread }>({
        method: "GET",
        path: `/copilot/threads/${encodeURIComponent(threadId)}${buildQuery(companyId)}`,
        token,
    });
}

export function getCopilotThreadMessages(
    threadId: string,
    token: string,
    companyId?: number | string,
    cursor?: string,
    limit = 50
): Promise<
    ApiEnvelope<{
        conversation_id: string;
        messages: CopilotMessage[];
        pagination: {
            has_more: boolean;
            next_cursor: string | null;
            loaded_count: number;
        };
    }>
> {
    return apiRequest<{
        conversation_id: string;
        messages: CopilotMessage[];
        pagination: {
            has_more: boolean;
            next_cursor: string | null;
            loaded_count: number;
        };
    }>({
        method: "GET",
        path: `/copilot/threads/${encodeURIComponent(threadId)}/messages${buildQueryString({
            company_id: companyId,
            cursor,
            limit,
        })}`,
        token,
    });
}

export function deleteCopilotThread(
    threadId: string,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<{ deleted: boolean }>> {
    return apiRequest<{ deleted: boolean }>({
        method: "DELETE",
        path: `/copilot/threads/${encodeURIComponent(threadId)}${buildQuery(companyId)}`,
        token,
    });
}

export function sendCopilotMessage(
    payload: CopilotChatRequest,
    token: string
): Promise<ApiEnvelope<CopilotChatResponse>> {
    return apiRequest<CopilotChatResponse>({
        method: "POST",
        path: "/copilot/chat",
        body: {
            ...payload,
            stream: false,
        },
        token,
    });
}

export type CopilotEmailComposeRequest = {
    company_id?: number | string;
    lead_id?: number | null;
    to_email?: string;
    subject?: string;
    body_text?: string;
    user_note?: string;
};

export type CopilotEmailComposeResponse = {
    subject: string;
    body_text: string;
    previous: {
        subject: string;
        body_text: string;
    };
};

export function regenerateCopilotEmailDraft(
    payload: CopilotEmailComposeRequest,
    token: string
): Promise<ApiEnvelope<CopilotEmailComposeResponse>> {
    return apiRequest<CopilotEmailComposeResponse>({
        method: "POST",
        path: "/copilot/email/regenerate",
        body: payload,
        token,
    });
}

export function enhanceCopilotEmailDraft(
    payload: CopilotEmailComposeRequest,
    token: string
): Promise<ApiEnvelope<CopilotEmailComposeResponse>> {
    return apiRequest<CopilotEmailComposeResponse>({
        method: "POST",
        path: "/copilot/email/enhance",
        body: payload,
        token,
    });
}

export function lookupCopilotAssignees(
    token: string,
    query: string,
    companyId?: number | string,
    limit = 8
): Promise<ApiEnvelope<{ items: CopilotAssigneeOption[] }>> {
    const params = new URLSearchParams();
    const trimmed = query.trim();

    if (trimmed !== "") {
        params.set("query", trimmed);
    }

    params.set("limit", String(limit));

    if (companyId !== undefined && companyId !== null && String(companyId).trim() !== "") {
        params.set("company_id", String(companyId));
    }

    const suffix = params.toString();

    return apiRequest<{ items: CopilotAssigneeOption[] }>({
        method: "GET",
        path: `/copilot/assignees${suffix ? `?${suffix}` : ""}`,
        token,
    });
}

export function queueWeeklySummaryReport(
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<WeeklySummaryQueueResponse>> {
    return apiRequest<WeeklySummaryQueueResponse>({
        method: "POST",
        path: "/copilot/reports/weekly-summary",
        body: {
            ...(companyId !== undefined && companyId !== null ? { company_id: companyId } : {}),
        },
        token,
    });
}

export async function getWeeklySummaryStatus(
    reportId: string,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<WeeklySummaryStatusResponse>> {
    const response = await apiRequest<Record<string, unknown>>({
        method: "GET",
        path: `/copilot/reports/weekly-summary/${encodeURIComponent(reportId)}${buildQuery(companyId)}`,
        token,
    });

    return {
        ...response,
        data: normalizeWeeklySummaryStatus(response.data),
    };
}

export type WeeklySummaryDownloadFormat = "pdf" | "docx";

export async function downloadWeeklySummaryReport(
    reportId: string,
    token: string,
    companyId?: number | string,
    format: WeeklySummaryDownloadFormat = "pdf"
): Promise<{ filename: string; content: ArrayBuffer; mimeType: string }> {
    const params = new URLSearchParams();
    if (companyId !== undefined && companyId !== null && String(companyId).trim() !== "") {
        params.set("company_id", String(companyId));
    }
    params.set("format", format);
    const query = `?${params.toString()}`;

    const transport = getSupportAwareApiTransport(
        `/copilot/reports/weekly-summary/${encodeURIComponent(reportId)}/download${query}`,
        token,
        API_BASE_URL,
    );
    const response = await fetch(
        transport.url,
        {
            method: "GET",
            headers: {
                Accept: "application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/octet-stream, */*",
                ...transport.authorizationHeaders,
            },
        }
    );

    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiRequestError(payload?.message ?? "Unable to download weekly summary.", response.status, payload);
    }

    const content = await response.arrayBuffer();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const mimeType =
        format === "docx"
            ? "application/msword"
            : "application/pdf";
    const filename = filenameMatch?.[1]
        ? decodeURIComponent(filenameMatch[1].replace(/"/g, ""))
        : format === "docx"
          ? `Weekly-Executive-Summary.doc`
          : `Weekly-Executive-Summary.pdf`;

    return { filename, content, mimeType };
}

export function transcribeVoiceInput(
    file: File,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<Record<string, unknown>>> {
    const formData = new FormData();
    formData.append("audio", file);
    if (companyId !== undefined && companyId !== null) {
        formData.append("company_id", String(companyId));
    }

    return apiRequest<Record<string, unknown>>({
        method: "POST",
        path: "/copilot/voice/transcriptions",
        body: formData,
        token,
    });
}

export function analyzeCopilotFile(
    file: File,
    token: string,
    companyId?: number | string
): Promise<ApiEnvelope<Record<string, unknown>>> {
    const formData = new FormData();
    formData.append("file", file);
    if (companyId !== undefined && companyId !== null) {
        formData.append("company_id", String(companyId));
    }

    return apiRequest<Record<string, unknown>>({
        method: "POST",
        path: "/copilot/files/analyze",
        body: formData,
        token,
    });
}

export function summarizeMeetingTranscript(
    token: string,
    payload: {
        transcript: string;
        meeting_id?: number;
        company_id?: number | string;
    }
): Promise<ApiEnvelope<Record<string, unknown>>> {
    return apiRequest<Record<string, unknown>>({
        method: "POST",
        path: "/copilot/meetings/transcripts/summarize",
        body: payload,
        token,
    });
}

export type ForecastRecommendation = {
    priority: "high" | "medium" | "low";
    area: "tasks" | "payroll" | "projects" | "crm" | "attendance" | "team" | "general";
    text: string;
};

export type ForecastOverviewResponse = {
    company_id: number;
    role?: string;
    pipeline: string;
    snapshot: {
        kpis?: Record<string, unknown>;
        project_kpis?: Record<string, unknown>;
        activity_summary?: Record<string, unknown>;
        payroll_overview?: Record<string, unknown>;
        attendance_today?: Record<string, unknown>;
        signals?: Record<string, unknown>;
        trends?: Record<string, unknown>;
    };
    forecast: {
        outlook: string;
        horizon_days?: number;
        confidence: number;
        risk_level?: "low" | "medium" | "high";
        recommendations: string[];
        structured_recommendations?: ForecastRecommendation[];
        narrative?: string | null;
        generated_at: string;
        trace_id: string;
    };
};

export type ForecastHorizonDays = 7 | 14 | 30;

export function getForecastOverview(
    token: string,
    companyId?: number | string,
    horizonDays: ForecastHorizonDays = 7
): Promise<ApiEnvelope<ForecastOverviewResponse>> {
    const params = new URLSearchParams();
    if (companyId !== undefined && companyId !== null && String(companyId).trim() !== "") {
        params.set("company_id", String(companyId));
    }
    params.set("horizon", String(horizonDays));
    const query = params.toString();

    return apiRequest<ForecastOverviewResponse>({
        method: "GET",
        path: `/copilot/forecast/overview${query ? `?${query}` : ""}`,
        token,
    });
}

export async function sendCopilotMessageStream(
    payload: CopilotChatRequest,
    token: string,
    handlers: {
        onMeta?: (event: StreamEventMeta) => void;
        onProcessing?: (event: StreamEventProcessing) => void;
        onDelta?: (event: StreamEventDelta) => void;
        onDone?: (event: StreamEventDone) => void;
    } = {}
): Promise<StreamEventDone> {
    const transport = getSupportAwareApiTransport("/copilot/chat", token, API_BASE_URL);
    const response = await fetch(transport.url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream, application/json",
            ...transport.authorizationHeaders,
        },
        body: JSON.stringify({
            ...payload,
            stream: true,
        }),
    });

    if (!response.ok) {
        let message = "Unable to start ELY streaming response.";
        try {
            const errorPayload = await response.json();
            message = errorPayload?.message ?? message;
        } catch { }

        throw new ApiRequestError(message, response.status, null);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        const payloadJson = (await response.json()) as ApiEnvelope<CopilotChatResponse>;
        const doneEvent: StreamEventDone = {
            thread_id: payloadJson?.data?.thread_id ?? "",
            message: payloadJson?.data?.response?.content ?? "",
            tool: payloadJson?.data?.response?.tool ?? null,
            sources: payloadJson?.data?.response?.sources ?? [],
            payload: payloadJson?.data?.response?.payload ?? null,
        };

        handlers.onMeta?.({ thread_id: doneEvent.thread_id });
        handlers.onDone?.(doneEvent);
        return doneEvent;
    }

    if (!response.body) {
        throw new ApiRequestError("ELY stream response body is empty.", 500, null);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneEvent: StreamEventDone | null = null;
    let lastMeta: StreamEventMeta | null = null;
    let accumulatedMessage = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
            const eventMatch = frame.match(/event:\s*(.+)/);
            const dataMatch = frame.match(/data:\s*(.+)/);
            if (!eventMatch || !dataMatch) {
                continue;
            }

            const eventName = eventMatch[1].trim();
            let parsed: unknown = null;
            try {
                parsed = JSON.parse(dataMatch[1]);
            } catch {
                continue;
            }

            if (eventName === "meta") {
                lastMeta = parsed as StreamEventMeta;
                handlers.onMeta?.(lastMeta);
            } else if (eventName === "processing") {
                handlers.onProcessing?.(parsed as StreamEventProcessing);
            } else if (eventName === "delta") {
                const deltaEvent = parsed as StreamEventDelta;
                accumulatedMessage += deltaEvent.chunk ?? "";
                handlers.onDelta?.(deltaEvent);
            } else if (eventName === "done") {
                doneEvent = parsed as StreamEventDone;
                handlers.onDone?.(doneEvent);
            }
        }
    }

    if (!doneEvent) {
        if (lastMeta) {
            doneEvent = {
                thread_id: lastMeta.thread_id,
                message: accumulatedMessage.trim(),
                tool: null,
                sources: [],
                payload: null,
            };
            handlers.onDone?.(doneEvent);
            return doneEvent;
        }

        throw new ApiRequestError("ELY stream ended unexpectedly.", 500, null);
    }

    return doneEvent;
}
