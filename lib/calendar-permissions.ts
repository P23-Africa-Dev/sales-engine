export function canConnectGoogleCalendar(role?: string | null): boolean {
    return role === "owner" || role === "admin" || role === "supervisor" || role === "agent";
}

export function canAccessMeetingCreation(role: string | null | undefined, calendarConnected: boolean): boolean {
    return canConnectGoogleCalendar(role) || calendarConnected;
}

export function getMeetingCreationTooltip(role: string | null | undefined, calendarConnected: boolean): string | undefined {
    if (canConnectGoogleCalendar(role) || calendarConnected) {
        return undefined;
    }

    return "Google Calendar must be connected before meetings can be created.";
}

export function getMeetingAccessNotice(role: string | null | undefined, calendarConnected: boolean): string | null {
    if (calendarConnected) {
        return null;
    }

    if (canConnectGoogleCalendar(role)) {
        return "Google Calendar is not connected yet. Open the meeting modal to connect your account before creating meetings.";
    }

    return "Meeting creation is currently unavailable because your Google Calendar account has not been connected yet.";
}