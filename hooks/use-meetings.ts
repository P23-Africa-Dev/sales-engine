"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    cancelMeeting,
    createMeeting,
    deleteMeeting,
    getMeeting,
    listMeetings,
    resyncMeeting,
    updateMeeting,
    type CreateMeetingPayload,
    type MeetingItem,
    type MeetingsListParams,
    type UpdateMeetingPayload,
} from "@/lib/api/meetings";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { toast } from "sonner";

export const MEETING_KEYS = {
    all: ["meetings"] as const,
    list: (params: MeetingsListParams) => ["meetings", params] as const,
    detail: (meetingId: number | string, companyId?: number | string) =>
        ["meetings", "detail", meetingId, companyId] as const,
};

export type MeetingsResult = {
    meetings: MeetingItem[];
    pagination: {
        next_page_url: string | null;
        prev_page_url: string | null;
        per_page: number;
    };
};

export function useMeetings(params: MeetingsListParams = {}) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: MEETING_KEYS.list(params),
        queryFn: async (): Promise<MeetingsResult> => {
            const res = await listMeetings(params, token);
            return {
                meetings: res.data.items,
                pagination: res.data.pagination,
            };
        },
        enabled: hasActiveApiSession(token) && !!params.company_id,
        staleTime: 1000 * 60,
    });
}

export function useMeetingDetail(meetingId: number | string, companyId?: number | string) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: MEETING_KEYS.detail(meetingId, companyId),
        queryFn: async () => (await getMeeting(meetingId, { company_id: companyId }, token)).data.meeting,
        enabled: hasActiveApiSession(token) && !!meetingId,
    });
}

export function useCreateMeeting(options?: { onSuccess?: (meeting: MeetingItem) => void }) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: (payload: CreateMeetingPayload) => createMeeting(payload, token),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: MEETING_KEYS.all });
            if (res.meta?.queued_offline) {
                toast.info("Meeting creation queued offline.");
                return;
            }
            options?.onSuccess?.(res.data.meeting);
        },
    });
}

export function useUpdateMeeting(options?: { onSuccess?: (meeting: MeetingItem) => void }) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({ meetingId, payload }: { meetingId: number | string; payload: UpdateMeetingPayload }) =>
            updateMeeting(meetingId, payload, token),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: MEETING_KEYS.all });
            if (res.meta?.queued_offline) {
                toast.info("Meeting update queued offline.");
                return;
            }
            options?.onSuccess?.(res.data.meeting);
        },
    });
}

export function useCancelMeeting(options?: { onSuccess?: (meeting: MeetingItem) => void }) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({ meetingId, companyId }: { meetingId: number | string; companyId: number | string }) =>
            cancelMeeting(meetingId, { company_id: companyId }, token),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: MEETING_KEYS.all });
            if (res.meta?.queued_offline) {
                toast.info("Meeting cancellation queued offline.");
                return;
            }
            options?.onSuccess?.(res.data.meeting);
        },
    });
}

export function useDeleteMeeting(options?: { onSuccess?: (meeting: MeetingItem) => void }) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({ meetingId, companyId }: { meetingId: number | string; companyId: number | string }) =>
            deleteMeeting(meetingId, { company_id: companyId }, token),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: MEETING_KEYS.all });
            options?.onSuccess?.(res.data.meeting);
        },
    });
}

export function useResyncMeeting(options?: { onSuccess?: (meeting: MeetingItem) => void }) {
    const queryClient = useQueryClient();
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useMutation({
        mutationFn: ({ meetingId, companyId }: { meetingId: number | string; companyId: number | string }) =>
            resyncMeeting(meetingId, { company_id: companyId }, token),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: MEETING_KEYS.all });
            options?.onSuccess?.(res.data.meeting);
        },
    });
}
