import { describe, expect, it } from "vitest";

import { buildMeetingActionArgs } from "@/components/dashboard/ely-meeting-action-fields";
import type { MeetingAttendeeCandidate } from "@/lib/api/meeting-attendees";

const candidates: MeetingAttendeeCandidate[] = [
  {
    id: 7,
    name: "David Test",
    email: "david@factory23.test",
    company_role: "agent",
    display_role: "Agent",
    is_active: true,
  },
];

describe("buildMeetingActionArgs", () => {
  it("merges internal and external attendees without duplicates", () => {
    const args = buildMeetingActionArgs(
      {
        title: "Q3 Sales Performance Review Meeting",
        description: "Review Q3 sales performance and align on next steps.",
        start_at: "2026-06-19T14:00",
        end_at: "2026-06-19T15:00",
        location: "Google Meet",
        timezone: "Africa/Lagos",
        internalAttendeeIds: [7],
        externalEmails: ["client@example.com", "david@factory23.test"],
        reminderOffsets: [15, 60],
        customReminderAt: "",
      },
      candidates,
    );

    expect(args.title).toBe("Q3 Sales Performance Review Meeting");
    expect(args.description).toContain("Review Q3 sales performance");
    expect(args.timezone).toBe("Africa/Lagos");
    expect(Array.isArray(args.attendees)).toBe(true);
    expect((args.attendees as Array<{ email: string }>).length).toBe(2);
    expect((args.reminders as Array<{ offset_minutes: number }>).length).toBe(2);
  });
});
