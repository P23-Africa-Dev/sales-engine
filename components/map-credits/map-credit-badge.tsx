"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useMapCredits } from "@/hooks/use-map-credits";

const MANAGEMENT_ROLES = new Set(["owner", "admin", "supervisor"]);

export function MapCreditBadge() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { role, apiCompanyId: companyId } = getActiveCompanyContext(user);
  const isAgent = role === "agent";
  const isManagement = role != null && MANAGEMENT_ROLES.has(role);

  const { data } = useMapCredits(companyId ?? undefined, {
    enabled: isManagement,
    refetchInterval: 60_000,
  });

  // Hidden for agents, when the org isn't metered (demo / enforcement off), or when credit is above 50.
  if (!isManagement || !data || !data.metered || data.balance > 50) return null;

  const balance = data.balance;
  const isLow = balance <= 50;
  const exhausted = balance <= 0;

  const tone = exhausted
    ? "bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/20"
    : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/20";

  const displayCount = balance.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const basePath = isAgent ? "/agent" : "";
  const targetHref = `${basePath}/settings/map-credits`;

  const handleNavigate = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    router.push(targetHref);
  };

  return (
    <div className="relative group hidden sm:inline-flex items-center">
      <Link
        href={targetHref}
        onClick={handleNavigate}
        title={`${displayCount} credits - Click to top up`}
        className={`inline-flex items-center gap-1.5 rounded-full ${
          isLow ? "px-3 py-1.5" : "p-2"
        } text-[12px] font-semibold transition-all duration-200 cursor-pointer ${tone}`}
      >
        <Coins size={16} />
        {isLow && <span>Low</span>}
      </Link>

      {/* Floating tooltip on hover */}
      <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 flex flex-col items-center">
        <div className="w-2 h-2 bg-[#0d2d3a] rotate-45 -mb-1 border-l border-t border-white/15" />
        <div className="bg-[#0d2d3a] text-white text-[11px] font-medium px-3 py-1.5 rounded-xl shadow-xl border border-white/15 whitespace-nowrap">
          {displayCount} credits remaining
        </div>
      </div>
    </div>
  );
}
