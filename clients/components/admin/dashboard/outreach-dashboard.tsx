"use client";

import demoData from "@/data/admin/outreach-dashboard.json";
import { OutreachDashboardView } from "./outreach-dashboard-view";
import type { OutreachDashboardData } from "@/lib/admin/outreach-dashboard";

export function OutreachDashboard() {
  return <OutreachDashboardView data={demoData as OutreachDashboardData} />;
}
