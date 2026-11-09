import { describe, expect, it } from "vitest";

import type { ForecastOverviewResponse } from "@/lib/api/copilot";
import { buildForecastChatMessage, getForecastRecommendations } from "@/lib/format-forecast-overview";

const sampleForecast: ForecastOverviewResponse = {
    company_id: 1,
    pipeline: "forecast.recommendations.v2",
    snapshot: {
        kpis: { total_tasks: 10, completed_tasks: 4 },
        signals: { overdue_tasks: 2 },
        trends: { activity_score_change: 12, activity_direction: "up", tasks_completed_delta: 3 },
    },
    forecast: {
        outlook: "next_7_days",
        horizon_days: 7,
        confidence: 0.67,
        risk_level: "medium",
        recommendations: ["Clear overdue tasks this week."],
        structured_recommendations: [
            { priority: "high", area: "tasks", text: "Clear overdue tasks this week." },
        ],
        narrative: "Operations need focused recovery on overdue work.",
        generated_at: "2026-06-24T10:00:00.000Z",
        trace_id: "trace-1",
    },
};

describe("format-forecast-overview", () => {
    it("prefers structured recommendations when present", () => {
        expect(getForecastRecommendations(sampleForecast)).toEqual(["Clear overdue tasks this week."]);
    });

    it("builds a chat message with instruction and forecast content", () => {
        const message = buildForecastChatMessage(sampleForecast, "Build a weekly recovery plan.");

        expect(message).toContain("Build a weekly recovery plan.");
        expect(message).toContain("Clear overdue tasks this week.");
        expect(message).toContain("Operations need focused recovery on overdue work.");
        expect(message).toContain("Weekly activity trend");
    });
});
