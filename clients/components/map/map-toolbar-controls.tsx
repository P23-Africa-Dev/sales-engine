'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Users } from 'lucide-react';

export const MapToolbarTarget = createContext<HTMLDivElement | null | undefined>(undefined);
export const mapControlClass = 'flex h-10 shrink-0 whitespace-nowrap items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-dash-dark shadow-md hover:bg-slate-50 aria-pressed:bg-[#dff9f3] sm:px-4';

export function MapToolbarControls({ children }: { children: ReactNode }) {
  const target = useContext(MapToolbarTarget);
  const controls = <div className="flex w-max items-center gap-2 px-1">{children}</div>;
  if (target === null) return null;
  if (target) return createPortal(controls, target);
  return <div className="absolute left-4 top-4 z-40 md:left-8 md:top-6">{controls}</div>;
}

export function MapActivityButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return <button type="button" className={mapControlClass} aria-label="Activity" aria-pressed={active} onClick={onClick}>
    <Users size={16} /><span>Activity</span>
  </button>;
}
