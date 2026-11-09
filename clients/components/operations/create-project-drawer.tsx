"use client";

import { useState } from "react";
import { X, ChevronDown, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateProject, useUpdateProject, useInternalUsers } from "@/hooks/use-projects";
import type { Project } from "@/types/operations";
import { useAuthStore } from "@/store/auth";
import type { ApiProjectType, ApiProjectStatus, ApiProjectPriority } from "@/lib/api/projects";
import { getActiveCompanyContext } from "@/lib/company-context";
import { SearchableSelect } from "@/components/ui/searchable-select";

const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;
const STATUS_OPTIONS = ["In progress", "Pending", "Completed"] as const;
const CATEGORY_OPTIONS = [
  "Outreach",
  "Sales",
  "Inspection",
  "Delivery",
  "Awareness",
  "Other",
];

type Priority = (typeof PRIORITY_OPTIONS)[number];
type Status = (typeof STATUS_OPTIONS)[number];

const EMPTY = {
  name: "",
  description: "",
  category: "",
  lead: "",        // will store user ID as string
  assignedTeam: "",
  territoryZone: "",
  notes: "",
  startDate: "",
  deadline: "",
  priority: "" as Priority | "",
  status: "In progress" as Status,
  trackAttendance: true,
  commissionEnabled: false,
};

const FIELD =
  "w-full bg-[#F6F6F6] border border-gray-200 rounded-2xl px-4 py-3.5 text-[13px] text-[#09232D] outline-none focus:ring-2 focus:ring-[#09232D]/10 focus:border-[#09232D]/30 transition-all placeholder:text-gray-300";
const LABEL = "text-[12px] font-medium text-[#6B7280] w-full sm:w-28 sm:shrink-0";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
      <span className={LABEL}>{label}</span>
      <div className="flex-1 w-full">{children}</div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[11px] font-semibold text-gray-400 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

const TYPE_MAP: Record<string, ApiProjectType | undefined> = {
  Sales: "sales",
  Inspection: "inspection",
  Deployment: "deployment",
};

const STATUS_MAP: Record<string, ApiProjectStatus> = {
  "In progress": "active",
  Pending: "planning",
  Completed: "completed",
};

const PRIORITY_MAP: Record<string, ApiProjectPriority> = {
  High: "high",
  Medium: "medium",
  Low: "low",
};

