import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCopilotChat } from "@/hooks/use-copilot-chat";

const {
    listCopilotThreadsMock,
    getCopilotThreadMock,
    getCopilotThreadMessagesMock,
    deleteCopilotThreadMock,
    sendCopilotMessageStreamMock,
    sendCopilotMessageMock,
    queueWeeklySummaryReportMock,
    getWeeklySummaryStatusMock,
} = vi.hoisted(() => ({
    listCopilotThreadsMock: vi.fn(),
    getCopilotThreadMock: vi.fn(),
    getCopilotThreadMessagesMock: vi.fn(),
    deleteCopilotThreadMock: vi.fn(),
    sendCopilotMessageStreamMock: vi.fn(),
    sendCopilotMessageMock: vi.fn(),
    queueWeeklySummaryReportMock: vi.fn(),
    getWeeklySummaryStatusMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
    getAuthTokenFromDocument: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/api/copilot", () => ({
    listCopilotThreads: listCopilotThreadsMock,
    getCopilotThread: getCopilotThreadMock,
    getCopilotThreadMessages: getCopilotThreadMessagesMock,
    deleteCopilotThread: deleteCopilotThreadMock,
    sendCopilotMessageStream: sendCopilotMessageStreamMock,
    sendCopilotMessage: sendCopilotMessageMock,
    queueWeeklySummaryReport: queueWeeklySummaryReportMock,
    getWeeklySummaryStatus: getWeeklySummaryStatusMock,
    normalizeWeeklySummaryStatus: (raw: Record<string, unknown>) => ({
        report_id: String(raw.report_id ?? ""),
        status: (raw.status as "queued" | "running" | "completed" | "failed") ?? "queued",
        progress: typeof raw.progress === "number" ? raw.progress : Number(raw.progress) || 0,
        error: typeof raw.error === "string" ? raw.error : null,
        available:
            raw.status === "completed" && (raw.download_ready === true || raw.available === true),
    }),
    downloadWeeklySummaryReport: vi.fn(),
    transcribeVoiceInput: vi.fn(),
    analyzeCopilotFile: vi.fn(),
    summarizeMeetingTranscript: vi.fn(),
    getForecastOverview: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
    useAuthStore: vi.fn((selector: (state: { user: unknown }) => unknown) =>
        selector({
            user: {
                id: 33,
                active_company: {
                    company_id: 77,
                },
            },
        })
    ),
}));

