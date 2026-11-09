"use client";

import { useQuery } from "@tanstack/react-query";
import { useSalesEngineAuth } from "@/hooks/use-sales-engine-auth";
import { seRequest } from "@/lib/api/sales-engine";
import { getSalesEngineOrgId } from "@/lib/sales-engine/session";
import type { OutreachDashboardData } from "@/lib/outreach-dashboard";
import { OutreachDashboardView } from "./outreach-dashboard-view";

const empty: OutreachDashboardData = {
  source: "live", counts: { outreach: 0, businesses: 0 }, defaultBusinessId: null, businesses: [], outreach: [], metrics: [
    { id: "email", title: "No of Emails", total: 0, primaryLabel: "Sent", secondaryLabel: "Received", primaryPercent: 0, secondaryPercent: 0, avatars: 0 },
    { id: "sms", title: "No of SMS", total: 0, primaryLabel: "Sent", secondaryLabel: "Received", primaryPercent: 0, secondaryPercent: 0, avatars: 0 },
    { id: "voice-calls", title: "Number of Voice Calls", total: null, primaryLabel: "Incoming", secondaryLabel: "Outgoing", primaryPercent: null, secondaryPercent: null, primaryCount: null, secondaryCount: null, avatars: 0 },
  ]
};

export function LiveOutreachDashboard() {
  const auth = useSalesEngineAuth();
  const dashboard = useQuery({ queryKey: ["sales-engine", "outreach", "dashboard", getSalesEngineOrgId()], queryFn: () => seRequest<OutreachDashboardData>({ method: "GET", path: "/outreach/dashboard" }), enabled: Boolean(auth.data), staleTime: 0, refetchOnMount: "always" });
  return <OutreachDashboardView data={dashboard.data ?? empty} loading={auth.isLoading || dashboard.isLoading} error={auth.isError || dashboard.isError} onRetry={() => { void auth.refetch(); void dashboard.refetch(); }} />;
}
