import { describe, expect, it } from "vitest";

import { normalizeWeeklySummaryStatus } from "./copilot";

describe("normalizeWeeklySummaryStatus", () => {
    it("maps backend download_ready to available when completed", () => {
        const normalized = normalizeWeeklySummaryStatus({
            report_id: "report-1",
            status: "completed",
            progress: 100,
            download_ready: true,
        });

        expect(normalized).toEqual({
            report_id: "report-1",
            status: "completed",
            progress: 100,
            error: null,
            available: true,
            drive_file_id: null,
        });
    });

    it("preserves failed status and error message", () => {
        const normalized = normalizeWeeklySummaryStatus({
            report_id: "report-2",
            status: "failed",
            progress: 100,
            download_ready: false,
            error: "OpenAI unavailable",
        });

        expect(normalized.status).toBe("failed");
        expect(normalized.error).toBe("OpenAI unavailable");
        expect(normalized.available).toBe(false);
    });
});
