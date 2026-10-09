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
  createUserCalendarConnectUrl,
  createUserCalendarReconnectUrl,
  disconnectUserCalendarIntegration,
  getUserCalendarIntegrationStatus,
} from "@/lib/api/calendar-integration";

export function CalendarUserPanel() {
  const { companyId } = useSettingsAccess();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["user-calendar-status", companyId],
    queryFn: async () => {
      const res = await getUserCalendarIntegrationStatus(
        { company_id: companyId ?? undefined },
        token ?? "",
      );
      return res.data;
    },
    enabled: !!token && !!companyId,
  });

  const refreshStatus = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["user-calendar-status", companyId] });
  }, [queryClient, companyId]);

  useGoogleOAuthReturnToast(refreshStatus);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await createUserCalendarConnectUrl(
        { company_id: companyId! },
        token ?? "",
      );
      return res.data.authorization_url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message || "Failed to start Google Calendar connection."),
  });

  const reconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await createUserCalendarReconnectUrl(
        { company_id: companyId! },
        token ?? "",
      );
      return res.data.authorization_url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message || "Failed to reconnect Google Calendar."),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await disconnectUserCalendarIntegration({ company_id: companyId! }, token ?? "");
    },
    onSuccess: () => {
      toast.success("Google Calendar disconnected.");
      queryClient.invalidateQueries({ queryKey: ["user-calendar-status", companyId] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to disconnect."),
  });

  const connected = status?.connected && status?.status === "active";

  return (
    <SettingsSectionCard
      title="Calendar"
      description="Connect Google Calendar to schedule and sync meetings"
      scope="personal"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className={`flex items-start gap-3 p-4 rounded-xl border ${connected ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}
          >
            {connected ? (
              <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={18} />
            ) : (
              <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            )}
            <div>
              <p className="text-[14px] font-bold text-dash-dark">
                {connected ? "Google Calendar connected" : "Google Calendar not connected"}
              </p>
              {connected && status?.connected_google_email && (
                <p className="text-[12px] text-gray-600 mt-0.5">{status.connected_google_email}</p>
              )}
              {!connected && (
                <p className="text-[12px] text-gray-600 mt-0.5">
                  Connect Google Calendar to schedule meetings. For CRM email, use Email Accounts.
                </p>
              )}
              {status?.requires_reauthentication && (
                <p className="text-[12px] text-amber-700 mt-1">
                  Your calendar connection needs to be refreshed.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!connected && (
              <button
                type="button"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold disabled:opacity-50"
              >
                Connect Google Calendar
              </button>
            )}
            {connected && status?.requires_reauthentication && (
              <button
                type="button"
                onClick={() => reconnectMutation.mutate()}
                disabled={reconnectMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold disabled:opacity-50"
              >
                <RefreshCw size={14} />
                Reconnect
              </button>
            )}
            {connected && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Disconnect Google Calendar from Factory 23?")) {
                    disconnectMutation.mutate();
                  }
                }}
                disabled={disconnectMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-[13px] font-semibold disabled:opacity-50"
              >
                <Unplug size={14} />
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsSectionCard>
  );
}
