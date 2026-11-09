"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useDeleteLead, useLeads, useUpdateLead } from "@/hooks/use-crm";
import { useInternalUsers } from "@/hooks/use-internal-users";
import type { ApiLeadStatus, ApiRoleBasePath, LeadApiItem } from "@/lib/api/crm";
import { formatLeadBudgetDisplay, resolveLeadBudgetAmount } from "@/lib/api/crm";
import type { DndContainer, DndItem } from "@/types/operations";
import { AddLeadModal } from "./add-lead-modal";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragOverEvent,
    DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    closestCorners,
    useSensor,
    useSensors,
    useDroppable,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Search, Plus, Edit2, Trash2 } from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";

const STAGES: Array<{ id: ApiLeadStatus; title: string; color: string }> = [
    { id: "new", title: "New Leads", color: "#2563EB" },
    { id: "proposal_sent", title: "Proposal Sent", color: "#F59E0B" },
    { id: "contacted", title: "Contacted", color: "#E879A0" },
    { id: "qualified", title: "Qualified", color: "#10B981" },
    { id: "lost", title: "Lost", color: "#EF4444" },
    { id: "won", title: "Won", color: "#166534" },
];

function toRelativeTime(value?: string | null): string {
    if (!value) {
        return "Just now";
    }

    try {
        return `${formatDistanceToNowStrict(parseISO(value))} ago`;
    } catch {
        return "Just now";
    }
}

function mapLeadToItem(lead: LeadApiItem): DndItem {
    const rawValue = resolveLeadBudgetAmount(lead);
    return {
        id: String(lead.id),
        label: lead.name,
        description: lead.location || lead.source || lead.email || lead.phone || "No details",
        companyName: lead.company_name ?? undefined,
        position: lead.position ?? undefined,
        location: lead.location ?? "",
        assignedBy: lead.assignee?.name ?? "Unassigned",
        assignedToUserId: lead.assigned_to_user_id ?? null,
        time: toRelativeTime(lead.updated_at),
        priority: lead.priority ?? "medium",
        value: formatLeadBudgetDisplay(lead),
        rawValue,
    };
}

function buildContainers(leads: LeadApiItem[]): DndContainer[] {
    const grouped = new Map<ApiLeadStatus, DndItem[]>();
    STAGES.forEach((stage) => grouped.set(stage.id, []));

    leads.forEach((lead) => {
        const status = (lead.status ?? "new") as ApiLeadStatus;
        if (!grouped.has(status)) {
            return;
        }

        grouped.get(status)?.push(mapLeadToItem(lead));
    });

    return STAGES.map((stage) => ({
        id: stage.id,
        title: stage.title,
        color: stage.color,
        items: grouped.get(stage.id) ?? [],
    }));
}

function findContainer(containers: DndContainer[], id: string): DndContainer | undefined {
    if (containers.some((container) => container.id === id)) {
        return containers.find((container) => container.id === id);
    }

    return containers.find((container) => container.items.some((item) => item.id === id));
}

