"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Radio, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import type { SocialListeningEmptyState } from "@/lib/social-listening-empty-state";
import { SOCIAL_LISTENING_TIPS, formatSourceLabel } from "@/lib/social-listening-processing-labels";

function GhostBlock({ className }: { className?: string }) {
  return <span className={`block rounded-md bg-[#09232d]/6 ${className ?? ""}`} />;
}

function GhostSignalRows() {
  return (
    <div className="mx-auto mt-4 w-full max-w-[520px] space-y-2 rounded-[14px] bg-[#f8f8f8] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(9,35,45,0.04)]">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center gap-2 rounded-[12px] bg-white/70 px-2 py-2">
          <GhostBlock className="size-[18px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1">
            <GhostBlock className="h-1.5 w-full" />
            <GhostBlock className="h-1.5 w-[72%]" />
          </div>
          <GhostBlock className="hidden h-4 w-10 rounded-full sm:block" />
          <GhostBlock className="size-6 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyStateIcon({ variant }: { variant: SocialListeningEmptyState["variant"] }) {
  switch (variant) {
    case "filters_no_match":
      return <Search size={16} />;
    case "scan_failed":
      return <Sparkles size={16} />;
    case "awaiting_first_scan":
      return <Radio size={16} />;
    default:
      return <Radio size={16} />;
  }
}

export function SocialSignalsEmptyState({
  state,
  enabledSources = [],
  onScanNow,
  onOpenSettings,
}: {
  state: SocialListeningEmptyState;
  enabledSources?: string[];
  onScanNow?: () => void;
  onOpenSettings?: () => void;
}) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % SOCIAL_LISTENING_TIPS.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-6 text-center">
      <div className="flex max-w-[520px] flex-col items-center">
        <div className="relative grid size-10 place-items-center rounded-full bg-[#09232d] text-white shadow-sm">
          <EmptyStateIcon variant={state.variant} />
          <span className="absolute inset-[-3px] rounded-full border border-[#16b37d]/30" />
        </div>

        <h3 className="mt-3 text-[11px] font-semibold text-[#09232d]">{state.title}</h3>
        <p className="mt-1 max-w-[360px] text-[10px] leading-[14px] text-[#616263]">
          {state.description}
        </p>

        {state.variant === "awaiting_first_scan" && enabledSources.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {enabledSources.map((source) => (
              <span
                key={source}
                className="rounded-full bg-[#09232d]/8 px-2 py-0.5 text-[8px] font-semibold text-[#09232d]/70"
              >
                {formatSourceLabel(source)}
              </span>
            ))}
          </div>
        )}

        <GhostSignalRows />

        <p className="mt-3 max-w-[360px] text-[8px] leading-[12px] text-[#616263]">
          <span className="font-semibold text-[#09232d]/70">Tip: </span>
          {SOCIAL_LISTENING_TIPS[tipIndex]}
        </p>

        {state.showActions && (onScanNow || onOpenSettings) && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {onScanNow && (
              <button
                type="button"
                onClick={onScanNow}
                className="flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] font-medium text-[#34373c] transition-colors hover:bg-white"
              >
                <Sparkles size={12} />
                Refresh
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[#09232d] px-3 text-[10px] font-medium text-white transition-colors hover:bg-[#0f3340]"
              >
                <SlidersHorizontal size={12} />
                Listen Settings
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SocialOpportunityEmptyState() {
  return (
    <aside className="flex min-h-[645px] flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
      <div className="relative h-[165px] bg-[#0b242e]/90 px-7 pb-5 pt-8 opacity-35">
        <GhostBlock className="absolute right-7 top-8 size-[43px] rounded-full bg-white/20" />
        <GhostBlock className="size-[22px] rounded-full bg-white/20" />
        <div className="mt-3 space-y-2">
          <GhostBlock className="h-2 w-full bg-white/20" />
          <GhostBlock className="h-2 w-[90%] bg-white/20" />
          <GhostBlock className="h-2 w-[70%] bg-white/20" />
        </div>
        <GhostBlock className="mt-3 h-2 w-[120px] bg-white/20" />
      </div>

      <div className="flex flex-1 flex-col gap-4 px-7 py-6 opacity-35">
        <div className="flex items-center gap-3">
          <GhostBlock className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <GhostBlock className="h-2.5 w-[100px]" />
            <GhostBlock className="h-2 w-[140px]" />
          </div>
        </div>
        <GhostBlock className="h-6 w-[88px] rounded-full" />
        <div className="space-y-2">
          <GhostBlock className="h-2 w-full" />
          <GhostBlock className="h-2 w-[92%]" />
          <GhostBlock className="h-2 w-[78%]" />
        </div>
      </div>

      <div className="border-t border-[#f1f1f1] px-7 py-5 text-center">
        <div className="mb-2 hidden items-center justify-center gap-1 text-[#616263] xl:flex">
          <ArrowLeft size={12} />
          <span className="text-[9px]">Select from the list</span>
        </div>
        <p className="text-[11px] font-semibold text-[#09232d]">Select a signal to preview</p>
        <ul className="mx-auto mt-2 max-w-[240px] space-y-1 text-left text-[9px] leading-[13px] text-[#616263]">
          <li>Intent score and buying signal context</li>
          <li>Recommended next action for outreach</li>
          <li>Quick actions to sync, remind, or draft email</li>
        </ul>
      </div>
    </aside>
  );
}
