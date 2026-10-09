import { apiRequest, ApiEnvelope } from "./onboarding";

export type MeetingAttendeeCandidate = {
    id: number;
    name: string;
    email: string;
    avatar_url?: string | null;
    company_role: "owner" | "admin" | "supervisor" | "agent" | string;
    internal_role?: "supervisor" | "agent" | null;
    display_role: string;
    is_active: boolean;
};

export type MeetingAttendeeCandidatesData = {
    items: MeetingAttendeeCandidate[];
};

export function listMeetingAttendeeCandidates(
    params: { company_id?: number | string },
    token: string
): Promise<ApiEnvelope<MeetingAttendeeCandidatesData>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest<MeetingAttendeeCandidatesData>({
        method: "GET",
        path: `/meetings/attendees${query}`,
        token,
    });
}
