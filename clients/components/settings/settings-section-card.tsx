"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/sample";

export function SettingsSectionCard({
  title,
  description,
  scope,
  children,
  className,
}: {
  title: string;
  description?: string;
  scope?: "personal" | "organization" | "billing";
  children: ReactNode;
  className?: string;
}) {
  const scopeLabel =
    scope === "personal"
      ? "Personal"
      : scope === "organization"
        ? "Organization"
        : scope === "billing"
          ? "Billing"
          : null;

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden",
        className,
      )}
    >
      <div className="px-6 py-4 border-b border-black/5 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800 tracking-wide uppercase">
            {title}
          </h2>
          {scopeLabel && (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {scopeLabel}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[13px] text-gray-500">{description}</p>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}
