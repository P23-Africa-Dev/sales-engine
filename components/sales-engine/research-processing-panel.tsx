"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Globe2, Link2, Search } from "lucide-react";
import type { ProcessingState } from "@/hooks/use-sales-engine-chat";
import {
  RESEARCH_PIPELINE_STEPS,
  RESEARCH_TIPS,
} from "@/lib/sales-engine-processing-labels";

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

const SOURCE_PLACEHOLDERS = [
  { domain: "news & market reports", width: "72%" },
  { domain: "industry blogs", width: "58%" },
  { domain: "event calendars", width: "64%" },
] as const;

export function ResearchProcessingPanel({
  state,
  onDetachToBackground,
}: {
  state: ProcessingState;
  onDetachToBackground?: () => void;
}) {
  const [tipIndex, setTipIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [activeSource, setActiveSource] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % RESEARCH_TIPS.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSource((current) => (current + 1) % SOURCE_PLACEHOLDERS.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedMs = now - state.startedAt;
  const showElapsed = elapsedMs >= 8_000;
  const showLongRunHint = elapsedMs >= 25_000;
  // Backend still reports a 4-step progress; collapse into Question → Sources → Brief.
  const stepIndex =
    state.stepIndex <= 0 ? 0 : state.stepIndex === 1 ? 1 : Math.min(2, RESEARCH_PIPELINE_STEPS.length - 1);
  const stepLabels = RESEARCH_PIPELINE_STEPS;

  const phaseHint = useMemo(() => {
    if (stepIndex <= 0) return "Framing the question against your ICP";
    if (stepIndex === 1) return "Scanning the open web for relevant pages";
    return "Drafting a cited research brief";
  }, [stepIndex]);

  return (
    <div className="max-w-[520px] overflow-hidden rounded-[20px] border border-[#c860d2]/70 bg-[linear-gradient(180deg,#fef8ff_0%,#fae2fa_100%)] text-[#09232d] shadow-[0_10px_28px_rgba(9,35,45,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#c860d2]/60 bg-[#f0bbf7]/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-[#c860d2] text-[#09232d]">
            <BookOpen size={13} />
          </span>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6e1878]">
              Quick Research
            </p>
            <p className="text-[8px] font-medium text-[#616263]">
              Gathering public sources for a cited brief
            </p>
          </div>
        </div>
        {showElapsed && (
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[8px] font-semibold text-[#616263]">
            {formatElapsed(elapsedMs)}
          </span>
        )}
      </div>

      <div className="px-4 py-3.5">
        {onDetachToBackground && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[8px] font-medium text-[#616263]">Usually ready in under a minute.</span>
            <div className="flex flex-wrap gap-2">
              <span className="flex h-7 items-center rounded-[10px] border border-[#c860d2]/70 bg-white px-2.5 text-[8px] font-semibold text-[#09232d]">
                Stay on page
              </span>
              <button
                type="button"
                onClick={onDetachToBackground}
                className="flex h-7 items-center rounded-[10px] border border-[#c860d2]/70 bg-white px-2.5 text-[8px] font-semibold text-[#09232d] transition hover:bg-[#c860d2]/30"
              >
                Continue in background
              </button>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-[#09232d] text-white">
            <Search size={15} className="animate-pulse" />
            <span className="absolute inset-[-5px] rounded-full border border-[#a630b5]/60 animate-ping" />
          </div>

          <div className="min-w-0 flex-1">
            <p
              key={state.label}
              className="animate-in fade-in slide-in-from-bottom-1 text-[12px] font-semibold leading-[16px] duration-300"
            >
              {state.label}
            </p>
            <p className="mt-1 text-[9px] font-medium text-[#6e1878]">{phaseHint}</p>

            {state.secondaryLabel && (
              <p className="mt-1 text-[9px] font-medium text-[#16b37d]">{state.secondaryLabel}</p>
            )}
          </div>
        </div>

        <div className="mt-3.5">
          <p className="mb-1.5 text-[8px] font-medium text-[#616263]">
            Phase {stepIndex + 1} of {stepLabels.length}: {stepLabels[stepIndex]}
          </p>
          <div className="flex items-center gap-1.5">
            {stepLabels.map((step, index) => {
              const isComplete = index < stepIndex;
              const isActive = index === stepIndex;

              return (
                <div key={step} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={`h-1.5 w-full rounded-full ${
                      isComplete
                        ? "bg-[#a630b5]"
                        : isActive
                          ? "animate-pulse bg-[#a630b5]/75"
                          : "bg-[#c860d2]/40"
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

        <div className="mt-3.5 space-y-1.5 rounded-[14px] border border-[#c860d2]/60 bg-white/80 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.06em] text-[#6e1878]">
            <Globe2 size={11} />
            Live source scan
          </div>
          {SOURCE_PLACEHOLDERS.map((placeholder, index) => {
            const isLive = index === activeSource || index < activeSource;
            return (
              <div
                key={placeholder.domain}
                className={`flex items-center gap-2 rounded-[10px] px-2 py-1.5 transition ${
                  isLive ? "bg-[#f0bbf7]/70" : "bg-transparent"
                }`}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full ${
                    isLive ? "bg-[#c860d2] text-[#09232d]" : "bg-[#f8eefa] text-[#09232d]/35"
                  }`}
                >
                  <Link2 size={10} />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={`h-1.5 rounded-full ${
                      isLive ? "bg-[#a630b5]/75" : "bg-[#c860d2]/40"
                    }`}
                    style={{ width: placeholder.width }}
                  />
                  <p
                    className={`mt-1 truncate text-[8px] ${
                      isLive ? "font-medium text-[#09232d]" : "text-[#09232d]/40"
                    }`}
                  >
                    {isLive ? `Checking ${placeholder.domain}…` : placeholder.domain}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {showLongRunHint && (
          <p className="mt-2.5 text-[8px] leading-[11px] text-[#616263]">
            Still scanning. Denser topics can take a little longer while sources are cross checked.
          </p>
        )}

        <p className="mt-2.5 text-[8px] leading-[11px] text-[#616263]">
          <span className="font-semibold text-[#6e1878]">Research tip: </span>
          {RESEARCH_TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}
