"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Loader2, Users } from "lucide-react";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getProfile } from "@/lib/api/profile";

export function OrgProfilePanel() {
  const { basePath, isManagement } = useSettingsAccess();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  const { data, isLoading } = useQuery({
    queryKey: ["org-profile"],
    queryFn: async () => {
      const res = await getProfile(token ?? "");
      return res.data;
    },
    enabled: !!token,
  });

  const canEdit = data?.permissions.can_edit_country || data?.permissions.can_edit_company;

  return (
    <SettingsSectionCard
      title="Organization"
      description="Company profile and workspace details"
      scope="organization"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-100">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-dash-dark" />
            </div>
            <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Company</p>
                <p className="text-[14px] font-semibold text-dash-dark mt-1">
                  {data?.organization.company.name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Country</p>
                <p className="text-[14px] text-gray-700 mt-1">
                  {data?.organization.company.country ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Team size</p>
                <p className="text-[14px] text-gray-700 mt-1">
                  {data?.organization.company.team_size ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Use case</p>
                <p className="text-[14px] text-gray-700 mt-1 capitalize">
                  {data?.organization.company.purpose?.replace(/_/g, " ") ?? "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link
                href={`${basePath}/profile`}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold"
              >
                Edit in profile
                <ChevronRight size={14} />
              </Link>
            )}
            {isManagement && (
              <Link
                href={`${basePath}/operations/agents`}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-[13px] font-semibold"
              >
                <Users size={14} />
                Manage team
              </Link>
            )}
          </div>
        </div>
      )}
    </SettingsSectionCard>
  );
}
