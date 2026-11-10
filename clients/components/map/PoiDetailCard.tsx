"use client";

import { Clock, MapPin, Phone, X } from "lucide-react";
import type { PoiResult } from "@/lib/map/overpass-search";

type Props = {
  poi: PoiResult | null;
  onClose: () => void;
  onCenter?: (poi: PoiResult) => void;
  className?: string;
};

export function PoiDetailCard({ poi, onClose, onCenter, className }: Props) {
  if (!poi) return null;

  return (
    <div
      className={
        className ??
        "absolute bottom-24 left-4 z-30 w-[min(92vw,320px)] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-2xl overflow-hidden"
      }
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center mt-0.5"
          style={{ backgroundColor: `${poi.categoryColor}1a` }}
        >
          <div
            className="w-3.5 h-3.5 rounded-full"
            style={{ backgroundColor: poi.categoryColor }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-dash-dark leading-tight truncate">{poi.name}</p>
          <p className="text-[11px] font-semibold mt-0.5" style={{ color: poi.categoryColor }}>
            {poi.categoryLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0"
          aria-label="Close place details"
        >
          <X size={14} className="text-slate-500" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-2">
        {poi.address && (
          <div className="flex items-start gap-2 text-[12px] text-slate-600">
            <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{poi.address}</span>
          </div>
        )}
        {poi.phone && (
          <div className="flex items-center gap-2 text-[12px] text-slate-600">
            <Phone size={14} className="text-slate-400 shrink-0" />
            <span>{poi.phone}</span>
          </div>
        )}
        {poi.openingHours && (
          <div className="flex items-start gap-2 text-[12px] text-slate-600">
            <Clock size={14} className="text-slate-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{poi.openingHours}</span>
          </div>
        )}
      </div>

      {onCenter && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => onCenter(poi)}
            className="w-full rounded-xl bg-[#0A192F] text-white text-[12px] font-bold py-2.5 hover:opacity-90 transition-opacity"
          >
            Center on map
          </button>
        </div>
      )}
    </div>
  );
}
