"use client";

import { useEffect, useState, startTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { useAttendanceSettings, useUpdateAttendanceSettings } from "@/hooks/use-attendance";
import {
  AttendanceTimezoneSelect,
  DEFAULT_ATTENDANCE_TIMEZONE,
} from "@/components/attendance/attendance-timezone-select";

const DAYS_OF_WEEK = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

export function AttendanceSettingsPanel() {
  const { companyId } = useSettingsAccess();
  const { data: settings, isLoading } = useAttendanceSettings(companyId ?? undefined);
  const updateMutation = useUpdateAttendanceSettings();

  const [openingTime, setOpeningTime] = useState("09:00");
  const [closingTime, setClosingTime] = useState("17:00");
  const [workingDays, setWorkingDays] = useState<string[]>([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [autoClockout, setAutoClockout] = useState(true);
  const [timezone, setTimezone] = useState(DEFAULT_ATTENDANCE_TIMEZONE);

  useEffect(() => {
    if (settings) {
      startTransition(() => {
        if (settings.opening_time) setOpeningTime(settings.opening_time.slice(0, 5));
        if (settings.closing_time) setClosingTime(settings.closing_time.slice(0, 5));
        if (settings.working_days) setWorkingDays(settings.working_days);
        if (settings.clockin_window_minutes !== undefined) {
          setWindowMinutes(settings.clockin_window_minutes);
        }
        if (settings.auto_clockout_enabled !== undefined) {
          setAutoClockout(settings.auto_clockout_enabled);
        }
        if (settings.timezone) {
          setTimezone(settings.timezone);
        }
      });
    }
  }, [settings]);

  function toggleDay(day: string) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function handleSave() {
    if (!companyId) return;
    updateMutation.mutate(
      {
        company_id: companyId,
        opening_time: openingTime,
        closing_time: closingTime,
        working_days: workingDays,
        clockin_window_minutes: windowMinutes,
        auto_clockout_enabled: autoClockout,
        timezone,
      },
      {
        onSuccess: () => toast.success("Attendance settings saved."),
        onError: (err: Error) => toast.error(err.message || "Failed to save settings."),
      },
    );
  }

  return (
    <SettingsSectionCard
      title="Workforce & Attendance"
      description="Working hours and clock in rules for your team"
      scope="organization"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Working days
            </label>
            <div className="flex gap-2 flex-wrap">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => toggleDay(day.key)}
                  className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                    workingDays.includes(day.key)
                      ? "bg-dash-dark text-white border-dash-dark"
                      : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Opening time
              </label>
              <input
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Closing time
              </label>
              <input
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Clock in window (minutes)
            </label>
            <input
              type="number"
              min={0}
              max={120}
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Timezone
            </label>
            <AttendanceTimezoneSelect value={timezone} onChange={setTimezone} />
            <p className="text-[11px] text-gray-400 mt-1.5">
              Opening and closing times are interpreted in this timezone.
            </p>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100">
            <div>
              <p className="text-[13px] font-bold text-dash-dark">Auto clock out</p>
              <p className="text-[11px] text-gray-400">Clock out agents at closing time</p>
            </div>
            <button
              type="button"
              onClick={() => setAutoClockout((v) => !v)}
              className={`relative w-12 h-6 rounded-full transition-colors ${autoClockout ? "bg-dash-dark" : "bg-gray-300"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoClockout ? "translate-x-6" : "translate-x-0"}`}
              />
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="px-5 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save attendance settings"}
          </button>
        </div>
      )}
    </SettingsSectionCard>
  );
}
