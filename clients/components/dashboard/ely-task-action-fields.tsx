"use client";

import { useEffect, useMemo } from "react";
import { CheckCheck, MapPin, Navigation } from "lucide-react";
import { PlaceAutocompleteField } from "@/components/map/PlaceAutocompleteField";
import type { RetrievedPlace } from "@/lib/utils/place-search";

export type ElyTaskDraft = {
  title: string;
  type: string;
  description: string;
  due_date: string;
  assignee: string;
  location: string;
  address: string;
  priority: string;
  required_actions: string;
  minimum_photos_required: string;
  visit_verification_required: boolean;
  latitude: number | null;
  longitude: number | null;
};

export type ElyTaskAssigneeOption = {
  id: number;
  name: string;
  email: string;
};

type ElyTaskActionFieldsProps = {
  msgId: string;
  args: Record<string, unknown>;
  draft: ElyTaskDraft | undefined;
  onDraftChange: (msgId: string, draft: ElyTaskDraft) => void;
  assigneeOptions: ElyTaskAssigneeOption[];
  loadingAssignees?: boolean;
  isAgent?: boolean;
};

const TASK_TYPE_OPTIONS = [
  { value: "inspection", label: "Inspection" },
  { value: "sales_visit", label: "Sales Visit" },
  { value: "delivery", label: "Delivery" },
  { value: "collection", label: "Collection" },
  { value: "awareness", label: "Awareness" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

const INPUT_CLASS =
  "w-full rounded-lg border border-[#355C57] bg-[#0D1C1C] px-2.5 py-2 text-[12px] text-[#D0E2E3] outline-none focus:border-[#4F8C83]";

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

function asNumberOrNull(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return null;
}

function requiredActionsToString(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  if (typeof raw === "string") return raw;
  return "";
}

/**
 * Drafts can be seeded before assignee options load, leaving a raw user ID
 * (e.g. "38") as the assignee token. Once options arrive, upgrade it to the
 * matching option's email so the select shows the user's name.
 */
function upgradeNumericAssignee(value: string, assigneeOptions: ElyTaskAssigneeOption[]): string {
  const trimmed = value.trim();
  if (trimmed.includes(",")) {
    return trimmed.split(",").map((token) => upgradeNumericAssignee(token, assigneeOptions)).join(", ");
  }
  if (trimmed === "" || !/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  const matched = assigneeOptions.find((item) => item.id === Number(trimmed));
  return matched?.email ?? trimmed;
}

function resolveAssigneeSeed(
  args: Record<string, unknown>,
  assigneeOptions: ElyTaskAssigneeOption[],
): string {
  if (Array.isArray(args.assigned_agent_ids) && args.assigned_agent_ids.length > 0) {
    const emails = args.assigned_agent_ids
      .map((id) => {
        const matched = assigneeOptions.find((item) => item.id === Number(id));
        return matched?.email ?? String(id);
      })
      .filter(Boolean);
    return emails.join(", ");
  }

  if (typeof args.assignee === "string" && args.assignee.trim() !== "") {
    const tokens = args.assignee.split(",").map((t) => t.trim()).filter(Boolean);
    const upgraded = tokens.map((token) => upgradeNumericAssignee(token, assigneeOptions));
    return upgraded.join(", ");
  }

  const assignedId = asNumberOrNull(args.assigned_agent_id);
  if (assignedId !== null) {
    const matched = assigneeOptions.find((item) => item.id === assignedId);
    return matched?.email ?? String(assignedId);
  }

  return "";
}

export function buildTaskDraftFromArgs(
  args: Record<string, unknown>,
  assigneeOptions: ElyTaskAssigneeOption[] = [],
  existing?: ElyTaskDraft,
): ElyTaskDraft {
  return {
    title: existing?.title ?? String(args.title ?? ""),
    type: existing?.type ?? String(args.type ?? "inspection"),
    description: existing?.description ?? String(args.description ?? ""),
    due_date: existing?.due_date ?? asDateTimeLocalInputValue(args.due_date),
    assignee: existing !== undefined
      ? upgradeNumericAssignee(existing.assignee, assigneeOptions)
      : resolveAssigneeSeed(args, assigneeOptions),
    location: existing?.location ?? String(args.location ?? ""),
    address: existing?.address ?? String(args.address ?? ""),
    priority: existing?.priority ?? String(args.priority ?? ""),
    required_actions: existing?.required_actions ?? requiredActionsToString(args.required_actions),
    minimum_photos_required:
      existing?.minimum_photos_required
      ?? (args.minimum_photos_required != null ? String(args.minimum_photos_required) : ""),
    visit_verification_required:
      existing?.visit_verification_required
      ?? (args.visit_verification_required === true || args.visit_verification_required === "true"),
    latitude: existing?.latitude ?? asNumberOrNull(args.latitude),
    longitude: existing?.longitude ?? asNumberOrNull(args.longitude),
  };
}

export function buildTaskActionArgs(draft: ElyTaskDraft): Record<string, unknown> {
  const requiredActions = draft.required_actions
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const minPhotos = draft.minimum_photos_required.trim();
  const hasCoords =
    typeof draft.latitude === "number"
    && typeof draft.longitude === "number"
    && Number.isFinite(draft.latitude)
    && Number.isFinite(draft.longitude);

  const payload: Record<string, unknown> = {
    title: draft.title.trim(),
    type: draft.type.trim(),
    description: draft.description.trim(),
    location: draft.location.trim(),
    address: draft.address.trim(),
  };

  if (draft.due_date.trim() !== "") {
    const parsed = new Date(draft.due_date);
    if (!Number.isNaN(parsed.getTime())) {
      payload.due_date = parsed.toISOString();
    } else {
      payload.due_date = draft.due_date.trim();
    }
  }

  if (draft.assignee.trim() !== "") {
    payload.assignee = draft.assignee.trim();
  }

  if (draft.priority.trim() !== "") {
    payload.priority = draft.priority.trim();
  }

  if (requiredActions.length > 0) {
    payload.required_actions = requiredActions;
  }

  if (minPhotos !== "" && !Number.isNaN(Number(minPhotos))) {
    payload.minimum_photos_required = Number(minPhotos);
  }

  if (hasCoords) {
    payload.latitude = draft.latitude;
    payload.longitude = draft.longitude;
    payload.visit_verification_required = draft.visit_verification_required;
  } else {
    payload.visit_verification_required = false;
  }

  return payload;
}

export function ElyTaskActionFields({
  msgId,
  args,
  draft,
  onDraftChange,
  assigneeOptions,
  loadingAssignees = false,
  isAgent = false,
}: ElyTaskActionFieldsProps) {
  const currentDraft = useMemo(
    () => buildTaskDraftFromArgs(args, assigneeOptions, draft),
    [args, assigneeOptions, draft],
  );

  useEffect(() => {
    // Seed the draft on first render, and re-sync when late-loading assignee
    // options upgrade a numeric ID placeholder to the resolved user email.
    if (!draft || draft.assignee !== currentDraft.assignee) {
      onDraftChange(msgId, currentDraft);
    }
  }, [currentDraft, draft, msgId, onDraftChange]);

  function updateDraft(patch: Partial<ElyTaskDraft>) {
    onDraftChange(msgId, { ...currentDraft, ...patch });
  }

  function applyRetrievedPlace(place: RetrievedPlace) {
    updateDraft({
      location: place.name,
      address: place.address || place.name,
      latitude: place.lat,
      longitude: place.lng,
    });
  }

  const hasCoords =
    typeof currentDraft.latitude === "number"
    && typeof currentDraft.longitude === "number";

  return (
    <div className="grid grid-cols-1 gap-2">
      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">Title</label>
        <input
          type="text"
          value={currentDraft.title}
          onChange={(e) => updateDraft({ title: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <label className="text-[11px] text-[#8CB9B3]">Type</label>
          <select
            value={currentDraft.type}
            onChange={(e) => updateDraft({ type: e.target.value })}
            className={INPUT_CLASS}
          >
            {TASK_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-[11px] text-[#8CB9B3]">Priority</label>
          <select
            value={currentDraft.priority}
            onChange={(e) => updateDraft({ priority: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="">Select priority</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">Description</label>
        <textarea
          value={currentDraft.description}
          onChange={(e) => updateDraft({ description: e.target.value })}
          rows={3}
          className={`${INPUT_CLASS} resize-none`}
        />
      </div>

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">Due Date</label>
        <input
          type="datetime-local"
          value={currentDraft.due_date}
          onChange={(e) => updateDraft({ due_date: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>

      {!isAgent && (
        <div className="grid gap-1">
          <label className="text-[11px] text-[#8CB9B3]">Assignees</label>
          <select
            multiple={true}
            value={currentDraft.assignee.split(",").map((t) => t.trim()).filter(Boolean)}
            onChange={(e) => {
              const selectedValues = Array.from(e.target.selectedOptions, (option) => option.value);
              updateDraft({ assignee: selectedValues.join(", ") });
            }}
            className={`${INPUT_CLASS} h-24`}
          >
            {assigneeOptions.map((option) => (
              <option key={option.id} value={option.email}>
                {option.name}
              </option>
            ))}
          </select>
          <p className="text-[9px] text-[#8CB9B3]/50">Hold Cmd/Ctrl to select multiple agents.</p>
        </div>
      )}

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3] inline-flex items-center gap-1">
          <MapPin size={11} /> Location
        </label>
        <PlaceAutocompleteField
          value={currentDraft.location}
          onChange={(next) =>
            updateDraft({
              location: next,
              latitude: null,
              longitude: null,
              visit_verification_required: false,
            })}
          onPlaceSelect={applyRetrievedPlace}
          placeholder="e.g. Lekki Phase 1"
          inputClassName={INPUT_CLASS}
        />
      </div>

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3] inline-flex items-center gap-1">
          {hasCoords ? <CheckCheck size={11} className="text-emerald-400" /> : <Navigation size={11} />}
          Address
        </label>
        <PlaceAutocompleteField
          value={currentDraft.address}
          onChange={(next) =>
            updateDraft({
              address: next,
              latitude: null,
              longitude: null,
              visit_verification_required: false,
            })}
          onPlaceSelect={applyRetrievedPlace}
          placeholder="Search exact address or place"
          inputClassName={INPUT_CLASS}
        />
        {hasCoords ? (
          <p className="text-[10px] text-emerald-300">
            GPS locked: {currentDraft.latitude!.toFixed(5)}, {currentDraft.longitude!.toFixed(5)}
          </p>
        ) : (currentDraft.address.trim().length >= 2 || currentDraft.location.trim().length >= 2) ? (
          <p className="text-[10px] text-amber-200">
            Pick a suggestion to lock map coordinates for arrival detection.
          </p>
        ) : null}
      </div>

      <div className="grid gap-1">
        <label className="text-[11px] text-[#8CB9B3]">Required Actions</label>
        <input
          type="text"
          value={currentDraft.required_actions}
          onChange={(e) => updateDraft({ required_actions: e.target.value })}
          placeholder="Comma-separated checklist items"
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <label className="text-[11px] text-[#8CB9B3]">Min Photos</label>
          <input
            type="number"
            min={0}
            max={20}
            value={currentDraft.minimum_photos_required}
            onChange={(e) => updateDraft({ minimum_photos_required: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-[11px] text-[#8CB9B3]">Visit Verification</label>
          <select
            value={currentDraft.visit_verification_required ? "true" : "false"}
            disabled={!hasCoords}
            onChange={(e) => updateDraft({ visit_verification_required: e.target.value === "true" })}
            className={INPUT_CLASS}
          >
            <option value="false">Off</option>
            <option value="true">Required</option>
          </select>
        </div>
      </div>
    </div>
  );
}
