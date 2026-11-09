"use client";

import { useQuery } from "@tanstack/react-query";
import {
    listMeetingAttendeeCandidates,
    type MeetingAttendeeCandidate,
} from "@/lib/api/meeting-attendees";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";

export const MEETING_ATTENDEE_KEYS = {
    all: ["meeting-attendees"] as const,
    candidates: (companyId?: number | string) => ["meeting-attendees", "candidates", companyId] as const,
};

export function useMeetingAttendeeCandidates(companyId?: number | string) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

    return useQuery({
        queryKey: MEETING_ATTENDEE_KEYS.candidates(companyId),
        queryFn: async (): Promise<MeetingAttendeeCandidate[]> => {
            const response = await listMeetingAttendeeCandidates({ company_id: companyId }, token);
            return response.data.items;
        },
        enabled: hasActiveApiSession(token) && !!companyId,
        staleTime: 1000 * 60 * 2,
    });
}
