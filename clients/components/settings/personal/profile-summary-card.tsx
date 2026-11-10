"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getProfile } from "@/lib/api/profile";
import { resolveAvatarSrc } from "@/lib/avatar";

export function ProfileSummaryCard() {
  const { basePath } = useSettingsAccess();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  const { data, isLoading } = useQuery({
    queryKey: ["profile-summary"],
    queryFn: async () => {
      const res = await getProfile(token ?? "");
      return res.data;
    },
    enabled: !!token,
  });

  return (
    <SettingsSectionCard
      title="Profile"
      description="Your personal identity and contact information"
      scope="personal"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-200 shrink-0">
            <Image
              src={resolveAvatarSrc(data?.identity.avatar_url)}
              alt="Avatar"
              width={64}
              height={64}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-dash-dark truncate">
              {data?.identity.full_name ?? "—"}
            </p>
            <p className="text-[13px] text-gray-500 truncate">
              {data?.identity.email ?? "—"}
            </p>
            {data?.identity.phone_number && (
              <p className="text-[13px] text-gray-400 mt-0.5">
                {data.identity.phone_number}
              </p>
            )}
            <p className="text-[12px] text-gray-400 mt-1 capitalize">
              {data?.organization.role?.replace(/_/g, " ") ?? "—"}
            </p>
          </div>
          <Link
            href={`${basePath}/profile`}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold hover:opacity-90 transition-opacity shrink-0"
          >
            Manage profile
            <ChevronRight size={14} />
          </Link>
        </div>
      )}
    </SettingsSectionCard>
  );
}
