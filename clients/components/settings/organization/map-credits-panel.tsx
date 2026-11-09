"use client";

import { useState } from "react";
import { Loader2, Zap, TrendingDown, RefreshCw } from "lucide-react";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { useMapCredits, useMapCreditTransactions } from "@/hooks/use-map-credits";
import { TopupModal } from "@/components/map-credits/topup-modal";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TX_LABELS: Record<string, string> = {
  allocation: "Plan allocation",
  topup: "Top up",
  consumption: "Usage",
  reset: "Cycle reset",
  admin_adjust: "Adjustment",
};

export function MapCreditsPanel() {
  const { companyId, canManageBilling } = useSettingsAccess();
  const [topupOpen, setTopupOpen] = useState(false);

  const { data: credits, isLoading } = useMapCredits(companyId ?? undefined);
  const { data: txData } = useMapCreditTransactions(companyId ?? undefined, 1);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  const allocation = credits?.allocation_credits ?? 0;
  const balance = credits?.balance ?? 0;
  const usedThisCycle = credits?.used_this_cycle ?? 0;
  const usedPct = allocation > 0 ? Math.min(100, Math.round((usedThisCycle / allocation) * 100)) : 0;
  const low = Boolean(credits?.low);

  return (
    <div className="space-y-4">
      <SettingsSectionCard
        title="Map Credits"
        description="Google Maps usage is metered against your organization's credits"
        scope="billing"
      >
        <div className="space-y-5">
          {!credits?.metered && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-[13px] text-blue-700">
              Map usage is currently not metered for this organization (demo or enforcement off).
              Usage is still tracked below.
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                Remaining balance
              </p>
              <p className={`text-3xl font-black ${low ? "text-amber-600" : "text-dash-dark"}`}>
                {balance.toLocaleString()}
                <span className="text-[14px] font-semibold text-gray-400 ml-2">credits</span>
              </p>
              <p className="text-[13px] text-gray-500 mt-0.5">
                ≈ ${(credits?.balance_usd ?? 0).toFixed(2)}
                {credits?.plan_label ? ` · ${credits.plan_label}` : ""}
              </p>
            </div>
            {canManageBilling && (
              <button
                type="button"
                onClick={() => setTopupOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold"
              >
                <Zap size={15} />
                Top up credits
              </button>
            )}
          </div>

          {low && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[13px] text-amber-700 flex items-center gap-2">
              <TrendingDown size={16} />
              Your map credits are running low. Top up to avoid interruptions to map search and places.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-[12px] text-gray-500 mb-1.5">
              <span>Plan allocation used this cycle</span>
              <span className="font-semibold">
                {usedThisCycle.toLocaleString()} / {allocation.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-green-500"}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase">Plan credits left</p>
              <p className="text-[16px] font-bold text-dash-dark mt-1">
                {(credits?.plan_credits ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase">Top up credits</p>
              <p className="text-[16px] font-bold text-dash-dark mt-1">
                {(credits?.topup_credits ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase inline-flex items-center gap-1">
                <RefreshCw size={11} /> Resets
              </p>
              <p className="text-[14px] font-semibold text-dash-dark mt-1">
                {formatDate(credits?.period_end ?? null)}
              </p>
            </div>
          </div>

          {!canManageBilling && (
            <p className="text-[12px] text-gray-500">
              Contact your workspace owner or admin to top up credits.
            </p>
          )}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Usage History" scope="billing">
        {txData && txData.items.length > 0 ? (
          <div className="overflow-x-auto -mx-6 -my-5">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold">When</th>
                  <th className="px-6 py-3 font-semibold">Activity</th>
                  <th className="px-6 py-3 font-semibold">Detail</th>
                  <th className="px-6 py-3 font-semibold text-right">Credits</th>
                  <th className="px-6 py-3 font-semibold text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {txData.items.map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                      {formatDateTime(tx.created_at)}
                    </td>
                    <td className="px-6 py-3 font-semibold text-dash-dark">
                      {TX_LABELS[tx.type] ?? tx.type}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{tx.sku ?? "—"}</td>
                    <td
                      className={`px-6 py-3 text-right font-semibold ${
                        tx.credits < 0 ? "text-red-500" : "text-green-600"
                      }`}
                    >
                      {tx.credits > 0 ? "+" : ""}
                      {tx.credits.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">
                      {tx.balance_after.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-gray-500 py-4 text-center">No usage recorded yet.</p>
        )}
      </SettingsSectionCard>

      <TopupModal
        isOpen={topupOpen}
        onClose={() => setTopupOpen(false)}
        creditsPerUsd={credits?.credits_per_usd ?? 100}
        companyId={companyId ?? undefined}
      />
    </div>
  );
}
