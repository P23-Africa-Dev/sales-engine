import type { ForecastOverviewResponse } from "@/lib/api/copilot";

function formatOutlookLabel(outlook: string, horizonDays?: number): string {
    if (horizonDays && horizonDays > 0) {
        return `Next ${horizonDays} days`;
    }

    if (outlook === "next_7_days") {
        return "Next 7 days";
    }

    if (outlook === "next_14_days") {
        return "Next 14 days";
    }

    if (outlook === "next_30_days") {
        return "Next 30 days";
    }

    return "Operational forecast";
}

function formatConfidenceLabel(confidence: number, riskLevel?: string): string {
    if (riskLevel === "high") {
        return "Higher risk — review priority recommendations this week.";
    }

    if (riskLevel === "low") {
        return "Lower risk — indicators are relatively stable.";
    }

    if (confidence >= 0.75) {
        return "High confidence — based on current operational data.";
    }

    if (confidence >= 0.5) {
        return "Moderate confidence — based on current operational data.";
    }

    return "Limited confidence — some signals are still developing.";
}

function formatMetricValue(value: unknown): string {
    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }

    if (typeof value === "number") {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }

    if (typeof value === "string" && value.trim() !== "") {
        return value.trim();
    }

    return "—";
}

export function buildForecastSnapshotRows(data: ForecastOverviewResponse): Array<{ label: string; value: string }> {
    const kpis = data.snapshot?.kpis ?? {};
    const projectKpis = data.snapshot?.project_kpis ?? {};
    const activity = data.snapshot?.activity_summary ?? {};
    const payroll = data.snapshot?.payroll_overview ?? {};
    const signals = data.snapshot?.signals ?? {};

    const rows: Array<{ label: string; value: string }> = [
        { label: "Total tasks", value: formatMetricValue(kpis.total_tasks) },
        { label: "Completed tasks", value: formatMetricValue(kpis.completed_tasks) },
        { label: "Overdue tasks", value: formatMetricValue(signals.overdue_tasks) },
        { label: "Active agents", value: formatMetricValue(kpis.active_agents) },
        { label: "Total leads", value: formatMetricValue(kpis.total_leads) },
        { label: "Converted leads", value: formatMetricValue(kpis.converted_leads) },
        { label: "Active projects", value: formatMetricValue(projectKpis.active_projects) },
        { label: "Project completion rate", value: `${formatMetricValue(projectKpis.completion_rate)}%` },
        { label: "Tasks created (period)", value: formatMetricValue(activity.tasks_created) },
        { label: "Tasks completed (period)", value: formatMetricValue(activity.tasks_completed) },
        { label: "Leads created (period)", value: formatMetricValue(activity.leads_created) },
        { label: "Leads won (period)", value: formatMetricValue(activity.leads_won) },
        { label: "Pending payroll approvals", value: formatMetricValue(payroll.pending_approval) },
    ];

    return rows.filter((row) => row.value !== "—");
}

export function getForecastRecommendations(data: ForecastOverviewResponse): string[] {
    const structured = data.forecast?.structured_recommendations ?? [];
    if (structured.length > 0) {
        return structured.map((item) => item.text);
    }

    return Array.isArray(data.forecast?.recommendations) ? data.forecast.recommendations : [];
}

export function buildForecastTrendRows(data: ForecastOverviewResponse): Array<{ label: string; value: string }> {
    const trends = data.snapshot?.trends ?? {};
    const rows: Array<{ label: string; value: string }> = [];

    if (typeof trends.activity_score_change === "number") {
        const direction = trends.activity_direction === "up" ? "up" : trends.activity_direction === "down" ? "down" : "flat";
        rows.push({
            label: "Weekly activity trend",
            value: `${trends.activity_score_change > 0 ? "+" : ""}${trends.activity_score_change}% (${direction})`,
        });
    }

    if (typeof trends.tasks_completed_delta === "number") {
        rows.push({
            label: "Tasks completed vs prior period",
            value: `${trends.tasks_completed_delta > 0 ? "+" : ""}${trends.tasks_completed_delta}`,
        });
    }

    if (typeof trends.leads_won_delta === "number") {
        rows.push({
            label: "Leads won vs prior period",
            value: `${trends.leads_won_delta > 0 ? "+" : ""}${trends.leads_won_delta}`,
        });
    }

    return rows;
}

export function buildForecastChatMessage(data: ForecastOverviewResponse, instruction?: string): string {
    const outlook = formatOutlookLabel(data.forecast?.outlook ?? "next_7_days", data.forecast?.horizon_days);
    const recommendations = getForecastRecommendations(data);
    const snapshotLines = buildForecastSnapshotRows(data)
        .slice(0, 8)
        .map((row) => `${row.label}: ${row.value}`)
        .join("\n");
    const recommendationLines = recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n");
    const narrative = typeof data.forecast?.narrative === "string" ? data.forecast.narrative.trim() : "";
    const trendLines = buildForecastTrendRows(data)
        .map((row) => `${row.label}: ${row.value}`)
        .join("\n");

    const prompt =
        instruction?.trim() ||
        "Review this operational forecast and recommend the highest-impact actions for the next week.";

    const sections = [
        prompt,
        "",
        `Forecast outlook: ${outlook}`,
        formatConfidenceLabel(data.forecast?.confidence ?? 0.5, data.forecast?.risk_level),
        "",
        "Key metrics:",
        snapshotLines || "No KPI snapshot available.",
    ];

    if (trendLines) {
        sections.push("", "Trend signals:", trendLines);
    }

    if (narrative) {
        sections.push("", "Executive forecast:", narrative);
    }

    sections.push("", "Priority recommendations:", recommendationLines || "No recommendations generated.");

    return sections.join("\n");
}

export function formatForecastGeneratedAt(data: ForecastOverviewResponse): string {
    const generatedAt = data.forecast?.generated_at;
    if (!generatedAt) {
        return "Generated just now";
    }

    const date = new Date(generatedAt);
    if (Number.isNaN(date.getTime())) {
        return "Generated just now";
    }

    return `Generated ${date.toLocaleString()}`;
}

export function formatForecastOutlookTitle(data: ForecastOverviewResponse): string {
    return `${formatOutlookLabel(data.forecast?.outlook ?? "next_7_days", data.forecast?.horizon_days)} Forecast`;
}

export function formatForecastConfidence(data: ForecastOverviewResponse): string {
    return formatConfidenceLabel(data.forecast?.confidence ?? 0.5, data.forecast?.risk_level);
}
