"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  MapPin,
  User,
  FileText,
  CheckCircle,
  Camera,
  Calendar,
  AlertCircle,
  Navigation,
  CheckCheck,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { useCreateTask, useCreateSelfTask, useTaskAssignees } from "@/hooks/use-tasks";
import type { DndItem, TaskCategory } from "@/types/operations";
import type { ApiTaskPriority } from "@/lib/api/tasks";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getActiveCompanyContext } from "@/lib/company-context";
import { PlaceAutocompleteField } from "@/components/map/PlaceAutocompleteField";
import type { RetrievedPlace } from "@/lib/utils/place-search";

type StatusType = "pending" | "in-progress" | "completed";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask?: (containerId: StatusType, item: DndItem) => void;
  projectId?: number | string;
  mode?: "create" | "edit";
  initialValues?: Partial<{
    title: string;
    taskType: string;
    description: string;
    assignTo: string;
    location: string;
    address: string;
    dueDate: string;
    requiredActions: string;
    priority: Priority | "";
    minPhotos: string;
    visitVerification: boolean;
    status: StatusType;
  }>;
  submitLabel?: string;
  onSubmitTask?: (payload: {
    title: string;
    taskType?: string;
    description?: string;
    location?: string;
    address?: string;
    dueDate?: string;
    requiredActions?: string[];
    priority?: ApiTaskPriority;
    minPhotos?: number;
    visitVerification?: boolean;
    latitude?: number;
    longitude?: number;
  }) => void;
}

const STATUS_OPTIONS: {
  value: StatusType;
  label: string;
  color: string;
  short: string;
}[] = [
    {
      value: "pending",
      label: "Pending Task",
      color: "#BD7A22",
      short: "Pending",
    },
    {
      value: "in-progress",
      label: "In Progress",
      color: "#094B5C",
      short: "In Progress",
    },
    {
      value: "completed",
      label: "Completed",
      color: "#4FD1C5",
      short: "Completed",
    },
  ];

const TASK_TYPES: Record<string, string> = {
  "Sales Visit": "sales_visit",
  "Inspection": "inspection",
  "Delivery": "delivery",
  "Collection": "collection",
  "Awareness": "awareness",
};

const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;
type Priority = (typeof PRIORITY_OPTIONS)[number];

const PRIORITY_COLORS: Record<Priority, string> = {
  High: "#EF4444",
  Medium: "#F59E0B",
  Low: "#10B981",
};

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function InputWrap({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          {icon}
        </div>
      )}
      {children}
    </div>
  );
}

const BASE_INPUT =
  "w-full bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border transition-colors placeholder:text-gray-300";
const INPUT_CLS = (err?: string) =>
  `${BASE_INPUT} py-2.5 ${err ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`;

