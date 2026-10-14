"use client";

import demoData from "@/data/outreach-dashboard.json";
import { OutreachDashboardView } from "./outreach-dashboard-view";
import type { OutreachDashboardData } from "@/lib/outreach-dashboard";

export function OutreachDashboard() {
  return <OutreachDashboardView data={demoData as OutreachDashboardData} />;
}
