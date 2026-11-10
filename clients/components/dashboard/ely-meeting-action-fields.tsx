"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Users } from "lucide-react";
import type { MeetingAttendeeCandidate } from "@/lib/api/meeting-attendees";
import {
  MEETING_COMMON_TIMEZONES,
  MEETING_REMINDER_PRESETS,
  type MeetingAttendeeInput,
  type MeetingReminderInput,
} from "@/lib/meeting-form-constants";
import { resolveMeetingTimezone } from "@/lib/meeting-timezone";

export type ElyMeetingDraft = {
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  location: string;
  timezone: string;
  internalAttendeeIds: number[];
  externalEmails: string[];
  reminderOffsets: number[];
  customReminderAt: string;
};

type ElyMeetingActionFieldsProps = {
  msgId: string;
  args: Record<string, unknown>;
  draft: ElyMeetingDraft | undefined;
  onDraftChange: (msgId: string, draft: ElyMeetingDraft) => void;
  candidates: MeetingAttendeeCandidate[];
  loadingCandidates: boolean;
};

function asDateTimeLocalInputValue(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseAttendees(raw: unknown): MeetingAttendeeInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      email: String(item.email ?? ""),
      display_name: typeof item.display_name === "string" ? item.display_name : undefined,
      user_id: typeof item.user_id === "number" ? item.user_id : undefined,
    }))
    .filter((item) => item.email.trim() !== "");
}

function parseReminderOffsets(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const offset = (item as { offset_minutes?: unknown }).offset_minutes;
      return typeof offset === "number" ? offset : null;
    })
    .filter((value): value is number => value !== null);
}

function buildDraftFromArgs(args: Record<string, unknown>, existing?: ElyMeetingDraft): ElyMeetingDraft {
  const attendees = parseAttendees(args.attendees);
  const internalIds = attendees
    .filter((attendee) => typeof attendee.user_id === "number")
    .map((attendee) => attendee.user_id as number);
  const externalEmails = attendees
    .filter((attendee) => attendee.user_id == null)
    .map((attendee) => attendee.email.toLowerCase());

  return {
    title: existing?.title ?? String(args.title ?? ""),
    description: existing?.description ?? String(args.description ?? ""),
    start_at: existing?.start_at ?? asDateTimeLocalInputValue(args.start_at),
    end_at: existing?.end_at ?? asDateTimeLocalInputValue(args.end_at),
    location: existing?.location ?? String(args.location ?? ""),
    timezone: existing?.timezone ?? resolveMeetingTimezone(String(args.timezone ?? ""), MEETING_COMMON_TIMEZONES),
    internalAttendeeIds: existing?.internalAttendeeIds ?? internalIds,
    externalEmails: existing?.externalEmails ?? externalEmails,
    reminderOffsets: existing?.reminderOffsets ?? parseReminderOffsets(args.reminders),
    customReminderAt: existing?.customReminderAt ?? "",
  };
}

export function buildMeetingActionArgs(
  draft: ElyMeetingDraft,
  candidates: MeetingAttendeeCandidate[],
  preserveArgs: Record<string, unknown> = {},
): Record<string, unknown> {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const attendees: MeetingAttendeeInput[] = [];
  const seen = new Set<string>();

  for (const userId of draft.internalAttendeeIds) {
    const candidate = candidateById.get(userId);
    if (!candidate) continue;
    const email = candidate.email.toLowerCase();
    if (seen.has(email)) continue;
    attendees.push({
      email,
      display_name: candidate.name,
      user_id: candidate.id,
    });
    seen.add(email);
  }

  for (const email of draft.externalEmails) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    attendees.push({ email: normalized });
    seen.add(normalized);
  }

  const reminders: MeetingReminderInput[] = draft.reminderOffsets.map((offset) => ({
    offset_minutes: offset,
  }));

  if (draft.customReminderAt.trim() !== "") {
    const parsed = new Date(draft.customReminderAt);
    if (!Number.isNaN(parsed.getTime())) {
      reminders.push({ remind_at: parsed.toISOString() });
    }
  }

  const built: Record<string, unknown> = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    location: draft.location.trim(),
    timezone: draft.timezone.trim() || resolveMeetingTimezone(undefined, MEETING_COMMON_TIMEZONES),
    start_at: draft.start_at ? new Date(draft.start_at).toISOString() : "",
    end_at: draft.end_at ? new Date(draft.end_at).toISOString() : "",
    attendees,
    reminders,
  };

  // Preserve server-inferred linkage fields that the specialized editor does not expose.
  for (const key of ["project_id", "task_id", "lead_ids", "meeting_settings", "draft_id", "draft_version"] as const) {
    if (preserveArgs[key] !== undefined && built[key] === undefined) {
      built[key] = preserveArgs[key];
    }
  }

  return built;
}

