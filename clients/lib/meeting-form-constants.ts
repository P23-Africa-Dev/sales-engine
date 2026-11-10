export const MEETING_REMINDER_PRESETS = [
    { label: "5 minutes before", value: 5 },
    { label: "15 minutes before", value: 15 },
    { label: "30 minutes before", value: 30 },
    { label: "1 hour before", value: 60 },
    { label: "3 hours before", value: 180 },
    { label: "1 day before", value: 1440 },
    { label: "3 days before", value: 4320 },
] as const;

export const MEETING_COMMON_TIMEZONES = [
    "UTC",
    "Africa/Lagos",
    "Africa/Nairobi",
    "Africa/Cairo",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
] as const;
export type MeetingAttendeeInput = {
    email: string;
    display_name?: string;
    user_id?: number;
    is_optional?: boolean;
};

export type MeetingReminderInput = {
    offset_minutes?: number;
    remind_at?: string;
};
