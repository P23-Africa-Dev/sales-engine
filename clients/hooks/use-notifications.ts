"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import {
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
  deleteNotification,
  type ListNotificationsParams,
  type NotificationsListData,
  type UnreadCountData,
} from "@/lib/api/notifications";

export const NOTIFICATION_KEYS = {
  all: ["notifications"] as const,
  list: (params: ListNotificationsParams) => ["notifications", "list", params] as const,
  unread: (companyId?: number | string) => ["notifications", "unread", companyId] as const,
};

export function useNotifications(params: ListNotificationsParams = {}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: NOTIFICATION_KEYS.list(params),
    queryFn: async (): Promise<NotificationsListData> => {
      const res = await listNotifications(params, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useUnreadCount(companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  return useQuery({
    queryKey: NOTIFICATION_KEYS.unread(companyId),
    queryFn: async (): Promise<UnreadCountData> => {
      const res = await getUnreadCount(token, companyId);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: ({
      ids,
      companyId,
    }: {
      ids: number[];
      companyId?: number | string;
    }) => markNotificationsRead(ids, token, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (companyId?: number | string) =>
      markAllNotificationsRead(token, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (notificationId: number) => deleteNotification(notificationId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}