export function CreateTaskModal({
  isOpen,
  onClose,
  onCreateTask,
  projectId,
  mode = "create",
  initialValues,
  submitLabel,
  onSubmitTask,
}: CreateTaskModalProps) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const isAgent = role === "agent";
  const canManageTasks = role === "owner" || role === "admin" || role === "supervisor";

  const { data: assignees = [], isLoading: loadingAssignees } = useTaskAssignees(
    canManageTasks ? companyId ?? undefined : undefined,
  );

  const { mutate, isPending } = useCreateTask({
    onSuccess: () => {
      toast.success("Task created successfully.");
      handleClose();
    },
  });
  const { mutate: createSelfTask, isPending: isSelfTaskPending } = useCreateSelfTask({
    onSuccess: () => {
      toast.success("Task created successfully.");
      handleClose();
    },
  });
  const taskIdRef = useRef(0);
  const [form, setForm] = useState(() => ({
    title: initialValues?.title ?? "",
    taskType: initialValues?.taskType ?? "",
    description: initialValues?.description ?? "",
    assignTo:
      mode === "create" && canManageTasks && user?.id
        ? String(user.id)
        : initialValues?.assignTo ?? "",
    location: initialValues?.location ?? "",
    address: initialValues?.address ?? "",
    dueDate: initialValues?.dueDate ?? "",
    requiredActions: initialValues?.requiredActions ?? "",
    priority: (initialValues?.priority ?? "") as Priority | "",
    minPhotos: initialValues?.minPhotos ?? "2",
    visitVerification: initialValues?.visitVerification ?? false,
    status: (initialValues?.status ?? "pending") as StatusType,
    category: "all" as TaskCategory,
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const initializedOpenAssigneeRef = useRef(isOpen && user != null);

  useEffect(() => {
    if (!isOpen) {
      initializedOpenAssigneeRef.current = false;
      return;
    }

    if (initializedOpenAssigneeRef.current || !user) return;

    setForm((current) => ({
      ...current,
      assignTo:
        mode === "edit"
          ? initialValues?.assignTo ?? current.assignTo
          : canManageTasks && user?.id
            ? String(user.id)
            : initialValues?.assignTo ?? "",
    }));
    initializedOpenAssigneeRef.current = true;
  }, [canManageTasks, initialValues?.assignTo, isOpen, mode, user]);

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((p) => {
      const next = { ...p, [key]: val };
      if (key === "address" || key === "location") {
        setCoords(null);
        next.visitVerification = false;
      }
      return next;
    });
    setErrors((p) => ({ ...p, [key]: "" }));
  };

  const applyRetrievedPlace = (place: RetrievedPlace) => {
    setForm((p) => ({
      ...p,
      location: place.name,
      address: place.address || place.name,
    }));
    setCoords({ lat: place.lat, lng: place.lng });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Task title is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const payload = {
      title: form.title,
      taskType: form.taskType || undefined,
      description: form.description || undefined,
      location: form.location || undefined,
      address: form.address || undefined,
      dueDate: form.dueDate || undefined,
      requiredActions: form.requiredActions
        ? form.requiredActions.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      priority: form.priority ? (form.priority.toLowerCase() as ApiTaskPriority) : undefined,
      minPhotos: form.minPhotos ? Number(form.minPhotos) : undefined,
      visitVerification: coords?.lat != null && coords?.lng != null ? form.visitVerification : false,
      latitude: coords?.lat,
      longitude: coords?.lng,
    };

    if (mode === "edit" && onSubmitTask) {
      onSubmitTask(payload);
      return;
    }

    if (companyId) {
      const typeKey = TASK_TYPES[form.taskType] || "general";
      const priorityVal = form.priority.toLowerCase() as ApiTaskPriority;
      const payload = {
        company_id: companyId,
        title: form.title,
        type: form.taskType ? typeKey : undefined,
        description: form.description || undefined,
        location: form.location || undefined,
        address: form.address || undefined,
        latitude: coords?.lat,
        longitude: coords?.lng,
        due_date: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        required_actions: form.requiredActions ? form.requiredActions.split(',').map(s => s.trim()) : undefined,
        priority: form.priority ? priorityVal : undefined,
        minimum_photos_required: form.minPhotos ? Number(form.minPhotos) : undefined,
        visit_verification_required:
          coords?.lat != null && coords?.lng != null ? form.visitVerification : false,
      };
      const onError = (err: unknown) => {
        const apiErr = err as { errors?: Record<string, string[]>; message?: string };
        if (apiErr.errors) {
          const backendErrors = apiErr.errors as Record<string, string[]>;
          const mappedErrors: Record<string, string> = {};
          const ERROR_MAP: Record<string, string> = {
            type: "taskType",
            assigned_agent_id: "assignTo",
            due_date: "dueDate",
            required_actions: "requiredActions",
            minimum_photos_required: "minPhotos",
            visit_verification_required: "visitVerification"
          };

          for (const key in backendErrors) {
            const formKey = ERROR_MAP[key] || key;
            mappedErrors[formKey] = backendErrors[key][0];
          }
          setErrors(mappedErrors);
          toast.error(apiErr.message || "Please fix the validation errors");
        } else {
          toast.error(apiErr.message || "Failed to create task");
        }
      };

      if (isAgent) {
        createSelfTask(payload, { onError });
        return;
      }

      if (!canManageTasks) {
        toast.error("You are not allowed to create management tasks.");
        return;
      }

      mutate(
        {
          ...payload,
          project_id: projectId ?? undefined,
          assigned_agent_id: form.assignTo ? Number(form.assignTo) : undefined,
        },
        { onError },
      );
      return;
    }

    // Fallback to local DnD mock mode
    if (onCreateTask) {
      const newItem: DndItem = {
        id: `task-${++taskIdRef.current}`,
        label: user?.name || form.title,
        description: form.title,
        location: `${form.location}${form.address ? `, ${form.address}` : ""}`,
        time: "Just now",
        category: form.category,
        dueDate: form.dueDate,
        addedDescription: form.description,
        statusLabel: STATUS_OPTIONS.find((s) => s.value === form.status)?.short,
      };
      onCreateTask(form.status, newItem);
      handleClose();
    }
  };

  const handleClose = () => {
    setForm({
      title: "",
      taskType: "",
      description: "",
      assignTo: "",
      location: "",
      address: "",
      dueDate: "",
      requiredActions: "",
      priority: "",
      minPhotos: "2",
      visitVerification: false,
      status: "pending",
      category: "all",
    });
    setErrors({});
    setCoords(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-white/40" onClick={handleClose} />

      <div className="absolute right-12 bottom-3.25 bg-white rounded-[28px] w-full max-w-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
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
            {mode === "edit" ? "Edit Task" : "Create New"}
            {mode === "edit" ? "" : <><br />Task</>}
          </h2>
          <button
            onClick={handleClose}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Task Title */}
          <div>
            <FieldLabel required>Task Title</FieldLabel>
            <InputWrap icon={<FileText size={13} />}>
              <input
                type="text"
                placeholder="e.g. Visit Shoprite Lekki"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={`${INPUT_CLS(errors.title)} pl-9 pr-4`}
              />
            </InputWrap>
            {errors.title && (
              <p className="text-red-400 text-[11px] mt-1">{errors.title}</p>
            )}
          </div>

          {/* Task Type */}
          <div>
            <FieldLabel required>Task Type</FieldLabel>
            <SearchableSelect
              value={form.taskType}
              onChange={(v) => set("taskType", v)}
              options={Object.keys(TASK_TYPES).map((t) => ({ value: t, label: t }))}
              placeholder="Select task type"
              className={`${INPUT_CLS(errors.taskType)} px-4 cursor-pointer`}
            />
            {errors.taskType && (
              <p className="text-red-400 text-[11px] mt-1">{errors.taskType}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <FieldLabel required>Description</FieldLabel>
            <textarea
              placeholder="e.g. Check stock and speak to manager"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className={`${BASE_INPUT} py-2.5 px-4 resize-none ${errors.description ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
            />
            {errors.description && (
              <p className="text-red-400 text-[11px] mt-1">
                {errors.description}
              </p>
            )}
          </div>

          {/* Assign To — managers only */}
          {canManageTasks && (
            <div>
              <FieldLabel required>Assign To</FieldLabel>
              <SearchableSelect
                value={form.assignTo}
                onChange={(v) => set("assignTo", v)}
                options={
                  loadingAssignees
                    ? []
                    : assignees.map((assignee) => ({
                        value: assignee.id.toString(),
                        label: assignee.name,
                      }))
                }
                placeholder={loadingAssignees ? "Loading…" : "Select user"}
                leftIcon={<User size={13} className="text-gray-400" />}
                className={`${INPUT_CLS(errors.assignTo)} pl-9 pr-4 cursor-pointer`}
              />
              {errors.assignTo && (
                <p className="text-red-400 text-[11px] mt-1">{errors.assignTo}</p>
              )}
            </div>
          )}

          {/* Location + Address */}
          <div className="relative">
            <FieldLabel>Location (optional)</FieldLabel>
            <InputWrap icon={<MapPin size={13} />}>
              <PlaceAutocompleteField
                value={form.location}
                onChange={(next) => set("location", next)}
                onPlaceSelect={applyRetrievedPlace}
                placeholder="e.g. Lekki Phase 1"
                inputClassName={`${INPUT_CLS(errors.location)} pl-9 pr-4`}
              />
            </InputWrap>
            {errors.location && (
              <p className="text-red-400 text-[11px] mt-1">{errors.location}</p>
            )}
          </div>

          <div className="relative">
            <FieldLabel>
              Address{" "}
              <span className="text-gray-400 normal-case font-normal">
                (for arrival detection)
              </span>
            </FieldLabel>
            <InputWrap
              icon={
                coords ? (
                  <CheckCheck size={13} className="text-green-500" />
                ) : (
                  <Navigation size={13} />
                )
              }
            >
              <PlaceAutocompleteField
                value={form.address}
                onChange={(next) => set("address", next)}
                onPlaceSelect={applyRetrievedPlace}
                placeholder="e.g. Admiralty Way, Lekki Phase 1, Lagos"
                inputClassName={`${INPUT_CLS()} pl-9 pr-4`}
              />
            </InputWrap>
            {coords ? (
              <p className="text-[10px] text-green-600 mt-1 font-medium">
                GPS locked: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            ) : (form.address.trim().length >= 2 || form.location.trim().length >= 2) ? (
              <p className="text-[10px] text-amber-700 mt-1">
                Pick a suggestion to lock map coordinates for arrival detection.
              </p>
            ) : null}
          </div>

          {/* Due Date + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Due Date</FieldLabel>
              <InputWrap icon={<Calendar size={13} />}>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                  className={`${INPUT_CLS(errors.dueDate)} pl-9 pr-4`}
                />
              </InputWrap>
              {errors.dueDate && (
                <p className="text-red-400 text-[11px] mt-1">
                  {errors.dueDate}
                </p>
              )}
            </div>

            <div>
              <FieldLabel required>Priority</FieldLabel>
              <SearchableSelect
                value={form.priority}
                onChange={(v) => set("priority", v as Priority)}
                options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
                placeholder="Select"
                leftIcon={
                  form.priority ? (
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: PRIORITY_COLORS[form.priority as Priority] }}
                    />
                  ) : (
                    <AlertCircle size={13} className="text-gray-400" />
                  )
                }
                className={`${INPUT_CLS(errors.priority)} pl-9 pr-4 cursor-pointer`}
              />
              {errors.priority && (
                <p className="text-red-400 text-[11px] mt-1">
                  {errors.priority}
                </p>
              )}
            </div>
          </div>

          {/* Required Actions */}
          <div>
            <FieldLabel>Required Actions</FieldLabel>
            <textarea
              placeholder="e.g. Take photos, confirm stock"
              value={form.requiredActions}
              onChange={(e) => set("requiredActions", e.target.value)}
              rows={2}
              className={`${BASE_INPUT} py-2.5 px-4 resize-none border-gray-200 focus:border-[#094B5C]`}
            />
          </div>

          {/* Upload Requirement + Visit Verification */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Upload Requirement</FieldLabel>
              <InputWrap icon={<Camera size={13} />}>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={form.minPhotos}
                  onChange={(e) => set("minPhotos", e.target.value)}
                  className={`${INPUT_CLS()} pl-9 pr-4`}
                />
              </InputWrap>
              <p className="text-[10px] text-gray-400 mt-1">
                Minimum photos required
              </p>
            </div>

            <div>
              <FieldLabel>Visit Verification</FieldLabel>
              <div
                onClick={() => {
                  if (!coords) return;
                  set("visitVerification", !form.visitVerification);
                }}
                className={`mt-1 flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all select-none ${
                  !coords
                    ? "bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed"
                    : form.visitVerification
                      ? "bg-[#09232d] border-[#0B1215] cursor-pointer"
                      : "bg-gray-50 border-gray-200 hover:border-gray-300 cursor-pointer"
                }`}
              >
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.visitVerification ? "bg-white/20" : "bg-gray-300"}`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all ${form.visitVerification
                        ? "left-4 bg-white"
                        : "left-0.5 bg-white"
                      }`}
                  />
                </div>
                <span
                  className={`text-[12px] font-bold ${form.visitVerification ? "text-white" : "text-gray-500"}`}
                >
                  {form.visitVerification ? "ON" : "OFF"}
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Requires a geocoded address with map coordinates.
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 pt-3 space-y-3">
            {/* Task Status */}
            <div>
              <FieldLabel>Initial Status</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("status", opt.value)}
                    className={`py-2.5 px-2 rounded-xl text-[11px] font-bold transition-all border-2 ${form.status === opt.value
                        ? "text-white shadow-md border-transparent"
                        : "text-gray-500 border-gray-200 bg-gray-50 hover:border-gray-300"
                      }`}
                    style={
                      form.status === opt.value
                        ? { backgroundColor: opt.color, borderColor: opt.color }
                        : {}
                    }
                  >
                    {opt.short}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            {/* <div>
              <FieldLabel>Category</FieldLabel>
              <div className="flex gap-2">
                {CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('category', opt.value)}
                    className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold transition-all border-2 ${
                      form.category === opt.value
                        ? 'bg-[#09232d] text-white border-[#0B1215]'
                        : 'text-gray-500 border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div> */}
          </div>
        </div>

        <div className="px-7 py-5 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={isPending || isSelfTaskPending}
            className="w-fit px-9.25 py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isPending || isSelfTaskPending ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <CheckCircle size={15} />
            )}
            {isPending || isSelfTaskPending
              ? mode === "edit"
                ? "Saving..."
                : "Creating..."
              : submitLabel ?? (mode === "edit" ? "Save Changes" : "Create Task")}
          </button>
        </div>
      </div>
    </div>
  );
}
