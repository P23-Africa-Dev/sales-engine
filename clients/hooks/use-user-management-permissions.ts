"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCompanySettings } from "@/lib/api/company-settings";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";

export function useUserManagementPermissions(target?: {
  internalRole?: string | null;
  supervisorUserId?: number | null;
  isSuspended?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const { role: companyRole, apiCompanyId: companyId } = getActiveCompanyContext(user);
  const role = companyRole ?? user?.access_role ?? null;
  const actorId = user?.id != null ? Number(user.id) : null;

  const { data: settings } = useQuery({
    queryKey: ["company-settings", companyId],
    queryFn: async () => {
      const res = await getCompanySettings(companyId ?? undefined);
      return res.data;
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
  });

  const privileges = settings?.user_management ?? {
    supervisor_can_suspend_agents: false,
    supervisor_can_delete_agents: false,
  };

  return useMemo(() => {
    const isOwnerOrAdmin = role === "owner" || role === "admin";
    const isSupervisor = role === "supervisor";
    const targetRole = target?.internalRole ?? null;
    const isOwnAgent =
      targetRole === "agent" &&
      actorId != null &&
      target?.supervisorUserId != null &&
      Number(target.supervisorUserId) === actorId;

    const canEdit =
      isOwnerOrAdmin && (targetRole === "admin" || targetRole === "supervisor" || targetRole === "agent")
        ? true
        : isSupervisor && isOwnAgent;

    const canSuspend =
      isOwnerOrAdmin && (targetRole === "admin" || targetRole === "supervisor" || targetRole === "agent")
        ? true
        : isSupervisor && isOwnAgent && privileges.supervisor_can_suspend_agents;

    const canDelete =
      isOwnerOrAdmin && (targetRole === "admin" || targetRole === "supervisor" || targetRole === "agent")
        ? true
        : isSupervisor && isOwnAgent && privileges.supervisor_can_delete_agents;

    const canReactivate = canSuspend && Boolean(target?.isSuspended);
    const canManageSettings = isOwnerOrAdmin;
    const canViewAuditLogs = isOwnerOrAdmin;

    return {
      role,
      companyId,
      canEdit,
      canSuspend: canSuspend && !target?.isSuspended,
      canDelete,
      canReactivate,
      canManageSettings,
      canViewAuditLogs,
      privileges,
    };
  }, [actorId, privileges, role, target?.internalRole, target?.isSuspended, target?.supervisorUserId]);
}