describe("useCopilotChat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("initializes from persisted thread list", async () => {
        listCopilotThreadsMock.mockResolvedValue({
            data: {
                items: [
                    {
                        thread_id: "thread-1",
                        updated_at: "2026-01-01T00:00:00.000Z",
                        created_at: "2026-01-01T00:00:00.000Z",
                        message_count: 1,
                        last_message_preview: "Hello",
                    },
                ],
            },
        });

        getCopilotThreadMock.mockResolvedValue({
            data: {
                thread: {
                    thread_id: "thread-1",
                    company_id: 77,
                    user_id: 33,
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-01T00:00:00.000Z",
                    messages: [
                        {
                            id: "m1",
                            role: "assistant",
                            content: "Loaded message",
                            sources: ["tasks.overdue"],
                            tool: "tasks.overdue",
                            payload: { count: 1 },
                            created_at: "2026-01-01T00:00:00.000Z",
                        },
                    ],
                },
            },
        });

        const { result } = renderHook(() => useCopilotChat());

        await act(async () => {
            await result.current.initialize(77);
        });

        expect(result.current.threadId).toBe("thread-1");
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].content).toBe("Loaded message");
    });

    it("loads older paginated thread messages when requested", async () => {
        listCopilotThreadsMock.mockResolvedValue({
            data: {
                items: [
                    {
                        thread_id: "thread-1",
                        updated_at: "2026-01-01T00:00:00.000Z",
                        created_at: "2026-01-01T00:00:00.000Z",
                        message_count: 40,
                        last_message_preview: "Newest message",
                    },
                ],
            },
        });

        getCopilotThreadMock.mockResolvedValue({
            data: {
                thread: {
                    thread_id: "thread-1",
                    company_id: 77,
                    user_id: 33,
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-01T00:00:00.000Z",
                    messages: [
                        {
                            id: "m20",
                            role: "assistant",
                            content: "Newest chunk",
                            sources: [],
                            tool: null,
                            payload: null,
                            created_at: "2026-01-01T00:00:00.000Z",
                        },
                    ],
                    message_count: 40,
                    pagination: {
                        has_more: true,
                        next_cursor: "m20",
                        loaded_count: 1,
                    },
                },
            },
        });

        getCopilotThreadMessagesMock.mockResolvedValue({
            data: {
                conversation_id: "thread-1",
                messages: [
                    {
                        id: "m19",
                        role: "assistant",
                        content: "Older chunk",
                        sources: [],
                        tool: null,
                        payload: null,
                        created_at: "2026-01-01T00:00:00.000Z",
                    },
                ],
                pagination: {
                    has_more: false,
                    next_cursor: null,
                    loaded_count: 1,
                },
            },
        });

        const { result } = renderHook(() => useCopilotChat());

        await act(async () => {
            await result.current.initialize(77);
        });

        await act(async () => {
            await result.current.loadOlderThreadMessages(77);
        });

        expect(result.current.messages[0].id).toBe("m19");
        expect(result.current.messages[1].id).toBe("m20");
        expect(result.current.threadPagination?.has_more).toBe(false);
        expect(result.current.threadPagination?.next_cursor).toBeNull();
    });

    it("streams assistant response and updates final tool metadata", async () => {
        listCopilotThreadsMock.mockResolvedValue({ data: { items: [] } });

        sendCopilotMessageStreamMock.mockImplementation(async (_payload, _token, handlers) => {
            handlers.onMeta?.({ thread_id: "thread-stream" });
            handlers.onDelta?.({ chunk: "Overdue" });
            handlers.onDelta?.({ chunk: " tasks" });
            handlers.onDone?.({
                thread_id: "thread-stream",
                message: "Overdue tasks: 1",
                tool: "tasks.overdue",
                sources: ["tasks.overdue"],
                payload: { count: 1 },
            });

            return {
                thread_id: "thread-stream",
                message: "Overdue tasks: 1",
                tool: "tasks.overdue",
                sources: ["tasks.overdue"],
                payload: { count: 1 },
            };
        });

        const { result } = renderHook(() => useCopilotChat());

        await act(async () => {
            await result.current.sendMessage({
                message: "show overdue tasks",
                companyId: 77,
            });
        });

        await waitFor(() => {
            expect(result.current.isStreaming).toBe(false);
        });

        expect(result.current.threadId).toBe("thread-stream");
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[0].role).toBe("user");
        expect(result.current.messages[1].role).toBe("assistant");
        expect(result.current.messages[1].content).toBe("Overdue tasks: 1");
        expect(result.current.messages[1].sources).toEqual(["tasks.overdue"]);
        expect(result.current.messages[1].tool).toBe("tasks.overdue");
        expect(result.current.processingLabel).toBeNull();
    });

    it("rotates processing labels without writing them into assistant content", async () => {
        vi.useFakeTimers();
        listCopilotThreadsMock.mockResolvedValue({ data: { items: [] } });

        let resolveStream: ((value: {
            thread_id: string;
            message: string;
            tool: string | null;
            sources: string[];
            payload: Record<string, unknown> | null;
        }) => void) | null = null;
        let streamHandlers: {
            onDone?: (event: {
                thread_id: string;
                message: string;
                tool: string | null;
                sources: string[];
                payload: Record<string, unknown> | null;
            }) => void;
        } = {};

        sendCopilotMessageStreamMock.mockImplementation(async (_payload, _token, handlers) => {
            streamHandlers = handlers;
            handlers.onMeta?.({ thread_id: "thread-status" });
            handlers.onProcessing?.({ label: "Thinking..." });

            return await new Promise((resolve) => {
                resolveStream = resolve;
            });
        });

        const { result } = renderHook(() => useCopilotChat());

        let sendPromise: Promise<void>;
        await act(async () => {
            sendPromise = result.current.sendMessage({
                message: "Give me the list of tasks created by Agent John",
                companyId: 77,
            });
        });

        expect(result.current.isStreaming).toBe(true);
        expect(result.current.processingLabel).toBe("Thinking...");
        expect(result.current.messages[1].content).toBe("");

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        expect(result.current.processingLabel).toBe("Looking up tasks...");
        expect(result.current.messages[1].content).toBe("");

        const donePayload = {
            thread_id: "thread-status",
            message: "Here are the matching tasks.",
            tool: "tasks.list",
            sources: ["tasks.list"],
            payload: null,
        };

        await act(async () => {
            streamHandlers.onDone?.(donePayload);
            resolveStream?.(donePayload);
            await sendPromise;
        });

        expect(result.current.isStreaming).toBe(false);
        expect(result.current.processingLabel).toBeNull();
        expect(result.current.messages[1].content).toBe("Here are the matching tasks.");

        vi.useRealTimers();
    });

    it("sends action confirmation payload with generated idempotency key", async () => {
        listCopilotThreadsMock.mockResolvedValue({ data: { items: [] } });

        sendCopilotMessageStreamMock.mockImplementation(async (payload, _token, handlers) => {
            handlers.onMeta?.({ thread_id: "thread-confirm" });
            handlers.onDone?.({
                thread_id: "thread-confirm",
                message: "Action completed.",
                tool: "tasks.create",
                sources: ["tasks.create"],
                payload: { task_id: 77 },
            });

            return {
                thread_id: "thread-confirm",
                message: "Action completed.",
                tool: "tasks.create",
                sources: ["tasks.create"],
                payload: { task_id: 77 },
            };
        });

        const { result } = renderHook(() => useCopilotChat());

        await act(async () => {
            await result.current.sendMessage({
                message: "confirm task creation",
                companyId: 77,
                actionConfirmed: true,
                actionArgs: { title: "Dispatch checks" },
            });
        });

        const payload = sendCopilotMessageStreamMock.mock.calls[0][0];
        expect(payload.action_confirmed).toBe(true);
        expect(payload.action_args).toEqual({ title: "Dispatch checks" });
        expect(typeof payload.idempotency_key).toBe("string");
        expect(payload.idempotency_key.length).toBeGreaterThan(10);
    });

    it("queues weekly report and updates status via polling", async () => {
        queueWeeklySummaryReportMock.mockResolvedValue({
            data: {
                report_id: "weekly-1",
                status: "queued",
                queued: true,
            },
        });

        getWeeklySummaryStatusMock.mockResolvedValue({
            data: {
                report_id: "weekly-1",
                status: "completed",
                progress: 100,
                error: null,
                available: true,
            },
        });

        const { result } = renderHook(() => useCopilotChat());

        await act(async () => {
            await result.current.queueWeeklyReport(77);
        });

        await waitFor(() => {
            expect(result.current.weeklyReport?.status).toBe("completed");
        });

        expect(queueWeeklySummaryReportMock).toHaveBeenCalledWith("test-token", 77);
        expect(getWeeklySummaryStatusMock).toHaveBeenCalledWith("weekly-1", "test-token", 77);
    });
});
