import { SmartLeadsView } from "@/components/admin/smart-leads/smart-leads-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smart Leads | Admin Sales Engine",
  description:
    "Review client prospect pools, buying signals, and fit in the admin Smart Leads workspace.",
};

export default function SmartLeadsPage() {
  return <SmartLeadsView />;
}