export function CreateProjectDrawer({ 
  onClose,
  projectToEdit
}: { 
  onClose: () => void;
  projectToEdit?: Project;
}) {
  const [form, setForm] = useState(() => {
    if (!projectToEdit) return EMPTY;
    const category = Object.entries(TYPE_MAP).find(([, v]) => v === projectToEdit.type)?.[0] || "";
    return {
      name: projectToEdit.name,
      description: projectToEdit.description || "",
      category,
      lead: projectToEdit.manager?.id ? String(projectToEdit.manager.id) : "",
      assignedTeam: "",
      territoryZone: "",
      notes: "",
      startDate: projectToEdit.startDate?.split("T")[0] || "",
      deadline: projectToEdit.endDate?.split("T")[0] || "",
      priority: (projectToEdit.priority || "") as Priority | "",
      status: projectToEdit.status as Status,
      trackAttendance: true,
      commissionEnabled: false,
    };
  });

  const set = <K extends keyof typeof EMPTY>(key: K, val: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  // Get company_id from auth store (populated by /me endpoint)
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const canManageProjects = role === "owner" || role === "admin" || role === "supervisor";

  // Fetch supervisors for the project lead dropdown
  const { data: supervisors = [], isLoading: loadingSupervisors } = useInternalUsers({
    role: "supervisor",
  });

  const { mutate: createMutate, isPending: isCreating } = useCreateProject({
    onSuccess: () => {
      toast.success("Project created successfully.");
      onClose();
    },
  });

  const { mutate: updateMutate, isPending: isUpdating } = useUpdateProject(
    projectToEdit?.id || "",
    {
      onSuccess: () => {
        toast.success("Project updated successfully.");
        onClose();
      },
    }
  );

  const isPending = isCreating || isUpdating;
  const [attachments, setAttachments] = useState<File[]>([]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!companyId) {
      toast.error("Company context not found. Please log in again.");
      return;
    }
    if (!canManageProjects) {
      toast.error("You are not allowed to create or update projects.");
      return;
    }

    if (!form.startDate) {
      toast.error("Please select a start date.");
      return;
    }

    const payload = {
      name: form.name,
      description: form.description || undefined,
      type: TYPE_MAP[form.category] ?? null,
      status: STATUS_MAP[form.status] ?? "active",
      priority: form.priority ? PRIORITY_MAP[form.priority] ?? null : null,
      start_date: form.startDate,
      end_date: form.deadline || null,
      project_manager_user_id: form.lead ? Number(form.lead) : null,
      assigned_team: form.assignedTeam
        ? form.assignedTeam
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => !Number.isNaN(item))
        : [],
      territory_zone: form.territoryZone || null,
      notes: form.notes || null,
    };

    if (projectToEdit) {
      updateMutate(
        {
          ...payload,
          attachments,
        },
        {
          onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : "Failed to update project.";
            toast.error(message);
          },
        }
      );
    } else {
      createMutate(
        { ...payload, company_id: companyId, attachments },
        {
          onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : "Failed to create project.";
            toast.error(message);
          },
        }
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-end justify-center sm:justify-end p-0 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 cursor-pointer" 
        onClick={onClose} 
      />

      <div className="relative bg-white rounded-t-[28px] sm:rounded-[28px] w-full sm:w-[440px] shadow-[0px_8px_32px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[calc(100vh-80px)] transition-all duration-300 ease-out">
        <div className="bg-transparent h-18 relative overflow-hidden flex items-center px-7 shrink-0">
          <div className="absolute top-0 right-0 w-[50%] h-full pointer-events-none">
            <svg
              viewBox="0 0 200 72"
              fill="none"
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <path
                d="M0 0 C60 24, 20 48, 190 72 L200 92 L200 0 Z"
                fill="#09232D"
              />
            </svg>
          </div>
          <h2 className="text-[18px] font-bold text-dash-dark relative z-10 leading-tight">
            {projectToEdit ? "Edit" : "Create New"}
            <br />
            Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Form body ─────────────────────────────────────── */}
        <form
          id="create-project-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-7 py-2 space-y-5"
        >
          <Divider label="Project Details" />

          {/* Name */}
          <Row label="Project Name">
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Product Outreach"
              className={FIELD}
            />
          </Row>

          {/* Description */}
          <Row label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Briefly describe the project..."
              className={`${FIELD} resize-none`}
            />
          </Row>

          {/* Category */}
          <Row label="Category">
            <SearchableSelect
              value={form.category}
              onChange={(v) => set("category", v)}
              options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
              placeholder="Select category"
              className={`${FIELD} pr-4 cursor-pointer`}
            />
          </Row>

          {/* Project Lead — populated from internal-users API */}
          <Row label="Project Lead">
            <SearchableSelect
              value={form.lead}
              onChange={(v) => set("lead", v)}
              options={loadingSupervisors ? [] : supervisors.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder={loadingSupervisors ? "Loading leads…" : supervisors.length === 0 ? "No supervisors available" : "Assign a lead"}
              leftIcon={<User size={13} className="text-gray-400" />}
              className={`${FIELD} pl-9 pr-4 cursor-pointer`}
            />
          </Row>

          <Row label="Assigned Team IDs">
            <input
              value={form.assignedTeam}
              onChange={(e) => set("assignedTeam", e.target.value)}
              placeholder="Comma-separated IDs (e.g. 25,31)"
              className={FIELD}
            />
          </Row>

          <Row label="Territory Zone">
            <input
              value={form.territoryZone}
              onChange={(e) => set("territoryZone", e.target.value)}
              placeholder="E.g Lagos Mainland"
              className={FIELD}
            />
          </Row>

          <Row label="Notes">
            <input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional notes"
              className={FIELD}
            />
          </Row>

          <Row label="Attachments">
            <div className="space-y-2">
              <label className="flex flex-col items-center justify-center w-full h-20 border border-dashed border-gray-300 rounded-2xl cursor-pointer bg-[#F6F6F6] hover:bg-gray-100/50 hover:border-gray-400 transition-colors">
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <span className="text-[12px] font-medium text-gray-600">
                    Click to select files
                  </span>
                  <span className="text-[10px] text-gray-400 mt-0.5">
                    Multiple files supported
                  </span>
                </div>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
                  className="hidden"
                />
              </label>
              {attachments.length > 0 && (
                <div className="text-[11px] text-[#09232D] max-h-20 overflow-y-auto space-y-1">
                  {attachments.map((file, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-gray-100 rounded px-2 py-0.5">
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Row>

          <Divider label="Timeline" />

          {/* Start Date */}
          <Row label="Start Date">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              className={FIELD}
            />
          </Row>

          {/* Deadline */}
          <Row label="Deadline">
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => set("deadline", e.target.value)}
              min={form.startDate || undefined}
              className={FIELD}
            />
          </Row>

          {/* Priority */}
          <Row label="Priority">
            <SearchableSelect
              value={form.priority}
              onChange={(v) => set("priority", v as Priority)}
              options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
              placeholder="Select priority"
              className={`${FIELD} pr-4 cursor-pointer`}
            />
          </Row>

          {/* Status */}
          <Row label="Status">
            <SearchableSelect
              value={form.status}
              onChange={(v) => set("status", v as Status)}
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
              className={`${FIELD} pr-4 cursor-pointer`}
            />
          </Row>

          {/* <Divider label="Settings" /> */}

          {/* <Row label="Track Attendance">
            <Toggle
              checked={form.trackAttendance}
              onChange={() => set("trackAttendance", !form.trackAttendance)}
            />
          </Row>

          <Row label="Commission">
            <Toggle
              checked={form.commissionEnabled}
              onChange={() => set("commissionEnabled", !form.commissionEnabled)}
            />
          </Row> */}
        </form>

        <div className="px-7 py-5 sm:py-4 shrink-0 border-t border-gray-100 bg-white">
          <button
            type="submit"
            form="create-project-form"
            disabled={isPending}
            className="w-full sm:w-auto px-9.25 py-3 sm:py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>{projectToEdit ? "Updating..." : "Creating..."}</span>
              </>
            ) : (
              projectToEdit ? "Save Changes" : "Create Project"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
