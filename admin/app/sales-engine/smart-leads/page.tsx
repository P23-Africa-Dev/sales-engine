import { SmartLeadsView } from "@/components/smart-leads/smart-leads-view";
import type { Metadata } from "next";
import "@/components/social-listening/social-listening.css";
import "@/components/crm/admin-crm.css";
import "@/components/smart-leads/smart-leads.css";

export const metadata: Metadata = {
  title: "Smart Leads | Admin Sales Engine",
  description:
    "Review client prospect pools, buying signals, and fit in the admin Smart Leads workspace.",
};

export default function SmartLeadsPage() {
  return <SmartLeadsView />;
}
