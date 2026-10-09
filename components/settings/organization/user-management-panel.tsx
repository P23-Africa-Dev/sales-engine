"use client";

import { useEffect, useState, startTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { getCompanySettings, updateCompanySettings } from "@/lib/api/company-settings";
import { useInternalUserAuditLogs } from "@/hooks/use-internal-user-lifecycle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function UserManagementPanel() {
  const { companyId, role } = useSettingsAccess();
  const queryClient = useQueryClient();
  const canManage = role === "owner" || role === "admin";

  const { data: settings, isLoading } = useQuery({
    queryKey: ["company-settings", companyId],
    queryFn: async () => {
      const res = await getCompanySettings(companyId ?? undefined);
      return res.data;
    },
    enabled: !!companyId && canManage,
  });

  const [suspendAgents, setSuspendAgents] = useState(false);
  const [deleteAgents, setDeleteAgents] = useState(false);

  useEffect(() => {
    if (settings?.user_management) {
      startTransition(() => {
        setSuspendAgents(Boolean(settings.user_management.supervisor_can_suspend_agents));
        setDeleteAgents(Boolean(settings.user_management.supervisor_can_delete_agents));
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (companyId == null) {
        throw new Error("No active company found.");
      }

      return updateCompanySettings({
        company_id: companyId,
        user_management: {
          supervisor_can_suspend_agents: suspendAgents,
          supervisor_can_delete_agents: deleteAgents,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings", companyId] });
      queryClient.invalidateQueries({ queryKey: ["internal-user-audit-logs"] });
      toast.success("User management settings saved.");
    },
    onError: () => toast.error("Unable to save user management settings."),
  });

  const { data: auditLogs, isLoading: auditLoading } = useInternalUserAuditLogs(
    companyId ?? undefined,
    1,
    20,
  );

  if (!canManage) {
    return (
      <SettingsSectionCard
        title="User Management"
        description="Only owners and admins can manage supervisor privileges and audit logs."
      >
        <p className="text-sm text-gray-500">You do not have permission to view this section.</p>
      </SettingsSectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsSectionCard
        title="Supervisor privileges"
        description="Grant supervisors permission to suspend or delete agents assigned to them."
      >
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={suspendAgents}
                onChange={(e) => setSuspendAgents(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-dash-dark">
                  Supervisors can suspend their agents
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Allows supervisors to suspend agents assigned to them for a set period or permanently.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteAgents}
                onChange={(e) => setDeleteAgents(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-dash-dark">
                  Supervisors can delete their agents
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Allows supervisors to remove agents assigned to them from the organization.
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || companyId == null}
              className="inline-flex items-center gap-2 rounded-xl bg-dash-dark px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save privileges
            </button>
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Audit log"
        description="Recent user management actions in your organization."
      >
        {auditLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading audit log…
          </div>
        ) : (auditLogs?.items?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500">No user management actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Target</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs?.items.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-50">
                    <td className="py-3 pr-4 text-gray-500">
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 pr-4 font-medium text-dash-dark">
                      {entry.actor?.name ?? "—"}
                    </td>
                    <td className="py-3 pr-4 capitalize text-gray-600">
                      {entry.action.replaceAll("_", " ")}
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {entry.target?.name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSectionCard>
    </div>
  );
}
