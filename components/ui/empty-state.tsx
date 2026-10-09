"use client";

import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center w-full py-16 px-6 text-center ${className}`}
    >
      {/* Icon Container with subtle animation and glassmorphism */}
      <div className="relative mb-6 group">
        <div className="absolute inset-0 bg-[#09232D]/5 rounded-full blur-xl transform group-hover:scale-110 transition-transform duration-700" />
        <div className="relative flex items-center justify-center w-20 h-20 bg-white border border-gray-100 rounded-3xl shadow-sm rotate-3 group-hover:rotate-0 transition-all duration-500">
          <Icon size={32} className="text-[#09232D]/60" strokeWidth={1.5} />
        </div>
        {/* Floating decorative elements */}
        <div className="absolute -top-2 -right-2 w-4 h-4 bg-green-400 rounded-full opacity-0 group-hover:opacity-100 animate-bounce transition-opacity duration-300 delay-100 shadow-sm" />
        <div className="absolute -bottom-1 -left-3 w-3 h-3 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 animate-pulse transition-opacity duration-300 shadow-sm" />
      </div>

      {/* Content */}
      <h3 className="text-[17px] font-bold text-[#09232D] mb-2">{title}</h3>
      <p className="text-[13px] text-gray-400 max-w-[280px] leading-relaxed mb-6">
        {description}
      </p>

      {/* Action Button */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-2.5 bg-white border border-gray-200 text-[#09232D] rounded-full text-[13px] font-bold hover:bg-gray-50 hover:shadow-sm active:scale-[0.98] transition-all"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
