"use client";

import { useCallback, useMemo, useState } from "react";
import { Calendar, FileText, MapPin, Navigation, User, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { useInternalUsers } from "@/hooks/use-projects";
import { useCreateSelfTask, useCreateTask } from "@/hooks/use-tasks";
import { getActiveCompanyContext } from "@/lib/company-context";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PlaceAutocompleteField } from "@/components/map/PlaceAutocompleteField";
import type { RetrievedPlace } from "@/lib/utils/place-search";
import type { TaskApiItem } from "@/lib/api/tasks";

type ScheduleTaskModalProps = {
    isOpen: boolean;
    onClose: () => void;
    defaultDate?: Date;
    title?: string;
    onCreated?: (task: TaskApiItem) => void;
};

type FormState = {
    taskDescription: string;
    assignTo: string;
    location: string;
    address: string;
    dueDate: string;
};

function toInputDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultDueDate(selectedDate?: Date): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (selectedDate) {
        const normalizedSelectedDate = new Date(selectedDate);
        normalizedSelectedDate.setHours(0, 0, 0, 0);
        tomorrow.setHours(0, 0, 0, 0);

        if (normalizedSelectedDate > tomorrow) {
            return toInputDate(normalizedSelectedDate);
        }
    }

    return toInputDate(tomorrow);
}

function roleCanDelegate(role: string | null): boolean {
    return role === "owner" || role === "admin" || role === "management" || role === "manager";
}