export function ElyMeetingActionFields({
  msgId,
  args,
  draft,
  onDraftChange,
  candidates,
  loadingCandidates,
}: ElyMeetingActionFieldsProps) {
  const timezoneDropdownRef = useRef<HTMLDivElement>(null);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [isTimezoneOpen, setIsTimezoneOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const [externalEmailInput, setExternalEmailInput] = useState("");

  const currentDraft = useMemo(() => buildDraftFromArgs(args, draft), [args, draft]);

  useEffect(() => {
    if (!draft) {
      onDraftChange(msgId, currentDraft);
    }
  }, [currentDraft, draft, msgId, onDraftChange]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (timezoneDropdownRef.current && !timezoneDropdownRef.current.contains(event.target as Node)) {
        setIsTimezoneOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function updateDraft(patch: Partial<ElyMeetingDraft>) {
    onDraftChange(msgId, { ...currentDraft, ...patch });
  }

  const filteredTimezones = MEETING_COMMON_TIMEZONES.filter((zone) =>
    zone.toLowerCase().includes(timezoneSearch.trim().toLowerCase()),
  );

  const filteredCandidates = candidates.filter((candidate) => {
    const query = internalSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      candidate.name.toLowerCase().includes(query) ||
      candidate.email.toLowerCase().includes(query) ||
      candidate.display_role.toLowerCase().includes(query)
    );
  });

  const selectedInternal = candidates.filter((candidate) =>
    currentDraft.internalAttendeeIds.includes(candidate.id),
  );

  function toggleInternalAttendee(candidate: MeetingAttendeeCandidate) {
    const exists = currentDraft.internalAttendeeIds.includes(candidate.id);
    updateDraft({
      internalAttendeeIds: exists
        ? currentDraft.internalAttendeeIds.filter((id) => id !== candidate.id)
        : [...currentDraft.internalAttendeeIds, candidate.id],
    });
  }

  function commitExternalEmail() {
    const email = externalEmailInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (currentDraft.externalEmails.includes(email)) {
      setExternalEmailInput("");
      return;
    }
    updateDraft({ externalEmails: [...currentDraft.externalEmails, email] });
    setExternalEmailInput("");
  }

  function toggleReminderOffset(offset: number) {
    const exists = currentDraft.reminderOffsets.includes(offset);
    updateDraft({
      reminderOffsets: exists
        ? currentDraft.reminderOffsets.filter((value) => value !== offset)
        : [...currentDraft.reminderOffsets, offset],
    });
  }

  const baseClassName =
    "w-full rounded-lg border border-[#355C57] bg-[#0D1C1C] px-2.5 py-2 text-[12px] text-[#D0E2E3] outline-none focus:border-[#4F8C83]";

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">Title</label>
        <input
          value={currentDraft.title}
          onChange={(e) => updateDraft({ title: e.target.value })}
          className={baseClassName}
        />
      </div>

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">Description</label>
        <textarea
          value={currentDraft.description}
          onChange={(e) => updateDraft({ description: e.target.value })}
          rows={3}
          className={`${baseClassName} resize-none`}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className="text-[11px] text-[#8CB9B3]">Start Time</label>
          <input
            type="datetime-local"
            value={currentDraft.start_at}
            onChange={(e) => updateDraft({ start_at: e.target.value })}
            className={baseClassName}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-[11px] text-[#8CB9B3]">End Time</label>
          <input
            type="datetime-local"
            value={currentDraft.end_at}
            onChange={(e) => updateDraft({ end_at: e.target.value })}
            className={baseClassName}
          />
        </div>
      </div>

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">Location</label>
        <input
          value={currentDraft.location}
          onChange={(e) => updateDraft({ location: e.target.value })}
          className={baseClassName}
        />
      </div>

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">Timezone</label>
        <div className="relative" ref={timezoneDropdownRef}>
          <button
            type="button"
            onClick={() => setIsTimezoneOpen((open) => !open)}
            className={`${baseClassName} flex items-center justify-between`}
          >
            <span className="truncate">{currentDraft.timezone}</span>
            <ChevronDown className="h-4 w-4 text-[#88B3B5]" />
          </button>
          {isTimezoneOpen && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-[#355C57] bg-[#0F2A2F] shadow-xl">
              <div className="border-b border-[#355C57] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#88B3B5]" />
                  <input
                    value={timezoneSearch}
                    onChange={(e) => setTimezoneSearch(e.target.value)}
                    placeholder="Search timezone..."
                    className="w-full rounded-md border border-[#355C57] bg-[#0D1C1C] py-1.5 pl-7 pr-2 text-[11px] text-[#D0E2E3] outline-none"
                  />
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto py-1">
                {filteredTimezones.map((zone) => (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => {
                      updateDraft({ timezone: zone });
                      setTimezoneSearch("");
                      setIsTimezoneOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] text-[#D0E2E3] hover:bg-white/5"
                  >
                    <span>{zone}</span>
                    {currentDraft.timezone === zone && <Check className="h-3.5 w-3.5 text-[#7BB6B8]" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#355C57]/70 bg-[#0D1C1C] px-3 py-2">
        <p className="mb-2 text-[11px] font-semibold text-[#9FD3C8]">Reminder Schedule</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MEETING_REMINDER_PRESETS.map((preset) => (
            <label
              key={preset.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#355C57] px-2.5 py-2 text-[11px] text-[#D0E2E3]"
            >
              <input
                type="checkbox"
                checked={currentDraft.reminderOffsets.includes(preset.value)}
                onChange={() => toggleReminderOffset(preset.value)}
                className="h-3.5 w-3.5 rounded border-[#355C57]"
              />
              <span>{preset.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 grid gap-1">
          <label className="text-[10px] text-[#8CB9B3]">Custom reminder time</label>
          <input
            type="datetime-local"
            value={currentDraft.customReminderAt}
            onChange={(e) => updateDraft({ customReminderAt: e.target.value })}
            className={baseClassName}
          />
        </div>
      </div>

      <div className="rounded-xl border border-[#355C57]/70 bg-[#0D1C1C] px-3 py-2">
        <p className="mb-1 text-[11px] font-semibold text-[#9FD3C8]">Internal Attendees</p>
        <p className="mb-2 text-[10px] text-[#88B3B5]">
          {loadingCandidates ? "Loading organization members..." : "Search and select team members."}
        </p>
        <input
          value={internalSearch}
          onChange={(e) => setInternalSearch(e.target.value)}
          placeholder="Search by name, email, or role..."
          className={`${baseClassName} mb-2`}
        />
        {selectedInternal.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedInternal.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => toggleInternalAttendee(candidate)}
                className="inline-flex items-center gap-1 rounded-full bg-[#2D6F63] px-2.5 py-1 text-[10px] font-semibold text-white"
              >
                {candidate.name}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        <div className="max-h-32 overflow-y-auto rounded-lg border border-[#355C57]">
          {filteredCandidates.map((candidate) => {
            const selected = currentDraft.internalAttendeeIds.includes(candidate.id);
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => toggleInternalAttendee(candidate)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11px] hover:bg-white/5 ${
                  selected ? "bg-[#1B4D47]/40 text-[#B9E9DD]" : "text-[#D0E2E3]"
                }`}
              >
                <span>
                  {candidate.name} · {candidate.email}
                </span>
                <span className="text-[10px] text-[#88B3B5]">{candidate.display_role}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">External Attendees</label>
        <p className="text-[10px] text-[#88B3B5]">Press Enter or Tab to add. Click a chip to remove.</p>
        <div className="min-h-[64px] rounded-lg border border-[#355C57] bg-[#0D1C1C] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Users className="h-3.5 w-3.5 text-[#88B3B5]" />
            {currentDraft.externalEmails.map((email) => (
              <button
                key={email}
                type="button"
                onClick={() =>
                  updateDraft({
                    externalEmails: currentDraft.externalEmails.filter((item) => item !== email),
                  })
                }
                className="inline-flex items-center gap-1 rounded-full bg-[#355E73] px-2.5 py-1 text-[10px] font-semibold text-white"
              >
                {email}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <input
              value={externalEmailInput}
              onChange={(e) => setExternalEmailInput(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Tab") {
                  if (externalEmailInput.trim() !== "") {
                    event.preventDefault();
                    commitExternalEmail();
                  }
                }
              }}
              onBlur={() => commitExternalEmail()}
              placeholder={currentDraft.externalEmails.length === 0 ? "client@example.com" : "Add another email..."}
              className="min-w-[180px] flex-1 bg-transparent text-[12px] text-[#D0E2E3] outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
