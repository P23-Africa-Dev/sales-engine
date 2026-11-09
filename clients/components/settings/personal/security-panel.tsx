"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getProfile } from "@/lib/api/profile";

export function SecurityPanel() {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  const { data, isLoading } = useQuery({
    queryKey: ["security-profile"],
    queryFn: async () => {
      const res = await getProfile(token ?? "");
      return res.data;
    },
    enabled: !!token,
  });

  return (
    <SettingsSectionCard
      title="Security"
      description="Account verification and access status"
      scope="personal"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-100">
            <ShieldCheck className="text-dash-dark shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-[14px] font-bold text-dash-dark">Email verification</p>
              <p className="text-[12px] text-gray-500">{data?.identity.email}</p>
            </div>
            {data?.account.email_verified ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-green-600">
                <CheckCircle2 size={14} />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-600">
                <XCircle size={14} />
                Unverified
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-100">
            <div className="flex-1">
              <p className="text-[14px] font-bold text-dash-dark">Account status</p>
              <p className="text-[12px] text-gray-500 capitalize">
                {data?.account.status ?? "—"}
              </p>
            </div>
            {data?.account.is_active ? (
              <span className="text-[12px] font-semibold text-green-600">Active</span>
            ) : (
              <span className="text-[12px] font-semibold text-red-600">Inactive</span>
            )}
          </div>
        </div>
      )}
    </SettingsSectionCard>
  );
}
