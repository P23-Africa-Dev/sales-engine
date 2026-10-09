"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    createUserCalendarConnectUrl,
    disconnectUserCalendarIntegration,
    createUserCalendarReconnectUrl,
    createUserCalendarSwitchUrl,
    getUserCalendarIntegrationStatus,
    type CalendarIntegrationStatus,
} from "@/lib/api/calendar-integration";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";

export const CALENDAR_INTEGRATION_KEYS = {
    all: ["calendar-integration"] as const,
    status: (companyId?: number | string) => ["calendar-integration", "status", companyId] as const,
};

export function useCalendarIntegrationStatus(companyId?: number | string) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: CALENDAR_INTEGRATION_KEYS.status(companyId),
        queryFn: async (): Promise<CalendarIntegrationStatus> => {
            const response = await getUserCalendarIntegrationStatus({ company_id: companyId }, token);
            return response.data;
        },
        enabled: hasActiveApiSession(token) && !!companyId,
        staleTime: 1000 * 30,
    });
}

export function useCreateCalendarConnectUrl() {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string }) => createUserCalendarConnectUrl(payload, token),
    });
}

export function useDisconnectCalendarIntegration(options?: {
    onSuccess?: (disconnected: boolean) => void;
}) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: { company_id: number | string }) => disconnectUserCalendarIntegration(payload, token),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: CALENDAR_INTEGRATION_KEYS.all });
            options?.onSuccess?.(res.data.disconnected);
        },
    });
}

export function useCalendarIntegrationSwitch() {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: async (payload: { company_id: number | string }) => {
            if (!token || !payload.company_id) {
                throw new Error("Authentication and company context are required.");
            }

            return createUserCalendarSwitchUrl(payload, token);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CALENDAR_INTEGRATION_KEYS.all });
        },
    });
}

export function useCalendarIntegrationReconnect() {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: async (payload: { company_id: number | string }) => {
            if (!token || !payload.company_id) {
                throw new Error("Authentication and company context are required.");
            }

            return createUserCalendarReconnectUrl(payload, token);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CALENDAR_INTEGRATION_KEYS.all });
        },
    });
}
