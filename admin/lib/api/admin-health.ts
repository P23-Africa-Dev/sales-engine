import { adminRequest } from "./admin-client";

export type EngineHealth = {
  window_days: number;
  lead_search: {
    runs: number;
    completed: number;
    failed: number;
    avg_seconds: number | null;
    p90_seconds: number | null;
    avg_stage_seconds: Record<string, number>;
    requested_count_met_pct: number | null;
    avg_leads: number | null;
    web_search_degraded_runs: number;
    provider_failures: Record<string, number>;
  };
  quick_research: { runs: number; failed: number };
  contacts: {
    leads: number;
    status: Record<string, number>;
    with_email_pct: number;
    with_phone_pct: number;
    sources: Record<string, number>;
  };
  social_listening: {
    runs: number;
    failed: number;
    posts_checked: number;
    strong_openings: number;
    possible_openings: number;
    avg_openings_per_scan: number | null;
    dropped: Record<string, number>;
    dropped_detail: Record<string, number>;
    latest_source_status: Record<string, string>;
    signals_by_status: Record<string, number>;
  };
};

export async function fetchEngineHealth(days: number) {
  return adminRequest<{ data: EngineHealth }>(`/admin/engine-health?days=${days}`);
}
