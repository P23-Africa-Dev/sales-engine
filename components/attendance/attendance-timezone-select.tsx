"use client";

import { MEETING_COMMON_TIMEZONES } from "@/lib/meeting-form-constants";
import { resolveMeetingTimezone } from "@/lib/meeting-timezone";

export const DEFAULT_ATTENDANCE_TIMEZONE = resolveMeetingTimezone(
  undefined,
  MEETING_COMMON_TIMEZONES,
);

type AttendanceTimezoneSelectProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function AttendanceTimezoneSelect({
  value,
  onChange,
  className = "w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]",
}: AttendanceTimezoneSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {MEETING_COMMON_TIMEZONES.map((timezone) => (
        <option key={timezone} value={timezone}>
          {timezone}
        </option>
      ))}
    </select>
  );
}
