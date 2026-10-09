"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Navigation } from "lucide-react";
import { useTrackingStore } from "@/store/tracking";
import { useActiveTracking } from "./active-tracking-provider";

function useElapsedTime(startedAt: Date | null): string {
  const [elapsed, setElapsed] = useState("0:00");

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setElapsed(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

export function ActiveTrackingBar() {
  const router = useRouter();
  const { activeTaskId, stopTracking, isTracking } = useActiveTracking();
  const liveTasks = useTrackingStore((s) => s.liveTasks);
  const [confirmStop, setConfirmStop] = useState(false);
  const task = activeTaskId ? liveTasks[activeTaskId] : null;
  const startedAt = isTracking && task?.trackingStartedAt ? new Date(task.trackingStartedAt) : null;
  const elapsed = useElapsedTime(startedAt);

  if (!isTracking || !activeTaskId) return null;

  const taskTitle = task?.taskTitle ?? `Task #${activeTaskId}`;

  const handleStop = () => {
    if (!confirmStop) {
      setConfirmStop(true);
      setTimeout(() => setConfirmStop(false), 3000);
      return;
    }
    stopTracking();
  };

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 px-3 pb-1 pointer-events-none">
      <div
        role="button"
        tabIndex={0}
        className="mx-auto max-w-lg bg-dash-dark text-white rounded-2xl shadow-2xl flex items-center gap-3 px-4 py-3 pointer-events-auto cursor-pointer"
        onClick={() => router.push(`/agent/tasks/${activeTaskId}/tracking`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(`/agent/tasks/${activeTaskId}/tracking`);
          }
        }}
      >
        {/* Pulsing dot */}
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>

        <Navigation size={14} className="text-dash-teal shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold truncate leading-tight">{taskTitle}</p>
          <p className="text-[10px] text-gray-400 leading-tight">Tracking active · {elapsed}</p>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleStop();
          }}
          className={`p-1.5 rounded-xl transition-colors shrink-0 ${confirmStop
              ? "bg-red-500 text-white"
              : "bg-white/10 text-gray-300 hover:bg-white/20"
            }`}
          title={confirmStop ? "Tap again to stop tracking" : "Stop tracking"}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