function LeadCard({
    item,
    disabled,
    onEditClick,
    onDeleteClick,
    companyUsers,
    onAssigneeChange,
}: {
    item: DndItem;
    disabled: boolean;
    onEditClick?: () => void;
    onDeleteClick?: () => void;
    companyUsers?: { id: number; name: string }[];
    onAssigneeChange?: (leadId: string, assigneeId: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: item.id, disabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const priorityColors: Record<string, string> = {
        high: "bg-[#EF4444]",
        medium: "bg-[#12C6D8]",
        low: "bg-[#10B981]",
    };
    const priorityColor = priorityColors[item.priority?.toLowerCase() || "medium"] || "bg-[#12C6D8]";

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`bg-white rounded-[32px] p-6 shadow-[0px_4px_16px_rgba(0,0,0,0.04)] border border-gray-100/60 mb-4 transition-all relative group overflow-hidden min-w-0 ${disabled ? "cursor-default" : "cursor-grab"
                } ${isDragging ? "opacity-50 shadow-xl" : ""}`}
        >
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-[#2F3033] font-extrabold text-[17px] leading-tight truncate">{item.label}</p>
                    <p className="text-[#8C93A1] text-[13px] mt-1 truncate">
                        {item.companyName || "No company"}
                    </p>
                    <p className="text-[#8C93A1] text-[12px] mt-0.5 truncate">
                        {item.position || "No position"}
                    </p>
                </div>
                {!disabled && (
                    <div className="flex items-center shrink-0">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditClick?.();
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="text-gray-400 hover:text-[#0B1215] p-1.5 rounded-full hover:bg-gray-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Edit Lead"
                        >
                            <Edit2 size={15} />
                        </button>
                        {onDeleteClick && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteClick();
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="Delete Lead"
                            >
                                <Trash2 size={15} />
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between mt-5">
                <span className="text-[#1A5C5A] font-extrabold text-[17px]">{item.value}</span>
                <span className={`${priorityColor} text-white rounded-full px-3.5 py-1 text-[11px] font-semibold tracking-wide capitalize`}>
                    {item.priority}
                </span>
            </div>

            <div className="flex items-center justify-between mt-4">
                {!disabled && companyUsers ? (
                    <SearchableSelect
                        value={String(item.assignedToUserId ?? "")}
                        onChange={(v) => onAssigneeChange?.(item.id, v)}
                        options={[{ value: "", label: "Unassigned" }, ...companyUsers.map((u) => ({ value: String(u.id), label: u.name }))]}
                        className="text-[#8C93A1] text-[12px] bg-transparent cursor-pointer hover:text-[#0B1215] max-w-30 p-0"
                    />
                ) : (
                    <span className="text-[#8C93A1] text-[12px] truncate max-w-[120px]">
                        {item.assignedBy ?? "Unassigned"}
                    </span>
                )}
                <span className="text-[#8C93A1] text-[12px]">{item.time}</span>
            </div>
        </div>
    );
}

function LeadColumn({
    container,
    disabled,
    onAddClick,
    onEditLeadClick,
    onDeleteLeadClick,
    companyUsers,
    onAssigneeChange,
}: {
    container: DndContainer;
    disabled: boolean;
    onAddClick?: () => void;
    onEditLeadClick?: (leadId: string) => void;
    onDeleteLeadClick?: (leadId: string) => void;
    companyUsers?: { id: number; name: string }[];
    onAssigneeChange?: (leadId: string, assigneeId: string) => void;
}) {
    const totalValue = `$ ${container.items.reduce((sum, item) => sum + (item.rawValue ?? 0), 0).toLocaleString()}`;
    // Register the column body as a droppable so empty columns accept cards
    const { setNodeRef: setDropRef } = useDroppable({ id: container.id });

    return (
        <div className="flex flex-col w-[320px] shrink-0 relative mb-4 min-w-0 overflow-hidden">
            {/* Colored background layer (Header) */}
            <div
                className="absolute top-0 left-0 right-0 h-[120px] rounded-t-[40px]"
                style={{ backgroundColor: container.color }}
            >
                <div className="flex items-center justify-between px-6 pt-5">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-[15px]">{container.title}</span>
                        <span className="bg-white rounded-full h-6 w-6 flex items-center justify-center text-[12px] font-bold" style={{ color: container.color }}>
                            {container.items.length}
                        </span>
                    </div>
                    <span className="text-white text-[14px] font-medium opacity-90">
                        {totalValue}
                    </span>
                </div>
            </div>

            {/* White overlapping body — also the droppable target for this column */}
            <div
                ref={setDropRef}
                className="bg-white relative mt-[60px] rounded-[40px] px-4 pt-6 pb-4 min-h-[400px] border border-gray-100 shadow-[0px_4px_16px_rgba(0,0,0,0.02)] flex flex-col"
            >
                <div className="flex-1">
                    <SortableContext
                        items={container.items.map((item) => item.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {container.items.map((item) => (
                            <LeadCard
                                key={item.id}
                                item={item}
                                disabled={disabled}
                                onEditClick={() => onEditLeadClick?.(item.id)}
                                onDeleteClick={
                                    onDeleteLeadClick ? () => onDeleteLeadClick(item.id) : undefined
                                }
                                companyUsers={companyUsers}
                                onAssigneeChange={onAssigneeChange}
                            />
                        ))}
                    </SortableContext>
                </div>

                {!disabled && (
                    <button
                        onClick={onAddClick}
                        className="w-full flex items-center justify-center gap-2 text-[12px] text-gray-400 hover:text-[#0B1215] py-3 mt-2 transition-colors cursor-pointer rounded-[24px] hover:bg-gray-50"
                    >
                        <Plus size={13} />
                        Add Leads
                    </button>
                )}
            </div>
        </div>
    );
}

function KanbanBoard({
    initialContainers,
    readOnly,
    onStatusChange,
    onAddLeadClick,
    onEditLeadClick,
    onDeleteLeadClick,
    companyUsers,
    onAssigneeChange,
}: {
    initialContainers: DndContainer[];
    readOnly: boolean;
    onStatusChange: (leadId: string, status: ApiLeadStatus) => Promise<void>;
    onAddLeadClick?: (status: ApiLeadStatus) => void;
    onEditLeadClick?: (leadId: string) => void;
    onDeleteLeadClick?: (leadId: string) => void;
    companyUsers?: { id: number; name: string }[];
    onAssigneeChange?: (leadId: string, assigneeId: string) => void;
}) {
    const [containers, setContainers] = useState<DndContainer[]>(initialContainers);
    const [activeItem, setActiveItem] = useState<DndItem | null>(null);
    // Keep a ref always in sync with state so async drag handlers read current data
    const containersRef = useRef<DndContainer[]>(initialContainers);
    const dragOriginRef = useRef<string | null>(null);

    function applyContainers(updater: DndContainer[] | ((prev: DndContainer[]) => DndContainer[])) {
        setContainers((prev) => {
            const next = typeof updater === "function" ? updater(prev) : updater;
            containersRef.current = next;
            return next;
        });
    }

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragStart(event: DragStartEvent) {
        if (readOnly) return;

        const itemId = String(event.active.id);
        const container = findContainer(containersRef.current, itemId);
        dragOriginRef.current = container?.id ?? null;
        const item = container?.items.find((entry) => entry.id === itemId) ?? null;
        setActiveItem(item);
    }

    function handleDragOver(event: DragOverEvent) {
        if (readOnly) return;

        const { active, over } = event;
        if (!over) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        applyContainers((previous) => {
            const activeContainer = findContainer(previous, activeId);
            const overContainer = findContainer(previous, overId);
            if (!activeContainer || !overContainer) return previous;
            if (activeContainer.id === overContainer.id) return previous;

            const activeItemValue = activeContainer.items.find((item) => item.id === activeId);
            if (!activeItemValue) return previous;

            const next = previous.map((container) => ({ ...container, items: [...container.items] }));
            const nextActive = next.find((container) => container.id === activeContainer.id);
            const nextOver = next.find((container) => container.id === overContainer.id);
            if (!nextActive || !nextOver) return previous;

            nextActive.items = nextActive.items.filter((item) => item.id !== activeId);

            const overIndex = nextOver.items.findIndex((item) => item.id === overId);
            if (overIndex >= 0) {
                nextOver.items.splice(overIndex, 0, activeItemValue);
            } else {
                nextOver.items.push(activeItemValue);
            }

            return next;
        });
    }

    async function handleDragEnd(event: DragEndEvent) {
        if (readOnly) return;

        const { active, over } = event;
        setActiveItem(null);

        const activeId = String(active.id);
        const originContainerId = dragOriginRef.current;
        dragOriginRef.current = null;

        if (!over || !originContainerId) {
            applyContainers(initialContainers);
            return;
        }

        // Read where the item actually landed (handleDragOver already moved it in state)
        const destinationContainer = findContainer(containersRef.current, activeId);
        if (!destinationContainer) {
            applyContainers(initialContainers);
            return;
        }

        const destinationContainerId = destinationContainer.id;

        if (originContainerId === destinationContainerId) {
            // Same column: handle reordering
            const overId = String(over.id);
            applyContainers((previous) => {
                const activeContainer = findContainer(previous, activeId);
                const overContainer = findContainer(previous, overId);
                if (!activeContainer || !overContainer) return previous;
                if (activeContainer.id !== overContainer.id) return previous;

                const activeIndex = activeContainer.items.findIndex((item) => item.id === activeId);
                const overIndex = activeContainer.items.findIndex((item) => item.id === overId);
                if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return previous;

                const next = previous.map((container) => ({ ...container, items: [...container.items] }));
                const target = next.find((container) => container.id === activeContainer.id);
                if (!target) return previous;

                const [moved] = target.items.splice(activeIndex, 1);
                target.items.splice(overIndex, 0, moved);
                return next;
            });
            return;
        }

        // Cross-column: optimistic state is already applied; call the API
        try {
            await onStatusChange(activeId, destinationContainerId as ApiLeadStatus);
        } catch {
            // Revert on failure
            applyContainers(initialContainers);
        }
    }

    return (
        <div className="overflow-x-auto">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex gap-3 min-w-max pb-1">
                    {containers.map((container) => (
                        <LeadColumn
                            key={container.id}
                            container={container}
                            disabled={readOnly}
                            onAddClick={() => onAddLeadClick?.(container.id as ApiLeadStatus)}
                            onEditLeadClick={onEditLeadClick}
                            onDeleteLeadClick={onDeleteLeadClick}
                            companyUsers={companyUsers}
                            onAssigneeChange={onAssigneeChange}
                        />
                    ))}
                </div>

                {!readOnly && (
                    <DragOverlay>{activeItem ? <LeadCard item={activeItem} disabled={false} /> : null}</DragOverlay>
                )}
            </DndContext>
        </div>
    );
}

export function CrmKanbanPage({
    apiBasePath,
    readOnly,
}: {
    apiBasePath: ApiRoleBasePath;
    readOnly: boolean;
}) {
    const user = useAuthStore((s) => s.user);
    const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
    const canDeleteLeads =
        !readOnly && ["owner", "admin", "supervisor"].includes((role ?? "").toLowerCase());

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [defaultStatus, setDefaultStatus] = useState<ApiLeadStatus>("new");
    const [editingLead, setEditingLead] = useState<LeadApiItem | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<LeadApiItem | null>(null);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearch(search.trim());
        }, 350);

        return () => clearTimeout(timeout);
    }, [search]);

    const { data, isLoading, refetch } = useLeads(
        {
            company_id: companyId ?? undefined,
            search: debouncedSearch || undefined,
            page: 1,
        },
        apiBasePath
    );

    const initialContainers = useMemo(() => buildContainers(data?.leads ?? []), [data?.leads]);
    const boardKey = useMemo(
        () =>
            (data?.leads ?? [])
                .map((lead) => `${lead.id}:${lead.status ?? "new"}:${lead.updated_at ?? ""}`)
                .join("|"),
        [data?.leads]
    );

    const updateLeadMutation = useUpdateLead(undefined, apiBasePath);
    const deleteLeadMutation = useDeleteLead(
        {
            onSuccess: () => {
                toast.success("Lead deleted successfully");
            },
        },
        apiBasePath
    );

    const confirmDeleteLead = () => {
        if (!deleteTarget) return;
        deleteLeadMutation.mutate(
            { leadId: deleteTarget.id, companyId: companyId ?? undefined },
            {
                onError: () => toast.error("Could not delete the lead. Please try again."),
            }
        );
        setDeleteTarget(null);
    };

    const { data: companyUsers = [] } = useInternalUsers({
        company_id: companyId ?? undefined,
    });

    const handleAssigneeChange = async (leadId: string, assigneeId: string) => {
        if (!companyId) return;
        
        try {
            await updateLeadMutation.mutateAsync({
                leadId,
                payload: {
                    company_id: companyId,
                    assigned_to_user_id: assigneeId ? Number(assigneeId) : null,
                }
            });
            toast.success("Assignee updated successfully");
        } catch {
            toast.error("Failed to update assignee");
        }
    };

    async function persistStatusChange(leadId: string, status: ApiLeadStatus) {
        try {
            await updateLeadMutation.mutateAsync({
                leadId,
                payload: { company_id: companyId ?? "", status },
            });
            toast.success("Lead status updated");
            await refetch();
        } catch {
            toast.error("Could not update lead status. Reverting...");
            throw new Error("status update failed");
        }
    }

    if (!companyId) {
        return (
            <div className="bg-white rounded-3xl p-8 text-center text-gray-500 border border-gray-100">
                No active company context was found for this account.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
                <div className="relative w-full max-w-110">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search for Leads"
                        className="w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
                    />
                </div>

                {!readOnly && (
                    <button
                        onClick={() => {
                            setDefaultStatus("new");
                            setIsAddModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-black hover:opacity-90 transition-all shadow-lg cursor-pointer"
                    >
                        Add New Leads
                        <Plus size={15} />
                    </button>
                )}
            </div>

            <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] p-4">
                {isLoading ? (
                    <div className="p-6 text-[13px] text-gray-400">Loading CRM leads...</div>
                ) : (
                    <KanbanBoard
                        key={boardKey}
                        initialContainers={initialContainers}
                        readOnly={readOnly}
                        onStatusChange={persistStatusChange}
                        onAddLeadClick={(status) => {
                            setDefaultStatus(status);
                            setIsAddModalOpen(true);
                        }}
                        onEditLeadClick={(leadId) => {
                            const lead = data?.leads.find((l) => String(l.id) === leadId);
                            if (lead) {
                                setEditingLead(lead);
                            }
                        }}
                        onDeleteLeadClick={
                            canDeleteLeads
                                ? (leadId) => {
                                    const lead = data?.leads.find((l) => String(l.id) === leadId);
                                    if (lead) {
                                        setDeleteTarget(lead);
                                    }
                                }
                                : undefined
                        }
                        companyUsers={companyUsers}
                        onAssigneeChange={handleAssigneeChange}
                    />
                )}
            </div>

            {isAddModalOpen && (
                <AddLeadModal
                    onClose={() => setIsAddModalOpen(false)}
                    apiBasePath={apiBasePath}
                    defaultStatus={defaultStatus}
                />
            )}

            {editingLead && (
                <AddLeadModal
                    lead={editingLead}
                    onClose={() => setEditingLead(null)}
                    apiBasePath={apiBasePath}
                />
            )}

            <ConfirmDeleteModal
                isOpen={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDeleteLead}
                title="Delete Lead"
                description={`Are you sure you want to delete "${deleteTarget?.name ?? "this lead"}"? This action cannot be undone.`}
            />
        </div>
    );
}
