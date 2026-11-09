"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import {
  createBillingPortalSession,
  getBillingStatus,
  type BillingPlan,
} from "@/lib/api/billing";
import { getBillingPlans } from "@/lib/api/billing";
import { PaymentMethodsCard } from "@/components/settings/billing/payment-methods-card";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700";
    case "past_due":
    case "grace":
      return "bg-amber-100 text-amber-700";
    case "suspended":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function planLabel(plans: BillingPlan[] | undefined, planKey: string | null): string {
  if (!planKey) return "No plan";
  return plans?.find((p) => p.key === planKey)?.label ?? planKey;
}

export function BillingSettingsPanel() {
  const { canManageBilling } = useSettingsAccess();

  const { data: status, isLoading: loadingStatus } = useQuery({
    queryKey: ["billing-status"],
    queryFn: async () => {
      const res = await getBillingStatus();
      return res.data;
    },
  });

  const { data: plansData } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const res = await getBillingPlans();
      return res.data;
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await createBillingPortalSession();
      return res.data.portal_url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message || "Unable to open billing portal."),
  });

  if (loadingStatus) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  const plans = plansData?.plans;

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Plan & Subscription"
        description="Your workspace plan, renewal, and seat usage"
        scope="billing"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-dash-dark">
                {planLabel(plans, status?.plan_key ?? null)}
              </p>
              <p className="text-[13px] text-gray-500 capitalize mt-0.5">
                {status?.billing_interval ?? "—"} billing
              </p>
            </div>
            <span
              className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${statusBadgeClass(status?.subscription_status ?? "none")}`}
            >
              {(status?.subscription_status ?? "none").replace(/_/g, " ")}
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase">Seats used</p>
              <p className="text-[16px] font-bold text-dash-dark mt-1">
                {status?.seat_usage.used ?? 0}
                {status?.seat_usage.limit != null ? ` / ${status.seat_usage.limit}` : ""}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase">Renews</p>
              <p className="text-[14px] font-semibold text-dash-dark mt-1">
                {formatDate(status?.current_period_end ?? null)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase">Company</p>
              <p className="text-[14px] font-semibold text-dash-dark mt-1 truncate">
                {status?.company_name ?? "—"}
              </p>
            </div>
          </div>

          {status?.payment_method?.last_four && (
            <div className="flex items-center gap-2 text-[13px] text-gray-600">
              <CreditCard size={16} />
              <span className="capitalize">{status.payment_method.type ?? "card"}</span>
              <span>•••• {status.payment_method.last_four}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {canManageBilling && status?.can_choose_plan && (
              <Link
                href="/billing/change-plan"
                className="px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold"
              >
                Upgrade or change plan
              </Link>
            )}
            {canManageBilling && !status?.can_choose_plan && (
              <p className="text-[12px] text-gray-500 self-center">
                Your plan is managed by Factory23. Contact support to change seats.
              </p>
            )}
            {canManageBilling && status?.has_stripe_customer && (
              <button
                type="button"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 disabled:opacity-50"
              >
                <ExternalLink size={14} />
                Manage invoices & subscription
              </button>
            )}
            {!canManageBilling && (
              <p className="text-[12px] text-gray-500">
                Contact your workspace owner or admin to manage billing.
              </p>
            )}
          </div>
        </div>
      </SettingsSectionCard>

      {canManageBilling && <PaymentMethodsCard />}
    </div>
  );
}
