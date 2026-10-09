"use client";

import { WifiOff } from "lucide-react";
import { useEffect } from "react";
import { createOfflineReconnectHandler } from "@/lib/offline/offline-reconnect";

export function OfflinePageShell() {
  useEffect(() => {
    const reconnect = createOfflineReconnectHandler();
    reconnect.startListening();
    return () => reconnect.stopListening();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#12313D_0%,#0A1D25_55%)] px-6 py-10 text-center text-white">
      <div className="relative mb-5 h-22 w-22">
        <span className="absolute inset-0 rounded-full border border-amber-300/35 animate-[pulseRing_2.4s_ease-out_infinite]" />
        <span className="absolute inset-0 rounded-full border border-amber-300/35 animate-[pulseRing_2.4s_ease-out_infinite] [animation-delay:0.8s]" />
        <span className="absolute inset-0 rounded-full border border-amber-300/35 animate-[pulseRing_2.4s_ease-out_infinite] [animation-delay:1.6s]" />
        <div className="relative z-10 flex h-22 w-22 items-center justify-center rounded-full border border-amber-300/30 bg-amber-500/10 text-amber-200 animate-[floatIcon_2.8s_ease-in-out_infinite]">
          <WifiOff size={30} />
        </div>
      </div>

      <h1 className="text-xl font-semibold tracking-tight">This page isn’t available offline</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">
        You can keep working in pages you’ve already opened. Any actions you take are saved
        locally and synchronize automatically when connectivity returns.
      </p>

      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white/80">
        <span>Waiting for connection</span>
        <span className="inline-flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-[#75ADAF] animate-[bounceDot_1.2s_ease-in-out_infinite]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#75ADAF] animate-[bounceDot_1.2s_ease-in-out_infinite] [animation-delay:0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#75ADAF] animate-[bounceDot_1.2s_ease-in-out_infinite] [animation-delay:0.3s]" />
        </span>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 rounded-xl border border-[#75ADAF]/40 bg-[#75ADAF]/10 px-4 py-2 text-sm font-semibold text-[#75ADAF] transition hover:bg-[#75ADAF]/20 active:scale-[0.98]"
      >
        Try again
      </button>
    </div>
  );
}
