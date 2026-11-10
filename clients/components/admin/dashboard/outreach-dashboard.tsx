import demoData from "@/data/admin/outreach-dashboard.json";
import { OutreachDashboardView } from "./outreach-dashboard-view";
import type { OutreachDashboardData } from "@/lib/admin/outreach-dashboard";

export function OutreachDashboard() {
  const data: OutreachDashboardData = demoData;
  return <OutreachDashboardView data={data} />;
}
