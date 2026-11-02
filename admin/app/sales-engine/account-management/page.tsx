import { Suspense } from "react";
import { AccountManagementView } from "@/components/account-management/account-management-view";

export default function AccountManagementPage() {
  return (
    <Suspense fallback={<p>Loading accounts…</p>}>
      <AccountManagementView />
    </Suspense>
  );
}
