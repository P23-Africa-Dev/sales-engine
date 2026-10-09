import { apiRequest, ApiEnvelope } from "./onboarding";

export type CalendarIntegrationStatus = {
    connected: boolean;
    status: string;
    connected_google_email?: string | null;
    google_account_name?: string | null;
    organizer_email?: string | null;
    owner_user_id?: number | null;
    requires_owner_action: boolean;
    can_manage_connection?: boolean;
    token_valid?: boolean;
    requires_reauthentication?: boolean;
    gmail_enabled?: boolean;
    requires_gmail_reconnect?: boolean;
    gmail_last_synced_at?: string | null;
    connection_health_status?: string;
    last_error_message?: string | null;
    last_token_refresh_at?: string | null;
    connection_date?: string | null;
    connected_at?: string | null;
    disconnected_at?: string | null;
};

export function getCalendarIntegrationStatus(
    params: { company_id?: number | string },
    token: string
): Promise<ApiEnvelope<CalendarIntegrationStatus>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest<CalendarIntegrationStatus>({
        method: "GET",
        path: `/calendar/integration/status${query}`,
        token,
    });
}

export function createCalendarConnectUrl(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ authorization_url: string; expires_in_seconds: number }>> {
    return apiRequest<{ authorization_url: string; expires_in_seconds: number }>({
        method: "POST",
        path: "/calendar/integration/connect-url",
        body: payload,
        token,
    });
}

export function disconnectCalendarIntegration(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ disconnected: boolean; access_token_revoked?: boolean; refresh_token_revoked?: boolean }>> {
    return apiRequest<{ disconnected: boolean; access_token_revoked?: boolean; refresh_token_revoked?: boolean }>({
        method: "DELETE",
        path: "/calendar/integration/disconnect",
        body: payload,
        token,
    });
}

export function createCalendarSwitchUrl(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ authorization_url: string; expires_in_seconds: number }>> {
    return apiRequest<{ authorization_url: string; expires_in_seconds: number }>({
        method: "POST",
        path: "/calendar/integration/switch-url",
        body: payload,
        token,
    });
}

export function createCalendarReconnectUrl(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ authorization_url: string; expires_in_seconds: number }>> {
    return apiRequest<{ authorization_url: string; expires_in_seconds: number }>({
        method: "POST",
        path: "/calendar/integration/reconnect-url",
        body: payload,
        token,
    });
}

export type UserCalendarIntegrationStatus = CalendarIntegrationStatus;

export function getUserCalendarIntegrationStatus(
    params: { company_id?: number | string },
    token: string
): Promise<ApiEnvelope<UserCalendarIntegrationStatus>> {
    const qs = new URLSearchParams();
    if (params.company_id != null) qs.set("company_id", String(params.company_id));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return apiRequest<UserCalendarIntegrationStatus>({
        method: "GET",
        path: `/calendar/user-integration/status${query}`,
        token,
    });
}

export function createUserCalendarConnectUrl(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ authorization_url: string; expires_in_seconds: number }>> {
    return apiRequest<{ authorization_url: string; expires_in_seconds: number }>({
        method: "POST",
        path: "/calendar/user-integration/connect-url",
        body: payload,
        token,
    });
}

export function disconnectUserCalendarIntegration(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ disconnected: boolean; access_token_revoked?: boolean; refresh_token_revoked?: boolean }>> {
    return apiRequest<{ disconnected: boolean; access_token_revoked?: boolean; refresh_token_revoked?: boolean }>({
        method: "DELETE",
        path: "/calendar/user-integration/disconnect",
        body: payload,
        token,
    });
}

export function createUserCalendarSwitchUrl(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ authorization_url: string; expires_in_seconds: number }>> {
    return apiRequest<{ authorization_url: string; expires_in_seconds: number }>({
        method: "POST",
        path: "/calendar/user-integration/switch-url",
        body: payload,
        token,
    });
}

export function createUserCalendarReconnectUrl(
    payload: { company_id: number | string },
    token: string
): Promise<ApiEnvelope<{ authorization_url: string; expires_in_seconds: number }>> {
    return apiRequest<{ authorization_url: string; expires_in_seconds: number }>({
        method: "POST",
        path: "/calendar/user-integration/reconnect-url",
        body: payload,
        token,
    });
}
