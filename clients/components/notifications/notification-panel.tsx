"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  X,
  CheckCheck,
  Bell,
  Briefcase,
  MapPin,
  FolderOpen,
  DollarSign,
  Users,
  UserCheck,
  Building2,
  ShieldCheck,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNowStrict, parseISO, isToday, isYesterday } from "date-fns";
import { useNotifications, useMarkRead, useMarkAllRead, useDeleteNotification } from "@/hooks/use-notifications";
import type { AppNotification, NotificationCategory } from "@/lib/api/notifications";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";

const CATEGORY_CONFIG: Record<
  NotificationCategory,
  { icon: React.ReactNode; color: string; bg: string; label: string }
> = {
  task: {
    icon: <CheckCheck size={14} />,
    color: "#6366F1",
    bg: "#EEF2FF",
    label: "Task",
  },
  tracking: {
    icon: <MapPin size={14} />,
    color: "#10B981",
    bg: "#ECFDF5",
    label: "Tracking",
  },
  project: {
    icon: <FolderOpen size={14} />,
    color: "#F59E0B",
    bg: "#FFFBEB",
    label: "Project",
  },
  payroll: {
    icon: <DollarSign size={14} />,
    color: "#14B8A6",
    bg: "#F0FDFA",
    label: "Payroll",
  },
  crm: {
    icon: <Briefcase size={14} />,
    color: "#2563EB",
    bg: "#EFF6FF",
    label: "CRM",
  },
  auth: {
    icon: <ShieldCheck size={14} />,
    color: "#8B5CF6",
    bg: "#F5F3FF",
    label: "Auth",
  },
  onboarding: {
    icon: <UserCheck size={14} />,
    color: "#EC4899",
    bg: "#FDF2F8",
    label: "Onboarding",
  },
  workforce: {
    icon: <Users size={14} />,
    color: "#F97316",
    bg: "#FFF7ED",
    label: "Workforce",
  },
  enterprise: {
    icon: <Building2 size={14} />,
    color: "#64748B",
    bg: "#F8FAFC",
    label: "Enterprise",
  },
  all: {
    icon: <Bell size={14} />,
    color: "#6B7280",
    bg: "#F9FAFB",
    label: "General",
  },
};

function getCategoryConfig(category: NotificationCategory) {
  return CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.all;
}

function formatTime(dateStr: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(dateStr), { addSuffix: true });
  } catch {
    return "";
  }
}

