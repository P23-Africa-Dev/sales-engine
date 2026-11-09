import type { JourneyCard } from "@/lib/api/field-activity";

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function formatDurationSeconds(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Build CSV for journey history export (date, distance, stops, duration, …). */
export function buildJourneysCsv(
  journeys: JourneyCard[],
  agentName?: string,
): string {
  const header = [
    "date",
    "agent",
    "status",
    "distance_meters",
    "stops",
    "visits",
    "active_duration",
    "travel_seconds",
    "clock_in_at",
    "clock_out_at",
  ].join(",");

  const rows = journeys.map((j) =>
    [
      csvEscape(j.date),
      csvEscape(agentName ?? ""),
      csvEscape(j.status),
      csvEscape(j.distance_meters),
      csvEscape(j.stop_count),
      csvEscape(j.visit_count),
      csvEscape(formatDurationSeconds(j.active_seconds)),
      csvEscape(j.travel_seconds),
      csvEscape(j.clock_in_at),
      csvEscape(j.clock_out_at),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

export function downloadTextFile(filename: string, contents: string, mime = "text/csv;charset=utf-8"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
