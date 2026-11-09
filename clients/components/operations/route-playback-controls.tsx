"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

type RoutePlaybackControlsProps = {
  pointCount: number;
  /** 0..pointCount-1 */
  index: number;
  onIndexChange: (index: number) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Simple play/pause + scrubber for animating along a route polyline.
 * Advances ~8 points/sec while playing.
 */
export function RoutePlaybackControls({
  pointCount,
  index,
  onIndexChange,
  disabled = false,
  className = "",
}: RoutePlaybackControlsProps) {
  const [playing, setPlaying] = useState(false);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const isPlayable = !disabled && pointCount >= 2;
  const isPlaying = playing && isPlayable;

  const maxIndex = Math.max(0, pointCount - 1);
  const progress = maxIndex <= 0 ? 0 : index / maxIndex;

  useEffect(() => {
    if (!isPlaying || maxIndex <= 0) return;

    const id = window.setInterval(() => {
      const next = indexRef.current + 1;
      if (next > maxIndex) {
        setPlaying(false);
        onIndexChange(maxIndex);
        return;
      }
      onIndexChange(next);
    }, 120);

    return () => window.clearInterval(id);
  }, [isPlaying, maxIndex, onIndexChange]);

  const label = useMemo(() => {
    if (pointCount < 2) return "No route points";
    return `${index + 1} / ${pointCount}`;
  }, [index, pointCount]);

  if (pointCount < 2) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl bg-[#F8F9FA] border border-gray-100 px-3 py-2 ${className}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (index >= maxIndex) onIndexChange(0);
          setPlaying((p) => !p);
        }}
        className="w-8 h-8 rounded-full bg-[#0B1215] text-white flex items-center justify-center disabled:opacity-40 shrink-0"
        aria-label={isPlaying ? "Pause playback" : "Play route"}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={maxIndex}
        value={index}
        disabled={disabled}
        onChange={(e) => {
          setPlaying(false);
          onIndexChange(Number(e.target.value));
        }}
        className="flex-1 accent-[#2F5E71] h-1.5 cursor-pointer"
        aria-label="Scrub route"
      />
      <span className="text-[10px] font-bold text-gray-500 tabular-nums shrink-0 w-16 text-right">
        {label}
      </span>
      <span className="sr-only">{Math.round(progress * 100)}% along route</span>
    </div>
  );
}
