"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Trash2, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { SuspendUserModal } from "@/components/operations/suspend-user-modal";
import {
  useDeleteInternalUser,
  useReactivateInternalUser,
  useSuspendInternalUser,
} from "@/hooks/use-internal-user-lifecycle";
import { useUserManagementPermissions } from "@/hooks/use-user-management-permissions";

type UserLifecycleBaseProps = {
  userId: number | string;
  userName: string;
  companyId?: number | string;
  internalRole?: string | null;
  supervisorUserId?: number | null;
  isSuspended?: boolean;
  suspendedUntil?: string | null;
};

type UserLifecycleActionsProps = UserLifecycleBaseProps & {
  compact?: boolean;
};

function LifecycleIconButton({
  onClick,
  disabled,
  ariaLabel,
  children,
  active = false,
  tone = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: ReactNode;
  active?: boolean;
  tone?: "default" | "emerald" | "amber" | "danger";
}) {
  const backgroundClass =
    tone === "emerald"
      ? "bg-emerald-100"
      : tone === "amber"
        ? "bg-amber-100"
        : tone === "danger"
          ? "bg-red-100"
          : active
            ? "bg-dash-dark"
            : "bg-[#EAEAEA]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`flex h-[33px] w-[33px] items-center justify-center rounded-full border border-[#DFDFDF] ${backgroundClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

export function DeleteUserIconButton({
  userId,
  userName,
  companyId,
  internalRole,
  supervisorUserId,
  isSuspended = false,
}: UserLifecycleBaseProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const permissions = useUserManagementPermissions({
    internalRole,
    supervisorUserId,
    isSuspended,
  });

  const deleteMutation = useDeleteInternalUser();

  if (!companyId || !permissions.canDelete) {
    return null;
  }

  const handleDelete = () => {
    deleteMutation.mutate(
      { userId, payload: { company_id: companyId } },
      {
        onSuccess: () => {
          toast.success(`${userName} has been deleted.`);
          setShowDeleteConfirm(false);
        },
        onError: () => toast.error("Unable to delete this user."),
      },
    );
  };

  return (
    <>
      <LifecycleIconButton
        onClick={() => setShowDeleteConfirm(true)}
        disabled={deleteMutation.isPending}
        ariaLabel={`Delete ${userName}`}
        tone="danger"
      >
        {deleteMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-red-600" />
        ) : (
          <Trash2 size={15} className="text-red-600" />
        )}
      </LifecycleIconButton>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-dash-dark">Delete user</h3>
            <p className="mt-2 text-sm text-gray-500">
              This will remove <strong>{userName}</strong> from your organization. This action can be reversed by support if needed.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Delete user"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function UserLifecycleActions({
  userId,
  userName,
  companyId,
  internalRole,
  supervisorUserId,
  isSuspended = false,
  suspendedUntil,
  compact = false,
}: UserLifecycleActionsProps) {
  const [showSuspendModal, setShowSuspendModal] = useState(false);

  const permissions = useUserManagementPermissions({
    internalRole,
    supervisorUserId,
    isSuspended,
  });

  const suspendMutation = useSuspendInternalUser();
  const reactivateMutation = useReactivateInternalUser();

  if (!companyId) return null;

  const lifecyclePayload = { company_id: companyId };
  const isPending = suspendMutation.isPending || reactivateMutation.isPending;

  const handleSuspend = (payload: {
    suspend_type: "duration" | "date" | "permanent";
    suspend_days?: number;
    suspend_until?: string;
  }) => {
    suspendMutation.mutate(
      {
        userId,
        payload: { ...payload, company_id: companyId },
      },
      {
        onSuccess: () => {
          toast.success(`${userName} has been suspended.`);
          setShowSuspendModal(false);
        },
        onError: () => toast.error("Unable to suspend this user."),
      },
    );
  };

  const handleReactivate = () => {
    reactivateMutation.mutate(
      { userId, payload: lifecyclePayload },
      {
        onSuccess: () => toast.success(`${userName} has been reactivated.`),
        onError: () => toast.error("Unable to reactivate this user."),
      },
    );
  };

  if (!permissions.canSuspend && !permissions.canReactivate && !isSuspended) {
    return null;
  }

  return (
    <>
      <div className={`${compact ? "flex flex-wrap gap-2" : "mt-4 space-y-3"}`}>
        {isSuspended && (
          <p className={`text-xs text-amber-700 ${compact ? "w-full" : ""}`}>
            Suspended{suspendedUntil ? ` until ${new Date(suspendedUntil).toLocaleDateString()}` : ""}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {permissions.canReactivate && (
            <LifecycleIconButton
              onClick={handleReactivate}
              disabled={isPending}
              ariaLabel={`Reactivate ${userName}`}
              tone="emerald"
            >
              {reactivateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
              ) : (
                <UserCheck size={15} className="text-emerald-700" />
              )}
            </LifecycleIconButton>
          )}

          {permissions.canSuspend && (
            <button
              type="button"
              onClick={() => setShowSuspendModal(true)}
              disabled={isPending}
              aria-label={`Suspend ${userName}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserX size={14} />
              Suspend
            </button>
          )}
        </div>
      </div>

      <SuspendUserModal
        open={showSuspendModal}
        userName={userName}
        isSubmitting={suspendMutation.isPending}
        onClose={() => setShowSuspendModal(false)}
        onConfirm={handleSuspend}
      />
    </>
  );
}
