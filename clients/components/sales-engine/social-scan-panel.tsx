"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { SalesEngineIcpContext } from "@/lib/sales-engine-processing-labels";
import {
  formatSourceLabel,
  labelsForSocialScanStage,
  mapSocialListeningStage,
  nextScanLabelIndex,
  signalsFoundLabel,
  SOCIAL_LISTENING_TIPS,
  SOCIAL_SCAN_LABEL_INTERVAL_MS,
  SOCIAL_SCAN_PIPELINE_STEPS,
} from "@/lib/social-listening-processing-labels";

const LATE_LABEL_AFTER_MS = 6_000;

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

export type SocialScanPanelProps = {
  stages?: string[] | null;
  signalsFound?: number;
  enabledSources?: string[];
  startedAt?: string | null;
  icpContext?: SalesEngineIcpContext;
};

export function SocialScanPanel({
  stages,
  signalsFound = 0,
  enabledSources = [],
  startedAt,
  icpContext,
}: SocialScanPanelProps) {
  const stageInfo = useMemo(
    () => mapSocialListeningStage(stages, icpContext),
    [stages, icpContext]
  );

  const labelSequence = useMemo(
    () => labelsForSocialScanStage(stageInfo.stageKey, icpContext, enabledSources),
    [stageInfo.stageKey, icpContext, enabledSources]
  );

  const [labelIndex, setLabelIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lastStageChangeRef = useRef(0);
  const prevStageKeyRef = useRef(stageInfo.stageKey);

  useEffect(() => {
    if (lastStageChangeRef.current === 0) {
      lastStageChangeRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (prevStageKeyRef.current !== stageInfo.stageKey) {
      prevStageKeyRef.current = stageInfo.stageKey;
      lastStageChangeRef.current = Date.now();
      setLabelIndex(0);
    }
  }, [stageInfo.stageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % SOCIAL_LISTENING_TIPS.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLabelIndex((current) => {
        const staleMs = Date.now() - lastStageChangeRef.current;
        if (staleMs >= LATE_LABEL_AFTER_MS) {
          const lateStart = labelSequence.length - 4;
          const lateIndex = lateStart + (Math.floor(staleMs / SOCIAL_SCAN_LABEL_INTERVAL_MS) % 4);
          return Math.min(Math.max(lateStart, 0), lateIndex % labelSequence.length);
        }
        return nextScanLabelIndex(labelSequence, current);
      });
    }, SOCIAL_SCAN_LABEL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [labelSequence]);

  const startedAtMs = startedAt ? new Date(startedAt).getTime() : now;
  const elapsedMs = now - startedAtMs;
  const showElapsed = elapsedMs >= 15_000;
  const showLongRunHint = elapsedMs >= 30_000;

  const primaryLabel = labelSequence[labelIndex] ?? stageInfo.label;
  const secondaryLabel = signalsFoundLabel(signalsFound);

  return (
    <div className="mx-2 mb-2 rounded-[16px] bg-[#f8f8f8] px-4 py-3 text-[#09232d] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.04)]">
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#09232d] text-white">
          <Sparkles size={12} className="animate-pulse" />
          <span className="absolute inset-[-3px] rounded-full border border-[#16b37d]/40 animate-ping" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#09232d]/8 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#09232d]/70">
              Social Scan
            </span>
            {enabledSources.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {enabledSources.map((source) => (
                  <span
                    key={source}
                    className="rounded-full bg-white px-2 py-0.5 text-[7px] font-semibold text-[#616263] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.08)]"
                  >
                    {formatSourceLabel(source)}
                  </span>
                ))}
              </div>
            )}
            {showElapsed && (
              <span className="text-[8px] font-medium text-[#616263]">{formatElapsed(elapsedMs)}</span>
            )}
          </div>

          <p
            key={primaryLabel}
            className="animate-in fade-in slide-in-from-bottom-1 mt-1 text-[11px] font-semibold duration-300"
          >
            {primaryLabel}
          </p>

          {secondaryLabel && (
            <p className="mt-0.5 text-[9px] font-medium text-[#16b37d]">{secondaryLabel}</p>
          )}

          <div className="mt-2">
            <p className="mb-1.5 text-[8px] font-medium text-[#616263]">
              Step {stageInfo.stepIndex + 1} of {stageInfo.totalSteps}:{" "}
              {SOCIAL_SCAN_PIPELINE_STEPS[stageInfo.stepIndex]}
            </p>
            <div className="flex items-center gap-1">
              {SOCIAL_SCAN_PIPELINE_STEPS.map((step, index) => {
                const isComplete = index < stageInfo.stepIndex;
                const isActive = index === stageInfo.stepIndex;

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

          {showLongRunHint && (
            <p className="mt-2 text-[8px] leading-[11px] text-[#616263]">
              Still working. Large scans can take 1 to 2 minutes.
            </p>
          )}

          <p className="mt-2 text-[8px] leading-[11px] text-[#616263]">
            <span className="font-semibold text-[#09232d]/70">Tip: </span>
            {SOCIAL_LISTENING_TIPS[tipIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