function groupByDate(notifications: AppNotification[]) {
  const today: AppNotification[] = [];
  const yesterday: AppNotification[] = [];
  const earlier: AppNotification[] = [];

  notifications.forEach((n) => {
    try {
      const date = parseISO(n.created_at);
      if (isToday(date)) today.push(n);
      else if (isYesterday(date)) yesterday.push(n);
      else earlier.push(n);
    } catch {
      earlier.push(n);
    }
  });

  const groups: { label: string; items: AppNotification[] }[] = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (earlier.length) groups.push({ label: "Earlier", items: earlier });
  return groups;
}

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
  onNavigate,
}: {
  notification: AppNotification;
  onMarkRead: (id: number) => void;
  onDelete: (id: number) => void;
  onNavigate: (n: AppNotification) => void;
}) {
  const config = getCategoryConfig(notification.category);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onNavigate(notification)}
        className={`w-full text-left flex items-start gap-3.5 px-5 py-4 transition-all duration-150 ${
          notification.is_read
            ? "hover:bg-gray-50/80"
            : "bg-indigo-50/40 hover:bg-indigo-50/70"
        }`}
      >
        {/* Unread indicator */}
        {!notification.is_read && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-indigo-500" />
        )}

        {/* Category icon */}
        <div
          className="shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center mt-0.5"
          style={{ backgroundColor: config.bg, color: config.color }}
        >
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-[13px] leading-snug line-clamp-1 ${
                notification.is_read
                  ? "font-medium text-gray-600"
                  : "font-bold text-gray-900"
              }`}
            >
              {notification.title}
            </p>
            <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">
              {formatTime(notification.created_at)}
            </span>
          </div>
          <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed line-clamp-2">
            {notification.message}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: config.bg, color: config.color }}
            >
              {config.label}
            </span>
            {notification.priority === "critical" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600">
                Critical
              </span>
            )}
            {notification.priority === "urgent" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-red-50 text-red-500">
                Urgent
              </span>
            )}
            {notification.priority === "high" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-500">
                High
              </span>
            )}
          </div>
        </div>

        {(notification.action_url || notification.action_route) && (
          <ChevronRight size={14} className="shrink-0 text-gray-300 mt-1" />
        )}
      </button>

      {/* Action buttons on hover */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.1 }}
            className="absolute right-3 top-3 flex items-center gap-1 bg-white border border-gray-100 rounded-xl shadow-md px-1.5 py-1"
          >
            {!notification.is_read && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkRead(notification.id);
                }}
                title="Mark as read"
                className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors"
              >
                <CheckCheck size={13} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(notification.id);
              }}
              title="Delete"
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({ filter }: { filter: "all" | "unread" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mb-4">
        <Bell size={28} className="text-gray-300" />
      </div>
      <p className="text-[14px] font-semibold text-gray-700">
        {filter === "unread" ? "You're all caught up!" : "No notifications yet"}
      </p>
      <p className="text-[12px] text-gray-400 mt-1">
        {filter === "unread"
          ? "No unread notifications at the moment."
          : "Notifications from tasks, projects, and more will appear here."}
      </p>
    </div>
  );
}

export function resolveWebNotificationUrl(notification: AppNotification, isAgent: boolean): string | null {
  const target = notification.action_url || notification.action_route;

  // Tracking events always deep-link managers to the live Map feed.
  if (notification.type?.startsWith("tracking.") && !isAgent) {
    const taskId =
      notification.metadata?.task_id ??
      notification.reference_id ??
      (typeof target === "string" ? target.match(/taskId=(\d+)/)?.[1] : undefined);
    if (taskId) return `/map?taskId=${taskId}`;
  }

  // Let's first try to resolve based on action_url/action_route
  if (target) {
    // Map live feed deep-link
    const mapMatch = target.match(/^\/map(?:\?taskId=(\d+))?/);
    if (mapMatch) {
      return isAgent
        ? (mapMatch[1] ? `/agent/map?taskId=${mapMatch[1]}` : "/agent/map")
        : target.startsWith("/map")
          ? target
          : "/map";
    }

    // 1. Tasks: e.g. /tasks/123
    const taskMatch = target.match(/^\/tasks\/(\d+)/);
    if (taskMatch) {
      return isAgent ? `/agent/tasks/${taskMatch[1]}` : `/tasks?taskId=${taskMatch[1]}`;
    }

    // 2. Meetings: e.g. /meetings/123
    const meetingMatch = target.match(/^\/meetings\/(\d+)/);
    if (meetingMatch) {
      return isAgent ? `/agent/dashboard?meetingId=${meetingMatch[1]}` : `/dashboard?meetingId=${meetingMatch[1]}`;
    }

    // 3. CRM Leads: e.g. /crm/leads/123
    const leadMatch = target.match(/^\/crm\/leads\/(\d+)/);
    if (leadMatch) {
      return isAgent ? `/agent/crm/leads/${leadMatch[1]}` : `/crm/leads/${leadMatch[1]}`;
    }

    // 4. Projects: e.g. /projects/123
    const projectMatch = target.match(/^\/projects\/(\d+)/);
    if (projectMatch) {
      return isAgent ? `/agent/projects/${projectMatch[1]}` : `/projects/${projectMatch[1]}`;
    }

    // 5. Operations/Attendance
    if (target.includes('/operations/attendance')) {
      return isAgent ? '/agent/operations/attendance' : '/operations/attendance';
    }

    // 6. Task reassignments inbox
    if (target.includes('/reassignments/inbox')) {
      return isAgent ? '/agent/tasks' : '/tasks';
    }

    // 7. Payroll
    if (target === '/payroll') {
      return isAgent ? '/agent/payroll' : '/payroll';
    }

    // 8. Dashboard
    if (target === '/dashboard' || target === '/') {
      return isAgent ? '/agent/dashboard' : '/dashboard';
    }

    // 9. User Profile
    if (target === '/user/profile') {
      return isAgent ? '/agent/profile' : '/profile';
    }

    // 10. Company Drive
    if (target.startsWith('/drive') || target.startsWith('/agent/drive')) {
      return isAgent ? target.replace('/drive', '/agent/drive') : target.replace('/agent/drive', '/drive');
    }

    // 11. Internal users / workforce onboarding status
    if (target.includes('/internal-users')) {
      return isAgent ? '/agent/operations/agents' : '/operations/agents';
    }

    // Unknown action_url — don't navigate (avoids 404)
    return null;
  }

  // Fallback to reference_type and reference_id if no action_url is present
  if (notification.reference_type && notification.reference_id) {
    const type = notification.reference_type;
    const id = notification.reference_id;

    if (type.includes('Task')) {
      return isAgent ? `/agent/tasks/${id}` : `/tasks?taskId=${id}`;
    }
    if (type.includes('Meeting')) {
      return isAgent ? `/agent/dashboard?meetingId=${id}` : `/dashboard?meetingId=${id}`;
    }
    if (type.includes('Lead') || type.includes('Crm')) {
      return isAgent ? `/agent/crm/leads/${id}` : `/crm/leads/${id}`;
    }
    if (type.includes('Project')) {
      return isAgent ? `/agent/projects/${id}` : `/projects/${id}`;
    }
    if (type.includes('DriveFile')) {
      return isAgent ? `/agent/drive?file=${id}` : `/drive?file=${id}`;
    }
  }

  return null;
}

export function NotificationPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = useNotifications({
    company_id: companyId ?? undefined,
    is_read: filter === "unread" ? 0 : undefined,
    per_page: 30,
  });

  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const deleteNotif = useDeleteNotification();
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // Refresh on open
  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const notifications = data?.items ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const groups = groupByDate(notifications);

  function handleNavigate(n: AppNotification) {
    if (!n.is_read) {
      markRead.mutate({ ids: [n.id], companyId: companyId ?? undefined });
    }
    const resolvedUrl = resolveWebNotificationUrl(n, role === 'agent');
    if (resolvedUrl) {
      onClose();
      router.push(resolvedUrl);
    }
  }

  function handleMarkRead(id: number) {
    markRead.mutate({ ids: [id], companyId: companyId ?? undefined });
  }

  function handleMarkAll() {
    markAllRead.mutate(companyId ?? undefined);
  }

  function handleDelete(id: number) {
    setDeleteTargetId(id);
  }

  return (
    <>
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-90 bg-black/20 backdrop-blur-[2px]"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed top-0 right-0 bottom-0 z-100 w-full max-w-105 bg-white shadow-2xl flex flex-col"
            style={{ borderRadius: "24px 0 0 24px" }}
          >
            {/* Header */}
            <div className="shrink-0 px-5 pt-6 pb-0">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-dash-dark flex items-center justify-center">
                    <Bell size={16} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-black text-gray-900 leading-tight">
                      Notifications
                    </h2>
                    {unreadCount > 0 && (
                      <p className="text-[11px] text-indigo-500 font-semibold">
                        {unreadCount} unread
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAll}
                      disabled={markAllRead.isPending}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <CheckCheck size={12} />
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl">
                {(["all", "unread"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`flex-1 py-2 text-[12px] font-bold rounded-xl transition-all duration-200 capitalize ${
                      filter === tab
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab === "unread" ? `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` : "All"}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-100 mt-4 shrink-0" />

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex flex-col gap-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3.5 px-5 py-4">
                      <div className="w-9 h-9 rounded-2xl bg-gray-100 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-100 rounded-full animate-pulse w-3/4" />
                        <div className="h-3 bg-gray-100 rounded-full animate-pulse w-full" />
                        <div className="h-2.5 bg-gray-100 rounded-full animate-pulse w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <EmptyState filter={filter} />
              ) : (
                groups.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 px-5 py-2.5 bg-gray-50/90 backdrop-blur-sm border-b border-gray-100">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                        {group.label}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {group.items.map((n) => (
                        <NotificationItem
                          key={n.id}
                          notification={n}
                          onMarkRead={handleMarkRead}
                          onDelete={handleDelete}
                          onNavigate={handleNavigate}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="shrink-0 border-t border-gray-100 px-5 py-4">
                <p className="text-center text-[11px] text-gray-400">
                  {notifications.length} notification{notifications.length !== 1 ? "s" : ""} shown
                  {data?.pagination.next_page_url ? " · scroll for more" : ""}
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>

    <ConfirmDeleteModal
      isOpen={deleteTargetId !== null}
      onClose={() => setDeleteTargetId(null)}
      onConfirm={() => { if (deleteTargetId !== null) deleteNotif.mutate(deleteTargetId); }}
      title="Delete Notification"
      description="Are you sure you want to delete this notification?"
      confirmLabel="Delete"
    />
    </>
  );
}
