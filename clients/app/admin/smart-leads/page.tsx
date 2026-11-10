import { SmartLeadsView } from "@/components/admin/smart-leads/smart-leads-view";
import { CRM_RECORDS } from "@/lib/admin/admin-crm";
import { buildKeyBusinessAccounts } from "@/lib/admin/key-business-accounts";
import { ONBOARDED_BUSINESSES_DATA } from "@/lib/admin/smart-leads";
import { addSampleActivity } from "@/lib/admin/smart-leads-sample-activity";
import { INITIAL_SIGNALS } from "@/lib/admin/social-listening";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smart Leads | Admin Sales Engine",
  description:
    "Prioritize key business accounts and review their buying signals and engagement.",
};

const businesses = addSampleActivity(ONBOARDED_BUSINESSES_DATA);
const accounts = buildKeyBusinessAccounts(businesses, CRM_RECORDS, INITIAL_SIGNALS);

export default function SmartLeadsPage() {
  return <SmartLeadsView accounts={accounts} businesses={businesses} />;
}
