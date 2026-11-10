import type { Metadata } from "next";
import { AdminCrmView } from "@/components/admin/crm/admin-crm-view";
import "@/components/admin/social-listening/social-listening.css";
import "@/components/admin/crm/admin-crm.css";
export const metadata: Metadata = {
  title: "CRM | Admin Sales Engine",
  description:
    "Cross-business CRM analytics, pipeline oversight, record quality, and admin activity.",
};
export default function AdminCrmPage() {
  return <AdminCrmView />;
}
