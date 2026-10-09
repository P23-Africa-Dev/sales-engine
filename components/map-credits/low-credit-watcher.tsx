"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, MapPin, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useMapCredits } from "@/hooks/use-map-credits";
import { useMapCreditStore } from "@/store/map-credits";

const MANAGEMENT_ROLES = new Set(["owner", "admin", "supervisor"]);
const TOAST_ID = "map-credit-low";
// Don't nag: at most one prompt per this interval, regardless of how many
// Google calls the user makes.
const THROTTLE_MS = 10 * 60 * 1000;

type CreditPromptProps = {
  exhausted: boolean;
  balance?: number | null;
  toastId: string | number;
  onTopUp: () => void;
};

function MapCreditPrompt({ exhausted, balance, toastId, onTopUp }: CreditPromptProps) {
  const title = exhausted ? "Map credits exhausted" : "Map credits running low";
  const description = exhausted
    ? "Google Maps search & places are paused until you top up. The map still works via the fallback provider."
    : "Top up soon to avoid interruptions to map search and places.";

  return (
    <div
      className="pointer-events-auto w-[min(100vw-2rem,420px)] overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_12px_40px_-12px_rgba(9,35,45,0.35)]"
      role="status"
      aria-live="polite"
    >
      <div
        className={`h-1 w-full ${
          exhausted
            ? "bg-gradient-to-r from-[#E11D48] via-[#FB7185] to-[#FDBA74]"
            : "bg-gradient-to-r from-[#D97706] via-[#F59E0B] to-[#FCD34D]"
        }`}
      />

      <div className="flex gap-3.5 p-4 sm:p-[18px]">
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            exhausted ? "bg-[#FFF1F2] text-[#E11D48]" : "bg-[#FFFBEB] text-[#D97706]"
          }`}
        >
          {exhausted ? <AlertTriangle size={18} strokeWidth={2.25} /> : <MapPin size={18} strokeWidth={2.25} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-bold tracking-tight text-[#0B1215]">{title}</p>
            {typeof balance === "number" && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                  exhausted
                    ? "bg-[#FFF1F2] text-[#BE123C]"
                    : "bg-[#FFFBEB] text-[#B45309]"
                }`}
              >
                {balance} credits left
              </span>
            )}
          </div>
          <p className="text-[12.5px] leading-relaxed text-[#5B6570]">{description}</p>

          <div className="mt-3.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => toast.dismiss(toastId)}
              className="rounded-xl px-3.5 py-2 text-[12px] font-semibold text-[#5B6570] transition-colors hover:bg-[#F3F4F6] hover:text-[#0B1215] cursor-pointer"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(toastId);
                onTopUp();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B1215] px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1A2428] cursor-pointer"
            >
              <Zap size={13} className="text-[#86EFAC]" />
              Top up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Surfaces a throttled low/exhausted-credit prompt to management users. Driven
 * by both the periodic snapshot poll and the live per-call signal pushed into
 * the map-credit store by the Places client code.
 */
export function LowCreditWatcher() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { role, apiCompanyId: companyId } = getActiveCompanyContext(user);
  const isManagement = role != null && MANAGEMENT_ROLES.has(role);

  const { data } = useMapCredits(companyId ?? undefined, {
    enabled: isManagement,
    refetchInterval: 60_000,
  });

  const signalAt = useMapCreditStore((s) => s.lastEventAt);
  const signalMeta = useMapCreditStore((s) => s.lastMeta);
  const lastPromptAtRef = useRef(0);

  useEffect(() => {
    if (!isManagement) return;

    const metered = data?.metered ?? signalMeta?.metered ?? false;
    if (!metered) return;

    const exhausted = Boolean(data?.exhausted) || Boolean(signalMeta?.blocked);
    const low = Boolean(data?.low) || Boolean(signalMeta?.low) || exhausted;
    if (!low) return;

    const now = Date.now();
    if (now - lastPromptAtRef.current < THROTTLE_MS) return;
    lastPromptAtRef.current = now;

    const balance = data?.balance ?? signalMeta?.balance ?? null;

    toast.custom(
      (t) => (
        <MapCreditPrompt
          exhausted={exhausted}
          balance={balance}
          toastId={t}
          onTopUp={() => router.push("/settings/map-credits")}
        />
      ),
      {
        id: TOAST_ID,
        duration: Infinity,
      },
    );
  }, [isManagement, data?.low, data?.exhausted, data?.metered, data?.balance, signalAt, signalMeta, router]);

  return null;
}