export function ScheduleTaskModal({
    isOpen,
    onClose,
    defaultDate,
    title = "Schedule Task",
    onCreated,
}: ScheduleTaskModalProps) {
    const user = useAuthStore((state) => state.user);
    const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
    const canDelegate = roleCanDelegate(role);

    const { data: agents = [], isLoading: loadingAgents } = useInternalUsers({ role: "agent" });
    const createTaskMutation = useCreateTask();
    const createSelfTaskMutation = useCreateSelfTask();

    const [form, setForm] = useState<FormState>({
        taskDescription: "",
        assignTo: "",
        location: "",
        address: "",
        dueDate: defaultDueDate(defaultDate),
    });
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [wasOpen, setWasOpen] = useState(false);

    const isSubmitting = createTaskMutation.isPending || createSelfTaskMutation.isPending;

    if (isOpen && !wasOpen) {
        setWasOpen(true);
        setForm({
            taskDescription: "",
            assignTo: "",
            location: "",
            address: "",
            dueDate: defaultDueDate(defaultDate),
        });
        setCoords(null);
        setErrors({});
    } else if (!isOpen && wasOpen) {
        setWasOpen(false);
    }

    const dueDateIso = useMemo(() => {
        const fallbackDate = defaultDueDate(defaultDate);
        const dateString = form.dueDate || fallbackDate;
        const date = new Date(`${dateString}T09:00:00`);

        if (Number.isNaN(date.getTime())) {
            return new Date(`${fallbackDate}T09:00:00`).toISOString();
        }

        return date.toISOString();
    }, [defaultDate, form.dueDate]);

    const validate = useCallback((): boolean => {
        const nextErrors: Record<string, string> = {};

        if (!form.taskDescription.trim()) {
            nextErrors.taskDescription = "Task description is required.";
        }

        if (canDelegate && !form.assignTo) {
            nextErrors.assignTo = "Select an agent for this task.";
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    }, [canDelegate, form.assignTo, form.taskDescription]);

    const applyRetrievedPlace = useCallback((place: RetrievedPlace) => {
        setForm((previous) => ({
            ...previous,
            location: place.name,
            address: place.address || place.name,
        }));
        setCoords({ lat: place.lat, lng: place.lng });
        setErrors((previous) => ({ ...previous, location: "", address: "" }));
    }, []);

    const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((previous) => ({ ...previous, [key]: value }));
        setErrors((previous) => ({ ...previous, [key]: "" }));
        if (key === "address" || key === "location") {
            setCoords(null);
        }
    };

    const handleSubmit = () => {
        if (!validate()) {
            return;
        }

        if (!companyId) {
            toast.error("Company context is required.");
            return;
        }

        const handleTaskSuccess = (task: TaskApiItem) => {
            toast.success("Task scheduled successfully.");
            onCreated?.(task);
            onClose();
        };

        const onError = (error: unknown) => {
            const apiError = error as { message?: string; errors?: Record<string, string[]> };
            if (apiError.errors) {
                const mapped: Record<string, string> = {};
                if (apiError.errors.title?.[0]) mapped.taskDescription = apiError.errors.title[0];
                if (apiError.errors.assigned_agent_id?.[0]) mapped.assignTo = apiError.errors.assigned_agent_id[0];
                if (apiError.errors.location?.[0]) mapped.location = apiError.errors.location[0];
                if (apiError.errors.address?.[0]) mapped.address = apiError.errors.address[0];
                if (apiError.errors.due_date?.[0]) mapped.dueDate = apiError.errors.due_date[0];
                setErrors((previous) => ({ ...previous, ...mapped }));
            }
            toast.error(apiError.message || "Failed to schedule task.");
        };

        const commonPayload = {
            company_id: companyId,
            title: form.taskDescription.trim(),
            location: form.location.trim() || undefined,
            address: form.address.trim() || undefined,
            latitude: coords?.lat,
            longitude: coords?.lng,
            due_date: dueDateIso,
            priority: "medium" as const,
        };

        if (role === "agent") {
            createSelfTaskMutation.mutate(commonPayload, {
                onSuccess: (response) => handleTaskSuccess(response.data.task),
                onError,
            });
            return;
        }

        if (role === "supervisor") {
            createTaskMutation.mutate(commonPayload, {
                onSuccess: (response) => handleTaskSuccess(response.data.task),
                onError,
            });
            return;
        }

        createTaskMutation.mutate(
            {
                ...commonPayload,
                assigned_agent_id: canDelegate && form.assignTo ? Number(form.assignTo) : undefined,
            },
            {
                onSuccess: (response) => handleTaskSuccess(response.data.task),
                onError,
            }
        );
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/25" onClick={onClose} />

            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                        <h2 className="text-[16px] font-bold text-[#09232D]">{title}</h2>
                        <button
                            onClick={onClose}
                            className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="space-y-3 px-5 py-4">
                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                            Task Description
                        </label>
                        <div className="relative">
                            <FileText className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                value={form.taskDescription}
                                onChange={(event) => updateField("taskDescription", event.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                                placeholder="What needs to be done?"
                            />
                        </div>
                        {errors.taskDescription && <p className="text-[11px] text-red-500">{errors.taskDescription}</p>}

                        {canDelegate && (
                            <>
                                <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                                    Agent Name
                                </label>
                                <SearchableSelect
                                    value={form.assignTo}
                                    onChange={(v) => updateField("assignTo", v)}
                                    options={loadingAgents ? [] : agents.map((a) => ({ value: String(a.id), label: a.name }))}
                                    placeholder={loadingAgents ? "Loading agents…" : "Select company agent"}
                                    leftIcon={<User size={14} className="text-gray-400" />}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm"
                                />
                                {errors.assignTo && <p className="text-[11px] text-red-500">{errors.assignTo}</p>}
                            </>
                        )}

                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                            Location <span className="font-normal normal-case text-gray-400">(optional)</span>
                        </label>
                        <div className="relative">
                            <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={14} />
                            <PlaceAutocompleteField
                                value={form.location}
                                onChange={(next) => updateField("location", next)}
                                onPlaceSelect={applyRetrievedPlace}
                                placeholder="Area or city"
                                inputClassName="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                            />
                        </div>
                        {errors.location && <p className="text-[11px] text-red-500">{errors.location}</p>}

                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                            Address
                        </label>
                        <div className="relative">
                            <Navigation className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={14} />
                            <PlaceAutocompleteField
                                value={form.address}
                                onChange={(next) => updateField("address", next)}
                                onPlaceSelect={applyRetrievedPlace}
                                placeholder="Search exact address or place"
                                inputClassName="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                            />
                        </div>
                        {coords ? (
                            <p className="text-[10px] font-medium text-green-600">
                                GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                            </p>
                        ) : (form.address.trim().length >= 2 || form.location.trim().length >= 2) ? (
                            <p className="text-[10px] text-amber-700">
                                Pick a suggestion to lock map coordinates.
                            </p>
                        ) : null}
                        {errors.address && <p className="text-[11px] text-red-500">{errors.address}</p>}

                        <label className="block text-[11px] font-bold uppercase tracking-wide text-[#0B1215]">
                            Due Date
                        </label>
                        <div className="relative">
                            <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                type="date"
                                value={form.dueDate}
                                onChange={(event) => updateField("dueDate", event.target.value)}
                                min={defaultDueDate()}
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#094B5C]"
                            />
                        </div>
                        {errors.dueDate && <p className="text-[11px] text-red-500">{errors.dueDate}</p>}
                    </div>

                    <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
                        <button
                            onClick={onClose}
                            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="rounded-xl bg-[#09232D] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmitting ? "Saving..." : "Save Task"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
