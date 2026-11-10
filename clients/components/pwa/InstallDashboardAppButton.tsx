"use client";

import { Smartphone } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export default function InstallDashboardAppButton() {
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  if (isInstalled || !canInstall) return null;

  return (
    <button
      onClick={() => {
        void promptInstall();
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#75ADAF]/50 bg-[#75ADAF]/10 px-3 py-1.5 text-[11px] font-semibold text-[#75ADAF] transition hover:bg-[#75ADAF]/20"
      title="Install dashboard app"
    >
      <Smartphone size={14} />
      Install App
    </button>
  );
}

