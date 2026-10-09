"use client";

import { EyeOff, LocateFixed } from "lucide-react";

type MapExploreControlsProps = {
  locating: boolean;
  mapMode: "2d" | "3d";
  onLocateMe: () => void;
  onMapModeChange: (mode: "2d" | "3d") => void;
  className?: string;
  showDimensionToggle?: boolean;
  showPinsToggle?: boolean;
  onTogglePins?: () => void;
  pinsToggleLabel?: string;
};

export function MapExploreControls({
  locating,
  mapMode,
  onLocateMe,
  onMapModeChange,
  className = "absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2",
  showDimensionToggle = true,
  showPinsToggle = false,
  onTogglePins,
  pinsToggleLabel = "Hide Pins",
}: MapExploreControlsProps) {
  return (
    <div className={className}>
      {showPinsToggle && onTogglePins && (
        <button
          type="button"
          onClick={onTogglePins}
          title={pinsToggleLabel}
          className="h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 px-4 flex items-center gap-2 text-[12px] font-semibold text-dash-dark hover:bg-slate-50 active:scale-95 transition-all"
        >
          <EyeOff size={16} />
          {pinsToggleLabel}
        </button>
      )}

      <button
        type="button"
        onClick={onLocateMe}
        disabled={locating}
        title="Center on my location"
        className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-lg border border-slate-200 flex items-center justify-center text-dash-teal hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <LocateFixed size={18} className={locating ? "animate-pulse" : ""} />
      </button>

      {showDimensionToggle && (
        <div className="flex rounded-full overflow-hidden border border-slate-200 shadow-lg bg-white/95 backdrop-blur">
          <button
            type="button"
            onClick={() => onMapModeChange("2d")}
            className={`px-4 py-2 text-[12px] font-semibold transition-colors ${
              mapMode === "2d" ? "bg-[#0A192F] text-white" : "text-slate-500 hover:text-dash-dark"
            }`}
          >
            2D
          </button>
          <button
            type="button"
            onClick={() => onMapModeChange("3d")}
            className={`px-4 py-2 text-[12px] font-semibold transition-colors ${
              mapMode === "3d" ? "bg-[#0A192F] text-white" : "text-slate-500 hover:text-dash-dark"
            }`}
          >
            3D
          </button>
        </div>
      )}
    </div>
  );
}
