import { describe, expect, it } from "vitest";
import { buildTaskActionArgs, buildTaskDraftFromArgs } from "@/components/dashboard/ely-task-action-fields";

describe("ely-task-action-fields", () => {
  it("builds drafts with prefilled location and clears coords until place selection", () => {
    const draft = buildTaskDraftFromArgs({
      title: "Visit client",
      type: "sales_visit",
      description: "Visit the client and log outcomes.",
      due_date: "2026-07-20T17:00:00.000Z",
      location: "Lekki Phase II",
      address: "Lekki Phase II",
      assigned_agent_id: 42,
    }, [{ id: 42, name: "Taraji Henson", email: "taraji@example.com" }]);

    expect(draft.title).toBe("Visit client");
    expect(draft.location).toBe("Lekki Phase II");
    expect(draft.assignee).toBe("taraji@example.com");
    expect(draft.latitude).toBeNull();
    expect(draft.longitude).toBeNull();
  });

  it("propagates coordinates after place selection and clears them on free typing", () => {
    const withCoords = buildTaskActionArgs({
      title: "Visit client",
      type: "sales_visit",
      description: "Visit the client and log outcomes.",
      due_date: "2026-07-20T17:00",
      assignee: "taraji@example.com",
      location: "Lekki Phase II",
      address: "Lekki Phase II, Lagos",
      priority: "high",
      required_actions: "photo, signature",
      minimum_photos_required: "2",
      visit_verification_required: true,
      latitude: 6.44,
      longitude: 3.48,
    });

    expect(withCoords.latitude).toBe(6.44);
    expect(withCoords.longitude).toBe(3.48);
    expect(withCoords.required_actions).toEqual(["photo", "signature"]);
    expect(withCoords.visit_verification_required).toBe(true);
    expect(withCoords.assignee).toBe("taraji@example.com");

    const cleared = buildTaskActionArgs({
      title: "Visit client",
      type: "sales_visit",
      description: "Visit the client and log outcomes.",
      due_date: "2026-07-20T17:00",
      assignee: "taraji@example.com",
      location: "Lekki Phase II typed",
      address: "Lekki Phase II typed",
      priority: "high",
      required_actions: "photo, signature",
      minimum_photos_required: "2",
      visit_verification_required: true,
      latitude: null,
      longitude: null,
    });

    expect(cleared.latitude).toBeUndefined();
    expect(cleared.longitude).toBeUndefined();
    expect(cleared.visit_verification_required).toBe(false);
  });
});
