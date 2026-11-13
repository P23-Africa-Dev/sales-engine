"use client";

import { QueryClientContext } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { unstable_catchError, type ErrorInfo } from "next/error";
import { useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Error containment for the workspace.
 *
 * A display problem in one record or one panel must never replace the whole app with
 * an error page: the user's data and their running searches and scans are fine, only
 * that piece of screen could not be drawn. So:
 *
 * - `SafeItem` wraps one record in a list. If it can't be drawn it is left out and
 *   the rest of the list shows.
 * - `SafeSection` wraps a panel. If it can't be drawn it quietly refetches its data
 *   and tries again on its own, and only after that shows a calm note with a refresh
 *   button. The navigation and every other panel keep working.
 */

/** Automatic attempts before a section shows its note. */
export const SECTION_AUTO_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 3500];
/** A section that has been fine this long gets its automatic attempts back. */
const RETRY_MEMORY_MS = 60_000;

const sectionAttempts = new Map<string, { count: number; at: number }>();

function logContained(kind: "item" | "section", name: string, error: Error) {
  // Kept for support and debugging in the browser console; never shown to the user.
  console.error(`[workspace] contained a ${kind} error in "${name}"`, error);
}

/** Exported for tests. */
export function resetSafeBoundaryAttempts() {
  sectionAttempts.clear();
}

function takeAttempt(name: string): number {
  const now = Date.now();
  const previous = sectionAttempts.get(name);
  const count = previous && now - previous.at < RETRY_MEMORY_MS ? previous.count + 1 : 1;
  sectionAttempts.set(name, { count, at: now });
  return count;
}

function ItemFallback(props: { name: string }, { error }: ErrorInfo) {
  return <SkippedItem name={props.name} error={error} />;
}

function SkippedItem({ name, error }: { name: string; error: Error }) {
  useEffect(() => {
    logContained("item", name, error);
  }, [name, error]);

  return null;
}

const ItemBoundary = unstable_catchError(ItemFallback);

function RenderItem({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

/**
 * One record in a list. Pass the record's whole render as a function so that work done
 * before drawing it (scores, labels, formatting) is contained too.
 */
export function SafeItem({ name, children }: { name: string; children: () => ReactNode }) {
  return (
    <ItemBoundary name={name}>
      <RenderItem render={children} />
    </ItemBoundary>
  );
}

type SectionProps = {
  name: string;
  /** Short, lower-case, user-facing name such as "your signals" or "lead details". */
  label?: string;
  className?: string;
  /** For small panels: a one-line note instead of a card. */
  compact?: boolean;
};

function SectionFallback(props: SectionProps, { error, unstable_retry }: ErrorInfo) {
  return <SectionRecovery {...props} error={error} retry={unstable_retry} />;
}

function SectionRecovery({
  name,
  label,
  className,
  compact = false,
  error,
  retry,
}: SectionProps & { error: Error; retry: () => void }) {
  const queryClient = useContext(QueryClientContext);
  const [attempt] = useState(() => takeAttempt(name));
  const recovering = attempt <= SECTION_AUTO_RETRIES;

  useEffect(() => {
    logContained("section", name, error);
  }, [name, error]);

  useEffect(() => {
    if (!recovering) {
      return;
    }
    const timer = window.setTimeout(() => {
      void queryClient?.invalidateQueries({ refetchType: "active" });
      retry();
    }, RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);

    return () => window.clearTimeout(timer);
  }, [recovering, attempt, queryClient, retry]);

  const refreshNow = () => {
    sectionAttempts.delete(name);
    void queryClient?.invalidateQueries({ refetchType: "active" });
    retry();
  };

  const subject = label ?? "this section";

  if (recovering) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-2 rounded-[20px] bg-white px-4 py-3 text-[12px] text-[#616263] ${className ?? ""}`}
      >
        <Loader2 size={14} className="animate-spin text-[#09232d]" />
        Refreshing {subject}…
      </div>
    );
  }

  if (compact) {
    return (
      <div role="status" className={`flex items-center gap-2 px-2 py-2 text-[11px] text-[#616263] ${className ?? ""}`}>
        Taking a moment to load {subject}.
        <button type="button" onClick={refreshNow} className="font-medium text-[#09232d] underline underline-offset-2 cursor-pointer">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`flex flex-col items-start gap-2 rounded-[20px] bg-white px-5 py-4 text-[#09232d] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.06)] ${className ?? ""}`}
    >
      <p className="text-[13px] font-semibold">Taking a moment to load {subject}</p>
      <p className="text-[12px] leading-[17px] text-[#616263]">
        Your data is safe, and searches and scans keep running in the background. Refresh to show it again.
      </p>
      <button
        type="button"
        onClick={refreshNow}
        className="mt-1 flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[11px] font-medium text-[#34373c] transition-colors hover:bg-gray-100 cursor-pointer"
      >
        <RefreshCw size={12} className="text-[#09232d]" />
        Refresh
      </button>
    </div>
  );
}

/** A panel that recovers on its own when it can't be drawn. */
export const SafeSection = unstable_catchError(SectionFallback);

/**
 * For route `error.tsx` files: the page refreshes itself first, inside the app's
 * layout, so the navigation stays and the user is never taken to a blank error screen.
 */
export function PageRecovery({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-10">
      <SectionRecovery name="page" label="this page" error={error} retry={retry} />
    </div>
  );
}
