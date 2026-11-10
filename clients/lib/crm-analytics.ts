export type WeekGrowthDirection = "up" | "down" | "flat";

const RING_CIRCUMFERENCE = 238.76;

export function formatWeekGrowthLabel(
  percent: number,
  direction: WeekGrowthDirection,
): string {
  if (direction === "flat") {
    return "No change this week";
  }

  const magnitude = Math.abs(percent);
  return direction === "up"
    ? `${magnitude}% increase this week`
    : `${magnitude}% decrease this week`;
}

export function getRingProgressPercent(percent: number): number {
  return Math.min(100, Math.abs(percent));
}

export function getRingStrokeDasharray(percent: number): string {
  const progress = getRingProgressPercent(percent);
  const filled = (progress / 100) * RING_CIRCUMFERENCE;
  const remaining = RING_CIRCUMFERENCE - filled;
  return `${filled} ${remaining}`;
}

export function formatMonthOverlay(monthNewLeads: number, monthLabel: string): string {
  return `${monthNewLeads.toLocaleString()} New Leads in ${monthLabel}`;
}
