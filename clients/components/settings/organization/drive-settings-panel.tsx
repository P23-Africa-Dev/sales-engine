"use client";

import Link from "next/link";
import { HardDrive, Loader2 } from "lucide-react";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { useDriveUsage } from "@/hooks/use-drive";
import { formatDriveBytes } from "@/lib/api/drive";

export function DriveSettingsPanel() {
  const { companyId, basePath, isManagement } = useSettingsAccess();
  const { data: usage, isLoading } = useDriveUsage(companyId ?? undefined);

  return (
    <SettingsSectionCard
      title="Company Drive"
      description="Shared storage for documents, reports, and team files."
    >
      <div className="space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-gray-300" size={22} />
          </div>
        ) : usage ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-bold text-dash-dark">Storage used</span>
              <span className="text-[12px] text-gray-500">
                {formatDriveBytes(usage.used_bytes)} / {formatDriveBytes(usage.limit_bytes)}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-dash-dark"
                style={{ width: `${Math.min(100, usage.percent)}%` }}
              />
            </div>
            <p className="text-[12px] text-gray-400 mt-2">
              {formatDriveBytes(usage.remaining_bytes)} remaining
              {isManagement ? " — quota follows your billing plan." : ""}
            </p>
          </div>
        ) : null}

        <Link
          href={`${basePath}/drive`}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-dash-dark text-white text-[13px] font-bold hover:opacity-90 transition-opacity"
        >
          <HardDrive size={16} />
          Open Company Drive
        </Link>

        {isManagement && (
          <p className="text-[12px] text-gray-400 leading-relaxed">
            Upload files from the drive page and share them with specific team members or everyone in your organization.
            ELY weekly reports are automatically archived in the ELY Reports folder.
          </p>
        )}
      </div>
    </SettingsSectionCard>
  );
}
