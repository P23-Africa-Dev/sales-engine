import { describe, expect, it } from "vitest";

import {
  formatMonthOverlay,
  formatWeekGrowthLabel,
  getRingProgressPercent,
  getRingStrokeDasharray,
} from "@/lib/crm-analytics";

describe("crm-analytics", () => {
  it("formats week growth labels by direction", () => {
    expect(formatWeekGrowthLabel(73, "up")).toBe("73% increase this week");
    expect(formatWeekGrowthLabel(-12, "down")).toBe("12% decrease this week");
    expect(formatWeekGrowthLabel(0, "flat")).toBe("No change this week");
  });

  it("caps ring progress at 100 percent", () => {
    expect(getRingProgressPercent(73)).toBe(73);
    expect(getRingProgressPercent(-45)).toBe(45);
    expect(getRingProgressPercent(150)).toBe(100);
  });

  it("builds svg stroke dash arrays from growth percent", () => {
    expect(getRingStrokeDasharray(50)).toBe("119.38 119.38");
    expect(getRingStrokeDasharray(100)).toBe("238.76 0");
  });

  it("formats month overlay copy", () => {
    expect(formatMonthOverlay(300, "June")).toBe("300 New Leads in June");
    expect(formatMonthOverlay(1200, "December")).toBe("1,200 New Leads in December");
  });
});
