'use client';

import React from 'react';

// ── Row container ───────────────────────────────────────────────────────────
interface OpsTableRowProps {
  isSelected: boolean;
  onClick: () => void;
  avatar: string;
  avatarAlt: string;
  children: React.ReactNode;
}

export function OpsTableRow({ isSelected, onClick, avatar, avatarAlt, children }: OpsTableRowProps) {
  return (
    <div
      onClick={onClick}
      className={`flex border-[#E8E5E5] border-[0.8px] items-center gap-3 sm:gap-4 rounded-[30px] overflow-hidden cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'bg-[#09232D]' : 'bg-[#F8F9FA]'
      }`}
    >
      {/* Left accent bar */}
      <div className={`w-5 self-stretch shrink-0 rounded-l-[30px] ${isSelected ? '' : 'bg-[#83C4F8]'}`} />

      {/* Avatar */}
      <div className="w-14 h-14 mt-3.5 mb-3 rounded-full overflow-hidden shrink-0">
        <img key={avatar} src={avatar} className="w-full h-full object-cover" alt={avatarAlt} />
      </div>

      {children}
    </div>
  );
}

// ── Name column ─────────────────────────────────────────────────────────────
interface OpsTableNameColProps {
  name: string;
  subText: string;
  isSelected: boolean;
}

export function OpsTableNameCol({ name, subText, isSelected }: OpsTableNameColProps) {
  return (
    <div className="w-32 sm:w-44 shrink-0 min-w-0 py-3 pr-2">
      <p className={`text-[13px] sm:text-[14px] font-bold truncate ${isSelected ? 'text-white' : 'text-[#0B1215]'}`}>
        {name}
      </p>
      <p className={`text-[9px] sm:text-[10px] mt-0.5 truncate ${isSelected ? 'text-white/70' : 'text-[#616263]'}`}>
        {subText}
      </p>
    </div>
  );
}

// ── Data column ─────────────────────────────────────────────────────────────
// Pass width via className e.g. "hidden sm:block w-28 sm:w-32"
interface OpsTableColProps {
  label: string;
  value: string;
  isSelected: boolean;
  className?: string;
}

export function OpsTableCol({ label, value, isSelected, className = '' }: OpsTableColProps) {
  return (
    <div className={`shrink-0 min-w-0 py-3 pr-3 ${className}`}>
      <p className={`text-[13px] sm:text-[14px] font-bold ${isSelected ? 'text-white' : 'text-[#34373C]'}`}>
        {label}
      </p>
      <p className={`text-[10px] font-light truncate ${isSelected ? 'text-[#E8E8E8]' : 'text-[#616263]'}`}>
        {value}
      </p>
    </div>
  );
}

// ── Status cell ─────────────────────────────────────────────────────────────
interface OpsTableStatusProps {
  label: string;
  subText?: string;
  isSelected: boolean;
  badgeClass: string;
}

export function OpsTableStatus({ label, subText, isSelected, badgeClass }: OpsTableStatusProps) {
  return (
    <div className="shrink-0 py-3 ml-auto pr-4 sm:pr-5 text-right">
      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap ${badgeClass}`}>
        {label}
      </span>
      {subText && (
        <p className={`text-[10px] mt-1 ${isSelected ? 'text-white/50' : 'text-[#616263]'}`}>
          {subText}
        </p>
      )}
    </div>
  );
}

// ── Table container ─────────────────────────────────────────────────────────
export function OpsTableContainer({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-[30px] pt-5 px-6 sm:px-10 pb-6 flex-1 min-w-0 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026] ${className}`}>
      {children}
    </div>
  );
}
