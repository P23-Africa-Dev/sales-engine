"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import type { AgentPendingFieldStop } from "@/lib/api/field-activity";
import {
  useAgentDailySummary,
  useAgentPendingReview,
  useClassifyAgentFieldStop,
} from "@/hooks/use-agent-field-review";

const OPTIONS = [
  { value: "customer_visit", label: "Customer" },
  { value: "lead_visit", label: "Lead" },
  { value: "org_visit", label: "Org location" },
  { value: "personal", label: "Personal" },
  { value: "ignore", label: "Ignore" },
] as const;

function StopRow({
  stop,
  busy,
  onClassify,
}: {
  stop: AgentPendingFieldStop;
  busy: boolean;
  onClassify: (stopId: number, classification: string, leadId?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [leadId, setLeadId] = useState("");
  const needsLead = selected === "customer_visit" || selected === "lead_visit";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-dash-dark">
            {stop.address || `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {Math.round(stop.duration_seconds / 60)} min · {stop.classification}
          </p>
        </div>
        {stop.classification === "pending" && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-[#75ADAF]/15 px-3 py-1 text-xs font-semibold text-[#2F5E71]"
          >
            Classify
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={busy}
                onClick={() => setSelected(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  selected === opt.value
                    ? "border-[#2F5E71] bg-[#2F5E71] text-white"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {needsLead && (
            <input
              type="number"
              placeholder="Lead ID"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
          )}
          <button
            type="button"
            disabled={busy || !selected || (needsLead && !leadId)}
            onClick={() => {
              if (!selected) return;
              onClassify(stop.id, selected, leadId ? Number(leadId) : undefined);
              setOpen(false);
            }}
            className="w-full rounded-xl bg-[#2F5E71] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save classification
          </button>
        </div>
      )}
    </div>
  );
}

function formatDistanceKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function DayBreakdown() {
  const { data, isLoading } = useAgentDailySummary(true);
  const session = data?.session;
  const summary = data?.summary;
  const stops = data?.stops ?? [];

  const distance = summary?.distance_meters ?? session?.distance_meters ?? 0;
  const travel = summary?.travel_seconds ?? session?.travel_seconds ?? 0;
  const stationary = summary?.stationary_seconds ?? session?.stationary_seconds ?? 0;
  const stopCount = Math.max(
    summary?.stop_count ?? 0,
    session?.stop_count ?? 0,
    stops.length,
  );
  const visitCount = Math.max(summary?.visit_count ?? 0, session?.visit_count ?? 0);

  if (isLoading) {
    return (
      <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        Loading your day…
      </p>
    );
  }

  if (!session) {
    return (
      <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        No journey was recorded today.
      </p>
    );
  }

  const cards = [
    { label: "Distance", value: formatDistanceKm(distance) },
    { label: "Travel time", value: formatSeconds(travel) },
    { label: "Time at stops", value: formatSeconds(stationary) },
    { label: "Stops", value: String(stopCount) },
    { label: "Visits", value: String(visitCount) },
    {
      label: "Session",
      value:
        session.started_at && session.ended_at
          ? `${format(parseISO(session.started_at), "h:mma")} – ${format(parseISO(session.ended_at), "h:mma")}`
          : session.started_at
          ? `Since ${format(parseISO(session.started_at), "h:mma")}`
          : "—",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-0.5 text-sm font-bold text-dash-dark">{card.value}</p>
          </div>
        ))}
      </div>

      {summary?.narrative && (
        <p className="rounded-2xl border border-[#75ADAF]/30 bg-[#75ADAF]/10 px-4 py-3 text-sm text-[#2F5E71]">
          {summary.narrative}
        </p>
      )}

      {stops.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Today&apos;s stops
          </p>
          {stops.map((stop) => (
            <div
              key={stop.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-dash-dark">
                  {stop.address || `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {stop.arrived_at ? format(parseISO(stop.arrived_at), "h:mma") : "—"}
                  {" · "}
                  {Math.round(stop.duration_seconds / 60)} min
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  stop.classification === "pending"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {stop.classification ?? "pending"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentDayReviewModal({
  open,
  onClose,
  onPile,
}: {
  open: boolean;
  onClose: () => void;
  onPile: () => void;
}) {
  const { data, refetch } = useAgentPendingReview(open);
  const classify = useClassifyAgentFieldStop();

  const stops = useMemo(() => {
    const first = data?.sessions?.[0];
    return first?.stops?.filter((s) => s.classification === "pending") ?? [];
  }, [data]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2F5E71]">
              Day review
            </p>
            <h3 className="mt-1 text-lg font-bold text-dash-dark">Your day at a glance</h3>
            <p className="mt-1 text-sm text-slate-500">
              {(data?.pending_stop_count ?? 0) > 0
                ? `${data?.pending_stop_count} stop(s) still need classification.`
                : "All caught up for now."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>

        <div className="mb-5">
          <DayBreakdown />
        </div>

        {stops.length > 0 && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Classify pending stops
          </p>
        )}
        <div className="space-y-3">
          {stops.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              Nothing left to classify.
            </p>
          ) : (
            stops.map((stop) => (
              <StopRow
                key={stop.id}
                stop={stop}
                busy={classify.isPending}
                onClassify={async (stopId, classification, leadId) => {
                  try {
                    await classify.mutateAsync({ stopId, classification, lead_id: leadId });
                    toast.success("Stop classified");
                    void refetch();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not classify stop");
                  }
                }}
              />
            ))
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onPile();
              toast.success("Piled for later");
            }}
            className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-700"
          >
            Pile for later
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-[#2F5E71] py-3 text-sm font-semibold text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentPileInboxPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, refetch, isLoading } = useAgentPendingReview(open);
  const classify = useClassifyAgentFieldStop();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-600">
              Review inbox
            </p>
            <h3 className="mt-1 text-lg font-bold text-dash-dark">Piled day reviews</h3>
            <p className="mt-1 text-sm text-slate-500">
              {data?.pending_stop_count ?? 0} stop(s) across {data?.pending_session_count ?? 0} day(s)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : (data?.sessions?.length ?? 0) === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            Inbox is clear.
          </p>
        ) : (
          <div className="space-y-5">
            {data!.sessions.map((session) => (
              <div key={session.session_id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-dash-dark">
                    {session.started_at
                      ? new Date(session.started_at).toLocaleDateString()
                      : "Unknown date"}
                  </p>
                  <span className="text-xs text-slate-400">
                    {session.pending_stop_count} pending
                  </span>
                </div>
                {session.stops.map((stop) => (
                  <StopRow
                    key={stop.id}
                    stop={stop}
                    busy={classify.isPending}
                    onClassify={async (stopId, classification, leadId) => {
                      try {
                        await classify.mutateAsync({
                          stopId,
                          classification,
                          lead_id: leadId,
                        });
                        toast.success("Stop classified");
                        void refetch();
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Could not classify stop",
                        );
                      }
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentPileInboxButton({ onClick }: { onClick: () => void }) {
  const { data } = useAgentPendingReview();
  const count = data?.pending_stop_count ?? 0;
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-700"
    >
      Review inbox
      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] text-white">
        {count}
      </span>
    </button>
  );
}
