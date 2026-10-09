"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreference,
} from "@/lib/api/notifications";

const CATEGORY_LABELS: Record<string, string> = {
  all: "All notifications",
  task: "Tasks",
  tracking: "GPS tracking",
  project: "Projects",
  payroll: "Payroll",
  crm: "CRM & leads",
  auth: "Account & security",
  onboarding: "Onboarding",
  workforce: "Workforce",
  drive: "Company Drive",
  enterprise: "Enterprise",
};

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-dash-dark" : "bg-gray-300"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

export function NotificationsPanel() {
  const { companyId } = useSettingsAccess();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<NotificationPreference[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["notification-preferences", companyId],
    queryFn: async () => {
      const res = await getNotificationPreferences(token ?? "", companyId ?? undefined);
      return res.data.items;
    },
    enabled: !!token,
  });

  useEffect(() => {
    if (data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate notification drafts from server
      setDrafts(data);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      updateNotificationPreferences(
        {
          company_id: companyId ?? undefined,
          preferences: drafts.map((item) => ({
            category: item.category,
            is_enabled: item.is_enabled,
            in_app_enabled: item.in_app_enabled,
            push_enabled: item.push_enabled,
            email_enabled: item.email_enabled,
            muted_until: item.muted_until,
            quiet_hours: item.quiet_hours,
            digest_mode: item.digest_mode,
          })),
        },
        token ?? "",
      ),
    onSuccess: () => {
      toast.success("Notification preferences saved.");
      queryClient.invalidateQueries({ queryKey: ["notification-preferences", companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save preferences."),
  });

  function updateDraft(id: number, patch: Partial<NotificationPreference>) {
    setDrafts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  return (
    <SettingsSectionCard
      title="Notifications"
      description="Choose how you receive alerts for this workspace"
      scope="personal"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : drafts.length === 0 ? (
        <p className="text-[13px] text-gray-500">No notification categories configured yet.</p>
      ) : (
        <div className="space-y-4">
          {drafts.map((pref) => (
            <div
              key={pref.id}
              className="border border-gray-100 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[14px] font-bold text-dash-dark">
                    {CATEGORY_LABELS[pref.category] ?? pref.category}
                  </p>
                  <p className="text-[12px] text-gray-400">Master toggle for this category</p>
                </div>
                <Toggle
                  label={`Enable ${pref.category}`}
                  checked={pref.is_enabled}
                  onChange={(value) => updateDraft(pref.id, { is_enabled: value })}
                />
              </div>
              {pref.is_enabled && (
                <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t border-gray-50">
                  <label className="flex items-center justify-between gap-2 text-[12px] text-gray-600">
                    In app
                    <Toggle
                      label="In app"
                      checked={pref.in_app_enabled}
                      onChange={(value) => updateDraft(pref.id, { in_app_enabled: value })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-[12px] text-gray-600">
                    Email
                    <Toggle
                      label="Email"
                      checked={pref.email_enabled}
                      onChange={(value) => updateDraft(pref.id, { email_enabled: value })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-[12px] text-gray-600">
                    Push
                    <Toggle
                      label="Push"
                      checked={pref.push_enabled}
                      onChange={(value) => updateDraft(pref.id, { push_enabled: value })}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-5 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save preferences
          </button>
        </div>
      )}
    </SettingsSectionCard>
  );
}
