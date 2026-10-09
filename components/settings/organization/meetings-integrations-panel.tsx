"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useGoogleOAuthReturnToast } from "@/hooks/use-google-oauth-return-toast";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
  createCalendarConnectUrl,
  createCalendarReconnectUrl,
  disconnectCalendarIntegration,
  getCalendarIntegrationStatus,
} from "@/lib/api/calendar-integration";
import { getCompanySettings, updateCompanySettings } from "@/lib/api/company-settings";

const REMINDER_OPTIONS = [5, 10, 15, 30, 60];

export function MeetingsIntegrationsPanel() {
  const { companyId } = useSettingsAccess();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const queryClient = useQueryClient();

  const { data: status, isLoading: loadingCalendar } = useQuery({
    queryKey: ["org-calendar-status", companyId],
    queryFn: async () => {
      const res = await getCalendarIntegrationStatus(
        { company_id: companyId ?? undefined },
        token ?? "",
      );
      return res.data;
    },
    enabled: !!token && !!companyId,
  });

  const refreshStatus = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["org-calendar-status", companyId] });
  }, [queryClient, companyId]);

  useGoogleOAuthReturnToast(refreshStatus);

  const { data: companySettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["company-settings", companyId],
    queryFn: async () => {
      const res = await getCompanySettings(companyId ?? undefined);
      return res.data;
    },
    enabled: !!token && !!companyId,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await createCalendarConnectUrl({ company_id: companyId! }, token ?? "");
      return res.data.authorization_url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message || "Failed to connect Google Calendar."),
  });

  const reconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await createCalendarReconnectUrl({ company_id: companyId! }, token ?? "");
      return res.data.authorization_url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message || "Failed to reconnect."),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await disconnectCalendarIntegration({ company_id: companyId! }, token ?? "");
    },
    onSuccess: () => {
      toast.success("Organization Google Calendar disconnected.");
      queryClient.invalidateQueries({ queryKey: ["org-calendar-status", companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to disconnect."),
  });

  const saveDefaultsMutation = useMutation({
    mutationFn: async (minutes: number) =>
      updateCompanySettings({
        company_id: companyId!,
        meeting_defaults: { default_reminder_minutes: minutes },
      }),
    onSuccess: () => {
      toast.success("Meeting defaults saved.");
      queryClient.invalidateQueries({ queryKey: ["company-settings", companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save defaults."),
  });

  const connected = status?.connected && status?.status === "active";
  const canEdit = companySettings?.can_edit ?? false;

  return (
    <SettingsSectionCard
      title="Meetings & Integrations"
      description="Organization Google Calendar and meeting defaults. CRM email uses Email Accounts."
      scope="organization"
    >
      {loadingCalendar || loadingSettings ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-6">
          <div
            className={`flex items-start gap-3 p-4 rounded-xl border ${connected ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}
          >
            {connected ? (
              <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={18} />
            ) : (
              <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            )}
            <div className="flex-1">
              <p className="text-[14px] font-bold text-dash-dark">
                {connected ? "Google Calendar connected" : "Google Calendar not connected"}
              </p>
              {status?.organizer_email && (
                <p className="text-[12px] text-gray-600 mt-0.5">{status.organizer_email}</p>
              )}
              {!connected && (
                <p className="text-[12px] text-gray-500 mt-1">
                  Connect the org calendar for shared meeting scheduling.
                </p>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {!connected && (
                <button
                  type="button"
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                  className="px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold"
                >
                  Connect organization Calendar
                </button>
              )}
              {connected && status?.requires_reauthentication && (
                <button
                  type="button"
                  onClick={() => reconnectMutation.mutate()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold"
                >
                  <RefreshCw size={14} />
                  Reconnect
                </button>
              )}
              {connected && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Disconnect organization Google integration?")) {
                      disconnectMutation.mutate();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-[13px] font-semibold"
                >
                  <Unplug size={14} />
                  Disconnect
                </button>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Default meeting reminder
            </label>
            <select
              value={companySettings?.meeting_defaults.default_reminder_minutes ?? 15}
              disabled={!canEdit || saveDefaultsMutation.isPending}
              onChange={(e) => saveDefaultsMutation.mutate(Number(e.target.value))}
              className="w-full max-w-xs border border-gray-200 rounded-xl px-4 py-3 text-[14px] disabled:opacity-60"
            >
              {REMINDER_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes before
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </SettingsSectionCard>
  );
}
