"use client";

import type { ReactNode } from "react";
import { Clock, Mail, MapPin, Phone, X } from "lucide-react";
import type { SavedLocation } from "@/lib/api/saved-locations";
import { getSavedLocationLabel, getSavedLocationType } from "@/lib/map/location-types";
import { SavedLocationTypeIcon } from "@/components/map/SavedLocationTypeIcon";

export type SavedLocationInfoCardProps = {
  location: SavedLocation;
  onClose: () => void;
  moveMode?: boolean;
  moveHint?: string | null;
  footer?: ReactNode;
};

export function SavedLocationInfoCard({
  location,
  onClose,
  moveMode = false,
  moveHint = null,
  footer,
}: SavedLocationInfoCardProps) {
  const typeOption = getSavedLocationType(location.type);
  const typeLabel = getSavedLocationLabel(location.type);

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 md:left-10 md:translate-x-0 z-50 w-[min(92vw,380px)] rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shrink-0 shadow-sm"
              style={{ backgroundColor: typeOption.color }}
            >
              <SavedLocationTypeIcon type={location.type} size={20} className="text-white" />
            </span>
            <div className="min-w-0">
              <h4 className="text-[16px] font-bold text-slate-900 leading-tight">{location.name}</h4>
              <p className="text-[12px] font-semibold mt-0.5" style={{ color: typeOption.color }}>
                {typeLabel}
              </p>
              {location.linked_to_crm && (
                <p className="text-[10px] font-semibold text-[#094B5C] mt-1">Also in CRM lead bank</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 shrink-0"
            aria-label="Close location details"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 text-[13px] text-slate-700">
        {location.address && (
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{location.address}</p>
          </div>
        )}

        {location.description && (
          <p className="text-[12px] text-slate-500 bg-slate-50 rounded-2xl px-3.5 py-3 leading-relaxed">
            {location.description}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {location.contact_number && (
            <a
              href={`tel:${location.contact_number}`}
              className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 hover:bg-slate-100 transition-colors"
            >
              <Phone size={14} className="text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-800 truncate">{location.contact_number}</span>
            </a>
          )}
          {location.email && (
            <a
              href={`mailto:${location.email}`}
              className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 hover:bg-slate-100 transition-colors"
            >
              <Mail size={14} className="text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-800 truncate">{location.email}</span>
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
          <Clock size={12} />
          <span>
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            {location.created_by?.name ? ` · Added by ${location.created_by.name}` : ""}
            {location.created_at
              ? ` · ${new Date(location.created_at).toLocaleDateString()}`
              : ""}
          </span>
        </div>

        {moveMode && (
          <p className="text-[11px] font-semibold text-cyan-600">
            {moveHint ?? "Drag the highlighted pin to move, then release to save."}
          </p>
        )}
      </div>

      {footer && <div className="border-t border-slate-100">{footer}</div>}
    </div>
  );
}
