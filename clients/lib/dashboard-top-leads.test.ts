import { describe, expect, it } from "vitest";

import {
  buildTopLeadsChartData,
  getLeadConversionRate,
  getLeadStatusProgress,
  getTopLeadsCenterRate,
  getTopLeadsDateRange,
} from "@/lib/dashboard-top-leads";

describe("dashboard-top-leads", () => {
  it("maps lead statuses to calibrated progress values", () => {
    expect(getLeadStatusProgress("newly_lead")).toBe(15);
    expect(getLeadStatusProgress("contacted")).toBe(35);
    expect(getLeadStatusProgress("qualified")).toBe(55);
    expect(getLeadStatusProgress("proposal_sent")).toBe(75);
    expect(getLeadStatusProgress("won")).toBe(100);
    expect(getLeadStatusProgress("lost")).toBe(0);
  });

  it("builds date ranges for weekly, monthly, and yearly filters", () => {
    const referenceDate = new Date("2026-06-25T12:00:00");

    expect(getTopLeadsDateRange("Weekly", referenceDate)).toEqual({
      from_date: "2026-06-19",
      to_date: "2026-06-25",
    });
    expect(getTopLeadsDateRange("Monthly", referenceDate)).toEqual({
      from_date: "2026-05-27",
      to_date: "2026-06-25",
    });
    expect(getTopLeadsDateRange("Yearly", referenceDate)).toEqual({
      from_date: "2025-06-26",
      to_date: "2026-06-25",
    });
  });

  it("derives conversion from pipeline won stages", () => {
    expect(
      getLeadConversionRate(
        {
          total: 8,
          stages: [
            { status: "newly_lead", count: 3 },
            { status: "qualified", count: 3 },
            { status: "won", count: 2 },
          ],
        },
        { total_leads: 20, converted_leads: 10 },
      ),
    ).toBe(25);
  });

  it("falls back to KPI conversion when pipeline data is unavailable", () => {
    expect(
      getLeadConversionRate(undefined, { total_leads: 10, converted_leads: 4 }),
    ).toBe(40);
  });

  it("builds chart data from top prospects instead of static placeholders", () => {
    expect(
      buildTopLeadsChartData(
        [
          { id: 1, name: "Alpha", status: "qualified", priority: "high", assigned_to_user_id: 1 },
          { id: 2, name: "Beta", status: "proposal_sent", priority: "medium", assigned_to_user_id: 2 },
          { id: 3, name: "Gamma", status: "contacted", priority: "low", assigned_to_user_id: 3 },
        ],
        40,
      ),
    ).toEqual([
      { id: "1", name: "Alpha", value: 55, fill: "#7BB6B8" },
      { id: "2", name: "Beta", value: 75, fill: "#146AFA" },
      { id: "3", name: "Gamma", value: 35, fill: "#FD6046" },
    ]);
  });

  it("uses the conversion rate for all rings when no prospects are available", () => {
    expect(buildTopLeadsChartData([], 62)).toEqual([
      { id: "placeholder-0", name: "Lead 1", value: 62, fill: "#7BB6B8" },
      { id: "placeholder-1", name: "Lead 2", value: 62, fill: "#146AFA" },
      { id: "placeholder-2", name: "Lead 3", value: 62, fill: "#FD6046" },
    ]);
  });

  it("calibrates the center percentage to the highest ring value", () => {
    expect(
      getTopLeadsCenterRate([
        { id: "1", name: "Alpha", value: 55, fill: "#7BB6B8" },
        { id: "2", name: "Beta", value: 75, fill: "#146AFA" },
        { id: "3", name: "Gamma", value: 35, fill: "#FD6046" },
      ]),
    ).toBe(75);
  });
});
