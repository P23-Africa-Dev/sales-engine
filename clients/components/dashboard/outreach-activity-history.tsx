"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchOutreachActivity, seRequest, type OutreachActivity } from "@/lib/api/sales-engine";
import { getSalesEngineOrgId } from "@/lib/sales-engine/session";
import type { DashboardOutreach } from "@/lib/outreach-dashboard";

export function OutreachActivityHistory({ businessId, activity }: { businessId?: string | null; activity?: DashboardOutreach }) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ["sales-engine", "outreach", "history", getSalesEngineOrgId(), businessId, activity?.id, page],
    queryFn: async () => {
      if (businessId) return seRequest<{ items: OutreachActivity[]; last_page: number }>({ method: "GET", path: `/outreach/activities?${businessId.startsWith("lead:") ? "lead_id=" + encodeURIComponent(businessId.slice(5)) : "business_id=" + encodeURIComponent(businessId)}&page=${page}&per_page=10&sort=newest` });
      if (!activity) return { items: [], last_page: 1 };
      const draft = await fetchOutreachActivity(Number(activity.id));
      return { items: [{ id: Number(activity.id), name: draft.name || activity.name, channel: draft.channel, preview: draft.body, delivery_status: activity.status, occurred_at: activity.created }], last_page: 1 };
    },
    staleTime: 0,
  });
  if (history.isLoading) return <p role="status">Loading activity…</p>;
  if (history.isError) return <div role="alert"><p>Could not load activity.</p><button onClick={() => { void history.refetch(); }}>Try again</button></div>;
  return <>
    <p>Recorded outreach and current delivery status.</p>
    {!history.data?.items.length && <p>No outreach recorded for this prospect yet.</p>}
    {history.data?.items.map(item => <div className="activity-history-item" key={item.id}>
      <strong>{item.name}</strong>
      <p>{item.channel} · {item.delivery_status || "Draft"}</p>
      <p className="whitespace-pre-wrap">{item.preview}</p>
      <time dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString()}</time>
      {"bounce_reason" in item && item.bounce_reason && <p>{item.bounce_reason}</p>}
    </div>)}
    {(history.data?.last_page ?? 1) > 1 && <div>
      <button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
      <span>Page {page} of {history.data?.last_page}</span>
      <button disabled={page >= (history.data?.last_page ?? 1)} onClick={() => setPage(value => value + 1)}>Next</button>
    </div>}
  </>;
}
