"use client";

import { useCallback, useEffect, useState } from "react";
import { OutreachDashboardView } from "./outreach-dashboard-view";
import type { OutreachDashboardData } from "@/lib/outreach-dashboard";
import {
  fetchOutreachActivities,
  fetchOutreachDashboard,
  fetchOutreachOrganizations,
} from "@/lib/api/admin-outreach";
import { AdminApiError } from "@/lib/api/admin-client";

const AVATARS = ["#2563eb", "#0d9488", "#7c3aed", "#dc2626", "#d97706", "#0891b2"];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export function OutreachDashboard() {
  const [data, setData] = useState<OutreachDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboard, orgs, activities] = await Promise.all([
        fetchOutreachDashboard(),
        fetchOutreachOrganizations(),
        fetchOutreachActivities({ per_page: 50, page: 1 }),
      ]);

      const businesses = orgs.data.map((org, index) => ({
        id: String(org.organization_id),
        name: org.name,
        industry: org.industry || "—",
        country: org.country || "—",
        website: org.website || "—",
        owner: org.owner || "Invited owner",
        created: formatDate(org.created_at),
        avatarColor: AVATARS[index % AVATARS.length],
        company: org.name,
        emailsSent: org.emails_sent,
        prospects: org.prospects,
        followUpsCompleted: org.follow_ups_completed,
      }));

      const outreach = activities.data.map((row, index) => ({
        id: String(row.id),
        businessId: String(row.organization_id),
        name: row.organization_name || row.name,
        channel: row.channel,
        status: row.status,
        owner: row.owner || "—",
        created: formatDate(row.created_at),
        avatarColor: AVATARS[index % AVATARS.length],
      }));

      setData({
        source: dashboard.data.source || "live",
        counts: {
          outreach: dashboard.data.counts.outreach,
          businesses: dashboard.data.counts.organizations,
        },
        metrics: dashboard.data.metrics.map((metric) => ({
          ...metric,
          avatars: 3,
        })),
        defaultBusinessId: businesses[0]?.id ?? null,
        businesses,
        outreach,
      });
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load outreach dashboard",
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="outreach-dashboard"><p>Loading outreach dashboard…</p></div>;
  }

  if (error || !data) {
    return (
      <div className="outreach-dashboard">
        <p>{error || "No outreach data available."}</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return <OutreachDashboardView data={data} />;
}
