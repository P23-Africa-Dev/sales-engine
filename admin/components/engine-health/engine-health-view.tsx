"use client";

import { useEffect, useState, type ReactNode } from "react";
import { fetchEngineHealth, type EngineHealth } from "@/lib/api/admin-health";

const WINDOWS = [1, 7, 30, 90];

function fmt(value: number | null | undefined, suffix = ""): string {
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-white/50">{label}</p>
      <p className={`mt-1 text-2xl font-light ${warn ? "text-[#ff6b6b]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function Breakdown({ title, rows, unit = "" }: { title: string; rows: Record<string, number | string>; unit?: string }) {
  const entries = Object.entries(rows);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="mb-2 text-xs font-semibold text-white/70">{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-white/40">Nothing recorded.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map(([key, value]) => (
            <li key={key} className="flex justify-between gap-4 text-xs">
              <span className="truncate text-white/70">{key.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-white">
                {value}
                {typeof value === "number" ? unit : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-light">{title}</h2>
      <p className="mb-3 text-xs text-white/50">{hint}</p>
      {children}
    </section>
  );
}

export function EngineHealthView() {
  const [days, setDays] = useState(7);
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchEngineHealth(days)
      .then((result) => {
        if (!cancelled) setHealth(result.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load engine health.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const lead = health?.lead_search;
  const contacts = health?.contacts;
  const social = health?.social_listening;

  return (
    <div className="mx-auto max-w-[1200px] px-[5%] py-10 text-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight">
            Engine health<span className="text-[#2ae9c9]">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/60">
            Speed, yield and failures across all accounts. Internal only — none of this is shown to customers.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                days === option ? "bg-[#2ae9c9] text-black" : "text-white/70 hover:bg-white/5"
              }`}
            >
              {option === 1 ? "24h" : `${option}d`}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-6 rounded-lg bg-[#ff6b6b]/10 px-4 py-3 text-sm text-[#ff6b6b]">{error}</p>}
      {loading && !health && <p className="mt-6 text-sm text-white/50">Loading…</p>}

      {lead && contacts && social && health && (
        <>
          <Section title="Lead search" hint="Generate-leads runs, how long they take and whether they fill the requested count.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Runs" value={`${lead.runs}`} />
              <Stat label="Failed" value={`${lead.failed}`} warn={lead.failed > 0} />
              <Stat label="Avg time" value={fmt(lead.avg_seconds, "s")} />
              <Stat label="p90 time" value={fmt(lead.p90_seconds, "s")} warn={(lead.p90_seconds ?? 0) > 150} />
              <Stat label="Filled requested count" value={fmt(lead.requested_count_met_pct, "%")} />
              <Stat label="Avg leads / run" value={fmt(lead.avg_leads)} />
              <Stat label="Web search degraded" value={`${lead.web_search_degraded_runs}`} warn={lead.web_search_degraded_runs > 0} />
              <Stat label="Quick research failed" value={`${health.quick_research.failed} / ${health.quick_research.runs}`} warn={health.quick_research.failed > 0} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Breakdown title="Average seconds per stage" rows={lead.avg_stage_seconds} unit="s" />
              <Breakdown title="Provider failures (runs affected)" rows={lead.provider_failures} />
            </div>
          </Section>

          <Section title="Contacts" hint="Leads created in the window and how their contact lookup ended.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Leads" value={`${contacts.leads}`} />
              <Stat label="With an email" value={`${contacts.with_email_pct}%`} />
              <Stat label="With a phone" value={`${contacts.with_phone_pct}%`} />
              <Stat label="Still searching" value={`${contacts.status.searching ?? 0}`} warn={(contacts.status.searching ?? 0) > 0} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Breakdown title="Lookup status" rows={contacts.status} />
              <Breakdown title="Where contacts came from (field : confidence)" rows={contacts.sources} />
            </div>
          </Section>

          <Section title="Social listening" hint="Scans, what they found, and why posts were dropped.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Scans" value={`${social.runs}`} />
              <Stat label="Failed" value={`${social.failed}`} warn={social.failed > 0} />
              <Stat label="Posts checked" value={`${social.posts_checked}`} />
              <Stat label="Avg openings / scan" value={fmt(social.avg_openings_per_scan)} />
              <Stat label="Strong openings" value={`${social.strong_openings}`} />
              <Stat label="Possible openings" value={`${social.possible_openings}`} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Breakdown title="Dropped (by stage)" rows={social.dropped} />
              <Breakdown title="Dropped (by reason)" rows={social.dropped_detail} />
              <Breakdown title="Sources on the latest scan" rows={social.latest_source_status} />
              <Breakdown title="All signals by status" rows={social.signals_by_status} />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
