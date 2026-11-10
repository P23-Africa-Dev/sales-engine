"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ChatIntent } from "@/lib/api/sales-engine";
import {
  intentDisplayLabel,
  PROCESSING_PIPELINE_STEPS,
  PROCESSING_TIPS,
} from "@/lib/sales-engine-processing-labels";
import type { ProcessingState } from "@/hooks/use-sales-engine-chat";

const ASYNC_INTENTS: ChatIntent[] = ["generate_leads", "generate_more_leads"];

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

export function ProcessingPanel({
  state,
  onDetachToBackground,
  onStopSearching,
  onContinueWaiting,
}: {
  state: ProcessingState;
  onDetachToBackground?: () => void;
  onStopSearching?: () => void;
  onContinueWaiting?: () => void;
}) {
  const [tipIndex, setTipIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [userChoseContinue, setUserChoseContinue] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % PROCESSING_TIPS.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedMs = now - state.startedAt;
  const showElapsed = elapsedMs >= 15_000;
  const showLongRunHint = elapsedMs >= 30_000;
  const showChoicePrompt = elapsedMs >= 45_000 || userChoseContinue;
  const showStepper = ASYNC_INTENTS.includes(state.intent);
  const stepLabels = PROCESSING_PIPELINE_STEPS;
  const showLeadGenControls = showStepper && (Boolean(onDetachToBackground) || Boolean(onStopSearching));

  return (
    <div className="max-w-[520px] rounded-[18px] bg-[#f8f8f8] px-4 py-3 text-[#09232d] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.04)]">
      {showLeadGenControls && (
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#09232d]/8 pb-3">
          <span className="text-[8px] font-medium text-[#616263]">
            {showChoicePrompt
              ? "Still searching. Timeout is a last resort."
              : "This may take a minute."}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setUserChoseContinue(true);
                onContinueWaiting?.();
              }}
              className="flex h-7 items-center rounded-[10px] border border-[#16b37d]/40 bg-[#16b37d]/10 px-2.5 text-[8px] font-semibold text-[#087652] transition hover:bg-[#16b37d]/15"
            >
              Continue waiting
            </button>
            {onStopSearching && (
              <button
                type="button"
                onClick={onStopSearching}
                className="flex h-7 items-center rounded-[10px] border border-[#09232d]/15 bg-white px-2.5 text-[8px] font-semibold text-[#09232d] transition hover:bg-[#09232d]/5"
              >
                Stop searching
              </button>
            )}
            {onDetachToBackground && (
              <button
                type="button"
                onClick={onDetachToBackground}
                className="flex h-7 items-center rounded-[10px] border border-[#09232d]/15 bg-white px-2.5 text-[8px] font-semibold text-[#09232d] transition hover:bg-[#09232d]/5"
              >
                Process in background
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#09232d] text-white">
          <Sparkles size={14} className="animate-pulse" />
          <span className="absolute inset-[-4px] rounded-full border border-[#16b37d]/40 animate-ping" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#09232d]/8 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#09232d]/70">
              {intentDisplayLabel(state.intent)}
            </span>
            {showElapsed && (
              <span className="text-[8px] font-medium text-[#616263]">
                {formatElapsed(elapsedMs)}
              </span>
            )}
          </div>

          <p
            key={state.label}
            className="animate-in fade-in slide-in-from-bottom-1 mt-1 text-[11px] font-semibold duration-300"
          >
            {state.label}
          </p>

          {state.secondaryLabel && (
            <p className="mt-0.5 text-[9px] font-medium text-[#16b37d]">{state.secondaryLabel}</p>
          )}

          {showStepper && (
            <div className="mt-2.5">
              <p className="mb-1.5 text-[8px] font-medium text-[#616263]">
                Step {state.stepIndex + 1} of {state.totalSteps}: {stepLabels[state.stepIndex]}
              </p>
              <div className="flex items-center gap-1">
                {stepLabels.map((step, index) => {
                  const isComplete = index < state.stepIndex;
                  const isActive = index === state.stepIndex;

                  return (
                    <div key={step} className="flex flex-1 flex-col items-center gap-1">
                      <span
                        className={`h-1.5 w-full rounded-full ${
                          isComplete
                            ? "bg-[#16b37d]"
                            : isActive
                              ? "animate-pulse bg-[#16b37d]/70"
                              : "bg-[#09232d]/10"
                        }`}
                      />
                      <span
                        className={`text-[7px] font-semibold ${
                          isComplete || isActive ? "text-[#09232d]" : "text-[#09232d]/35"
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!showStepper && (
            <div className="mt-2 flex gap-1">
              <span className="h-1.5 w-8 animate-pulse rounded-full bg-[#16b37d]" />
              <span className="h-1.5 w-5 animate-pulse rounded-full bg-[#16b37d]/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-3 animate-pulse rounded-full bg-[#16b37d]/30 [animation-delay:300ms]" />
            </div>
          )}

          {showLongRunHint && (
            <p className="mt-2 text-[8px] leading-[11px] text-[#616263]">
              {state.intent === "generate_leads" || state.intent === "generate_more_leads"
                ? "Still working... multi source lead searches often take 1 to 3 minutes. We will not time out while results may still arrive."
                : "Still working... large scans can take 1 to 2 minutes."}
            </p>
          )}

          <p className="mt-2 text-[8px] leading-[11px] text-[#616263]">
            <span className="font-semibold text-[#09232d]/70">Tip: </span>
            {PROCESSING_TIPS[tipIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
