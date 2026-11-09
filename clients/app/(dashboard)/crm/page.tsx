"use client";

import type { DndContainer, DndItem } from "@/types/operations";
import type { ApiLeadStatus, LeadApiItem } from "@/lib/api/crm";
import { formatLeadBudgetDisplay, resolveLeadBudgetAmount } from "@/lib/api/crm";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { DEFAULT_AVATAR, resolveAvatarSrc } from "@/lib/avatar";
import { useAgentUploadsOverview, useCrmLabels, useCrmLeadsAnalytics, useCrmPipelines, useDeleteLead, useLeadStagePages, useUpdateLead } from "@/hooks/use-crm";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import { AddLeadModal } from "@/components/crm/add-lead-modal";
import { LabelManagerModal, PipelineManagerModal } from "@/components/crm/crm-toolbar-modals";
import { CrmImportExportButton } from "@/components/crm/crm-import-export-button";
import { CRMPageSkeleton } from "@/components/crm/crm-page-skeleton";
import { LeadsChart, TotalLeadsCard } from "@/components/crm/crm-summary-cards";
import { CrmFilterBar } from "@/components/crm/crm-filter-bar";
import { useDroppable } from "@dnd-kit/core";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict, parseISO } from "date-fns";



// Presentation-only columns while the CRM service is unavailable; no leads are fabricated.
const EMPTY_CRM_STAGES = [
  { id: "new", title: "New Lead", color: "#2563EB" },
  { id: "engaged", title: "Proposal Sent", color: "#F59E0B" },
  { id: "contacted", title: "Contacted", color: "#E978A3" },
  { id: "qualified", title: "Qualified", color: "#10B981" },
];

const AGENT_UPLOAD_SOURCE_FILTER = "agent_upload";

function toRelativeTime(value?: string | null): string {
  if (!value) return "Just now";
  try { return `${formatDistanceToNowStrict(parseISO(value))} ago`; } catch { return "Just now"; }
}

function mapLeadToItem(lead: LeadApiItem): DndItem {
  const rawValue = resolveLeadBudgetAmount(lead);
  return {
    id: String(lead.id),
    label: lead.name,
    description: lead.location || lead.source || lead.email || lead.phone || "No details",
    location: lead.location ?? "",
    assignedBy: lead.assignee?.name ?? "Unassigned",
    time: toRelativeTime(lead.updated_at),
    priority: lead.priority ?? "medium",
    rawValue,
    value: formatLeadBudgetDisplay(lead),
  };
}

function buildContainers(leads: LeadApiItem[], stages: Array<{ id: ApiLeadStatus; title: string; color: string }>): DndContainer[] {
  const grouped = new Map<ApiLeadStatus, DndItem[]>();
  stages.forEach((s) => grouped.set(s.id, []));
  leads.forEach((lead) => {
    const status = (lead.status ?? "newly_lead") as ApiLeadStatus;
    const target = grouped.has(status) ? status : ("__uncategorized__" as ApiLeadStatus);
    grouped.get(target)?.push(mapLeadToItem(lead));
  });
  return stages.map((s) => ({ id: s.id, title: s.title, color: s.color, items: grouped.get(s.id) ?? [] }));
}

function findContainerForItem(containers: DndContainer[], id: string): DndContainer | undefined {
  if (containers.some((c) => c.id === id)) return containers.find((c) => c.id === id);
  return containers.find((c) => c.items.some((i) => i.id === id));
}

/* ─── Lead Card ─────────────────────────────────────────── */

function LeadCard({
  item,
  isDragOverlay,
  basePath = "/crm",
  stages,
  currentStageId,
  onMoveToStage,
  onEditClick,
  onDeleteClick,
}: {
  item: DndItem;
  isDragOverlay?: boolean;
  basePath?: string;
  stages?: Array<{ id: string; title: string; color: string }>;
  currentStageId?: string;
  onMoveToStage?: (leadId: string, targetStageId: string) => void;
  onEditClick?: (leadId: string) => void;
  onDeleteClick?: (leadId: string) => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const amount = item.value || "$ 0";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => router.push(`${basePath}/leads/${item.id}`)}
      className={`se-lead-card group bg-white rounded-[20px] p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.06)] border border-gray-100 cursor-grab select-none mb-3 transition-all duration-200 overflow-hidden min-w-0
        ${isDragging && !isDragOverlay ? "opacity-40 scale-95" : ""}
        ${isDragOverlay ? "shadow-2xl scale-105 cursor-grabbing" : "hover:shadow-md"}
      `}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <p className="text-[#0B1215] font-bold text-[14px] leading-tight min-w-0 flex-1 truncate">{item.label}</p>
        {(onEditClick || onDeleteClick) && !isDragOverlay && (
          <div className="flex items-center shrink-0 -mt-1 -mr-1">
            {onEditClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditClick(item.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-gray-300 hover:text-[#0B1215] p-1.5 rounded-full hover:bg-gray-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
                title="Edit Lead"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDeleteClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClick(item.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-gray-300 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
                title="Delete Lead"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-[#9CA3AF] text-[12px] mt-0.5 truncate" title={item.description}>
        {item.description}
      </p>

      <div className="flex items-center justify-between gap-2 mt-3 min-w-0">
        <span className="text-[#0B1215] font-bold text-[13px] truncate shrink-0">
          {amount}
        </span>
        <span className="bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold px-3 py-0.5 rounded-full capitalize shrink-0">
          {item.priority ?? "medium"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 min-w-0">
        <span className="text-[#9CA3AF] text-[11px] truncate min-w-0">{item.assignedBy ?? "Unassigned"}</span>
        <span className="text-[#9CA3AF] text-[11px] shrink-0">{item.time}</span>
      </div>

      {onMoveToStage && stages && currentStageId && (
        <div className="relative md:hidden mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-gray-400 text-[11px]">Move to:</span>
          <div className="relative">
            <select
              value={currentStageId}
              onChange={(e) => {
                e.stopPropagation();
                onMoveToStage(item.id, e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-[11px] font-semibold py-1 pl-2.5 pr-6 rounded-lg focus:outline-none cursor-pointer"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={10}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Lead Column ────────────────────────────────────────── */

function LeadColumn({
  id,
  title,
  color,
  items,
  onAddCard,
  basePath,
  activeTabId,
  stages,
  onMoveToStage,
  onEditLeadClick,
  onDeleteLeadClick,
  total,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: {
  id: string;
  title: string;
  color: string;
  items: DndItem[];
  onAddCard: () => void;
  basePath?: string;
  activeTabId?: string;
  stages?: Array<{ id: string; title: string; color: string }>;
  onMoveToStage?: (leadId: string, targetStageId: string) => void;
  onEditLeadClick?: (leadId: string) => void;
  onDeleteLeadClick?: (leadId: string) => void;
  total?: number;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={`flex flex-col w-full md:w-55 shrink-0 md:shrink-0 min-w-0 overflow-hidden ${activeTabId ? (id === activeTabId ? "flex" : "hidden md:flex") : ""
        }`}
    >
      {/* Header */}
      <div
        className="rounded-t-[20px] px-4 pt-3 pb-8 flex items-center justify-between"
        style={{ backgroundColor: color }}
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-[13px]">{title}</span>
          <div
            className="rounded-full min-w-5.5 h-5.5 px-1.5 flex items-center justify-center font-bold text-[11px] bg-white"
            style={{ color }}
          >
            {(total ?? items.length).toLocaleString()}
          </div>
        </div>
        <span className="text-white text-[12px] font-medium">$ {items.reduce((sum, item) => sum + (item.rawValue ?? 0), 0).toLocaleString()}</span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 relative z-10 -mt-6 transition-colors duration-200 min-h-50 flex flex-col ${isOver ? "bg-gray-100/60 rounded-[20px] ring-2 ring-inset ring-gray-200" : ""
          }`}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="pt-2">
            {items.map((item) => (
              <LeadCard
                key={item.id}
                item={item}
                basePath={basePath}
                stages={stages}
                currentStageId={id}
                onMoveToStage={onMoveToStage}
                onEditClick={onEditLeadClick}
                onDeleteClick={onDeleteLeadClick}
              />
            ))}
          </div>
        </SortableContext>

        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className="mx-2 mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50"
          >
            {isFetchingMore
              ? "Loading…"
              : `Load more (${items.length.toLocaleString()} of ${(total ?? items.length).toLocaleString()})`}
          </button>
        )}

        {id !== "__uncategorized__" && (
          <button
            onClick={() => onAddCard()}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-gray-400 hover:text-[#0B1215] transition-colors group mt-4"
          >
            <span className="text-[11px] font-medium">Add Leads</span>
            <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center group-hover:border-[#0B1215] transition-colors">
              <Plus size={11} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── List View ─────────────────────────────────────────── */

function LeadListView({
  containers,
  basePath = "/crm",
  stageMeta,
}: {
  containers: DndContainer[];
  basePath?: string;
  stageMeta?: Record<string, { total: number }>;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const allLeads = containers.flatMap((c) =>
    c.items.map((item) => ({ ...item, stageId: c.id, stageTitle: c.title, stageColor: c.color }))
  );

  return (
    <div className="px-4 pb-6">
      {/* Table header */}
      <div className="hidden md:grid grid-cols-[2fr_2fr_1.2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 mb-1">
        {["Lead", "Company", "Stage", "Amount", "Priority", "Assigned", ""].map((h) => (
          <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            {h}
          </span>
        ))}
      </div>

      {containers.map((container) => {
        const isOpen = !collapsed[container.id];
        const total = container.items.reduce((s) => s + 40010, 0);

        return (
          <div key={container.id} className="mb-2">
            {/* Stage group header */}
            <button
              onClick={() => toggle(container.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: container.color }} />
              <span className="text-[13px] font-bold text-[#0B1215] flex-1 text-left">{container.title}</span>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${container.color}20`, color: container.color }}
              >
                {(stageMeta?.[container.id]?.total ?? container.items.length).toLocaleString()} leads
              </span>
              <span className="text-[12px] font-semibold text-gray-500 mr-2">
                $ {(total).toLocaleString()}
              </span>
              <ChevronRight
                size={14}
                className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
              />
            </button>

            {/* Rows */}
            {isOpen && (
              <div className="mt-0.5 overflow-hidden">
                {container.items.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => router.push(`${basePath}/leads/${item.id}`)}
                    className={`se-list-row relative grid grid-cols-1 md:grid-cols-[2fr_2fr_1.2fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 items-start md:items-center px-4 py-3 rounded-xl transition-colors cursor-pointer hover:bg-gray-50 group/row ${idx % 2 === 0 ? "" : "bg-gray-50/50"
                      }`}
                  >
                    {/* Lead name */}
                    <div className="flex items-center gap-2.5 min-w-0 pr-8 md:pr-0">
                      <div
                        className="w-1 h-7 rounded-full shrink-0"
                        style={{ backgroundColor: container.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[#0B1215] truncate">{item.label}</p>
                        <p className="text-[11px] text-gray-400 truncate">{item.time}</p>
                      </div>
                    </div>

                    {/* Company */}
                    <span className="text-[12px] text-gray-500 truncate pl-3.5 md:pl-0">{item.description}</span>

                    {/* Responsive badge/amount/priority/assigned grouping */}
                    <div className="flex flex-wrap items-center gap-2 pl-3.5 md:pl-0 md:contents">
                      {/* Stage pill */}
                      <span
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full w-fit"
                        style={{ backgroundColor: `${container.color}18`, color: container.color }}
                      >
                        {container.title}
                      </span>

                      {/* Amount */}
                      <span className="text-[13px] font-bold text-[#0B1215]">
                        {item.value}
                      </span>

                      {/* Priority badge */}
                      <span className="bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold px-2.5 py-0.5 rounded-full w-fit">
                        {item.priority ?? "medium"}
                      </span>

                      {/* Assigned */}
                      <span className="text-[12px] text-gray-400">{item.assignedBy ?? "Unassigned"}</span>
                    </div>

                    {/* Actions */}
                    <button className="absolute right-4 top-3 md:relative md:top-auto md:right-auto opacity-100 md:opacity-0 md:group-hover/row:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-100">
                      <MoreHorizontal size={14} className="text-gray-400" />
                    </button>
                  </div>
                ))}

                {/* Add row */}
                <button className="flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-[#0B1215] transition-colors group/add w-full">
                  <div className="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center group-hover/add:border-[#0B1215] transition-colors">
                    <Plus size={11} />
                  </div>
                  <span className="text-[11px] font-medium">Add lead</span>
                </button>
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-gray-100 mx-4 mt-1" />
          </div>
        );
      })}

      {/* Summary footer */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center sm:justify-between px-4 py-3 bg-gray-50 rounded-xl">
        <span className="text-[12px] font-semibold text-gray-500">
          {allLeads.length.toLocaleString()} loaded of{" "}
          {(stageMeta
            ? Object.values(stageMeta).reduce((sum, stage) => sum + stage.total, 0)
            : allLeads.length
          ).toLocaleString()} total leads
        </span>
        <span className="text-[13px] font-bold text-[#0B1215]">
          $ {(allLeads.length * 40010).toLocaleString()} pipeline value
        </span>
      </div>
    </div>
  );
}

function LeadBoard({
  basePath = "/crm",
  leadListUrl,
  initialContainers,
  onStatusChange,
  onAddClick,
  onEditLeadClick,
  onDeleteLeadClick,
  isLoading,
  stageMeta,
  onLoadMore,
}: {
  basePath?: string;
  leadListUrl?: string;
  initialContainers: DndContainer[];
  onStatusChange: (leadId: string, status: ApiLeadStatus) => Promise<void>;
  onAddClick?: (status: ApiLeadStatus) => void;
  onEditLeadClick?: (leadId: string) => void;
  onDeleteLeadClick?: (leadId: string) => void;
  isLoading?: boolean;
  stageMeta?: Record<string, { total: number; hasMore: boolean; isFetchingMore: boolean }>;
  onLoadMore?: (stageId: string) => void;
}) {
  const router = useRouter();
  const [containers, setContainers] = useState<DndContainer[]>(initialContainers);
  const [activeItem, setActiveItem] = useState<DndItem | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const containersRef = useRef<DndContainer[]>(initialContainers);
  const dragOriginRef = useRef<string | null>(null);
  // Active tab state for column navigation
  const [activeTabId, setActiveTabId] = useState<string>(() => initialContainers[0]?.id ?? "newly_lead");
  const resolvedActiveTabId =
    initialContainers.length > 0 &&
    !initialContainers.some((c) => c.id === activeTabId)
      ? initialContainers[0].id
      : activeTabId;
  const [prevInitialContainers, setPrevInitialContainers] = useState(initialContainers);

  if (initialContainers !== prevInitialContainers) {
    setPrevInitialContainers(initialContainers);
    setContainers(initialContainers);
  }

  useEffect(() => {
    containersRef.current = containers;
  }, [containers]);

  function apply(updater: DndContainer[] | ((prev: DndContainer[]) => DndContainer[])) {
    setContainers((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      containersRef.current = next;
      return next;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const itemId = String(event.active.id);
    const container = findContainerForItem(containersRef.current, itemId);
    dragOriginRef.current = container?.id ?? null;
    setActiveItem(container?.items.find((i) => i.id === itemId) ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    apply((prev) => {
      const ac = findContainerForItem(prev, activeId);
      const oc = findContainerForItem(prev, overId);
      if (!ac || !oc || ac.id === oc.id) return prev;
      const item = ac.items.find((i) => i.id === activeId);
      if (!item) return prev;
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      const na = next.find((c) => c.id === ac.id)!;
      const no2 = next.find((c) => c.id === oc.id)!;
      na.items = na.items.filter((i) => i.id !== activeId);
      const oi = no2.items.findIndex((i) => i.id === overId);
      if (oi >= 0) no2.items.splice(oi, 0, item); else no2.items.push(item);
      return next;
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);
    const activeId = String(active.id);
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    if (!over || !origin) { apply(initialContainers); return; }
    const dest = findContainerForItem(containersRef.current, activeId);
    if (!dest) { apply(initialContainers); return; }
    if (origin === dest.id) return; // same column reorder, no API call needed
    try {
      await onStatusChange(activeId, dest.id as ApiLeadStatus);
    } catch {
      apply(initialContainers);
    }
  }

  const stagesList = useMemo(() => {
    return containers.map((c) => ({ id: c.id, title: c.title, color: c.color }));
  }, [containers]);

  if (isLoading) {
    return (
      <div className="se-surface bg-white shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-t-[30px] mt-6 overflow-hidden flex items-center justify-center h-[calc(100vh-360px)] min-h-[70vh]">
        <p className="text-[13px] text-gray-400">Loading CRM leads…</p>
      </div>
    );
  }

  return (
    <div className="se-surface bg-white shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-t-[30px] mt-6 overflow-hidden flex flex-col h-[calc(100vh-360px)] min-h-[70vh]">
      {/* Board toolbar */}
      <div className="flex items-center justify-end gap-3 px-6 pt-4 pb-2">
        <button
          onClick={() => router.push(leadListUrl ?? `${basePath}/leads`)}
          className="se-primary text-[11px] font-medium bg-[#0B1215] text-white px-4 py-1.5 rounded-lg hover:opacity-90 transition-all"
        >
          View All Leads
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-[#0B1215] text-white" : "text-gray-400 hover:text-gray-600"
              }`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-[#0B1215] text-white" : "text-gray-400 hover:text-gray-600"
              }`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {viewMode === "grid" && (
        <div className="flex md:hidden gap-1.5 overflow-x-auto px-4 pb-3 pt-1 border-b border-gray-100 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {containers.map((c) => {
            const isActive = resolvedActiveTabId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveTabId(c.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all shrink-0 select-none cursor-pointer"
                style={{
                  backgroundColor: isActive ? c.color : "#F3F4F6",
                  color: isActive ? "#FFFFFF" : "#4B5563",
                }}
              >
                <span>{c.title}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    backgroundColor: isActive ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.05)",
                    color: isActive ? "#FFFFFF" : "#4B5563",
                  }}
                >
                  {c.items.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {viewMode === "list" ? (
        <div className="flex-1 overflow-y-auto">
          <LeadListView containers={containers} basePath={basePath} stageMeta={stageMeta} />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-auto pb-6">
          <DndContext
            id="crm-board"
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 px-4 min-w-full md:min-w-max">
              {containers.map((container) => (
                <LeadColumn
                  key={container.id}
                  id={container.id}
                  title={container.title}
                  color={container.color}
                  items={container.items}
                  onAddCard={() => onAddClick?.(container.id as ApiLeadStatus)}
                  basePath={basePath}
                  activeTabId={resolvedActiveTabId}
                  stages={stagesList}
                  onMoveToStage={async (leadId, targetStageId) => {
                    await onStatusChange(leadId, targetStageId as ApiLeadStatus);
                  }}
                  onEditLeadClick={onEditLeadClick}
                  onDeleteLeadClick={onDeleteLeadClick}
                  total={stageMeta?.[container.id]?.total}
                  hasMore={stageMeta?.[container.id]?.hasMore}
                  isFetchingMore={stageMeta?.[container.id]?.isFetchingMore}
                  onLoadMore={() => onLoadMore?.(container.id)}
                />
              ))}
            </div>

            <DragOverlay>
              {activeItem ? (
                <LeadCard
                  item={activeItem}
                  isDragOverlay
                  basePath={basePath}
                  stages={stagesList}
                  currentStageId={resolvedActiveTabId}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function AgentUploadsCard({
  basePath = "/crm",
  leadListUrl,
  totalUploadedLeads = 0,
  topAgentAvatarUrl,
  topAgentName,
}: {
  basePath?: string;
  leadListUrl?: string;
  totalUploadedLeads?: number;
  topAgentAvatarUrl?: string | null;
  topAgentName?: string | null;
}) {
  const router = useRouter();

  return (
    <div className="se-stat-card bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex items-center gap-5 min-w-0 sm:min-w-70">
      {/* Avatar with gradient ring */}
      <div className="relative shrink-0">
        <div
          className="w-20 h-20 rounded-full p-0.75"
          style={{
            background: "linear-gradient(135deg, #2ae9c9 0%, #c974f4 100%)",
          }}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-[#EEF3F8]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveAvatarSrc(topAgentAvatarUrl)}
              alt="Agent"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR;
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[36px] font-bold text-[#0B1215] leading-none">{totalUploadedLeads.toLocaleString()}</span>
          <span className="text-[#9CA3AF] text-[13px] font-medium">Leads</span>
        </div>
        <p className="text-[#6B7280] text-[12px]">
          Uploaded by{" "}
          {topAgentName ? (
            <span className="font-bold text-[#0B1215]">{topAgentName}</span>
          ) : (
            "your Agents"
          )}
        </p>
        <button onClick={() => router.push(leadListUrl ?? `${basePath}/leads`)} className="se-stat-link flex items-center gap-1 text-[12px] font-semibold text-[#0B1215] mt-1 hover:opacity-70 transition-opacity">
          View Leads
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default function CRMPage() {
  const basePath = "/crm";
  const apiBasePath = "/admin" as const;
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const sourceParam = (searchParams.get("source") ?? "").trim().toLowerCase();
  const agentUploadScope = [
    "agent_upload",
    "agent uploaded",
    "agent upload",
    "uploaded_by_agent",
    "uploaded by agent",
    "uploaded_by_agents",
    "uploaded by agents",
  ].includes(sourceParam);

  const salesEngineScope = [
    "sales_engine",
    "sales engine",
    "sales-engine",
    "smart_lead",
    "smart lead",
    "smart-lead",
    "smart_leads",
    "smart leads",
  ].includes(sourceParam);

  const effectiveSourceFilter = agentUploadScope
    ? AGENT_UPLOAD_SOURCE_FILTER
    : salesEngineScope
      ? "sales_engine"
      : sourceParam || undefined;

  const leadListUrl = salesEngineScope
    ? `${basePath}/leads?source=sales_engine`
    : agentUploadScope
      ? `${basePath}/leads?source=${encodeURIComponent(AGENT_UPLOAD_SOURCE_FILTER)}`
      : `${basePath}/leads`;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<ApiLeadStatus>("newly_lead");
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("all");
  const [showFilter, setShowFilter] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadApiItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadApiItem | null>(null);

  const { data: pipelines = [], isLoading: pipelinesLoading, isError: pipelinesError } = useCrmPipelines(companyId ?? undefined, apiBasePath);
  const { data: labels = [], isLoading: labelsLoading, isError: labelsError } = useCrmLabels(companyId ?? undefined, apiBasePath);
  const { data: agentUploadsOverview } = useAgentUploadsOverview(companyId ?? undefined, apiBasePath);

  const stages = useMemo(() => {
    if (!labels.length) return [];
    return labels.map((label) => ({ id: label.slug, title: label.name, color: label.color }));
  }, [labels]);

  const boardStageDefinitions = useMemo(() => {
    const selectedStages =
      selectedLabel === "all" ? stages : stages.filter((stage) => stage.id === selectedLabel);
    return selectedLabel === "all"
      ? [
          ...selectedStages,
          { id: "__uncategorized__" as ApiLeadStatus, title: "Uncategorized", color: "#6B7280" },
        ]
      : selectedStages;
  }, [selectedLabel, stages]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const stageQuery = useLeadStagePages(
    boardStageDefinitions,
    {
      company_id: companyId ?? undefined,
      search: debouncedSearch || undefined,
      pipeline_id: selectedPipelineId ?? undefined,
      source: effectiveSourceFilter,
      per_page: 20,
    },
    apiBasePath,
  );

  const { data: leadsAnalytics, isLoading: isAnalyticsLoading } = useCrmLeadsAnalytics(
    {
      company_id: companyId ?? undefined,
      search: debouncedSearch || undefined,
      pipeline_id: selectedPipelineId ?? undefined,
      status: selectedLabel === "all" ? undefined : selectedLabel,
      source: effectiveSourceFilter,
    },
    apiBasePath
  );



  const visibleStagePages = useMemo(() => {
    if (labelsError || pipelinesError || stageQuery.isError) {
      return (stages.length ? stages : EMPTY_CRM_STAGES).map((stage) => ({
        ...stage, leads: [] as LeadApiItem[], loaded: 0, total: 0,
        hasMore: false, isLoading: false, isFetchingMore: false,
      }));
    }
    const rawStages = stageQuery.stages.filter(
      (stage) => stage.id !== "__uncategorized__" || stage.total > 0
    );
    return rawStages;
  }, [stageQuery.stages, stageQuery.isError, labelsError, pipelinesError, stages]);

  const loadedLeads = useMemo(
    () => visibleStagePages.flatMap((stage) => stage.leads),
    [visibleStagePages],
  );
  const visibleStages = useMemo(
    () => visibleStagePages.map(({ id, title, color }) => ({ id, title, color })),
    [visibleStagePages],
  );
  const initialContainers = useMemo(
    () => buildContainers(loadedLeads, visibleStages),
    [loadedLeads, visibleStages],
  );
  const stageMeta = useMemo(
    () =>
      Object.fromEntries(
        visibleStagePages.map((stage) => [
          stage.id,
          {
            total: stage.total,
            hasMore: stage.hasMore,
            isFetchingMore: stage.isFetchingMore,
          },
        ]),
      ),
    [visibleStagePages],
  );

  const updateMutation = useUpdateLead(undefined, apiBasePath);
  const deleteLeadMutation = useDeleteLead(
    {
      onSuccess: () => {
        toast.success("Lead deleted successfully");
      },
    },
    apiBasePath
  );

  const handleEditLead = (leadId: string) => {
    const lead = loadedLeads.find((entry) => String(entry.id) === leadId);
    if (lead) {
      setEditingLead(lead);
    }
  };

  const handleDeleteLead = (leadId: string) => {
    const lead = loadedLeads.find((entry) => String(entry.id) === leadId);
    if (lead) {
      setDeleteTarget(lead);
    }
  };

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

  async function persistStatusChange(leadId: string, status: ApiLeadStatus) {
    try {
      await updateMutation.mutateAsync({ leadId, payload: { company_id: companyId ?? "", status } });
      toast.success("Lead status updated");
    } catch {
      toast.error("Could not update lead status. Reverting...");
      throw new Error("status update failed");
    }
  }

  if (stageQuery.isLoading || pipelinesLoading || labelsLoading) return <CRMPageSkeleton />;

  return (
    <div className="se-workspace min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto flex flex-col gap-5">
        {/* Top bar */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="relative w-full max-w-90 group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for Leads"
              className="se-search w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowPipelineModal(true)} className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              {selectedPipelineId
                ? (pipelines.find((pipeline) => pipeline.id === selectedPipelineId)?.name ?? "All Pipelines")
                : "All Pipelines"}
              <ChevronDown size={13} />
            </button>

            <button onClick={() => setShowLabelModal(true)} className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <Tag size={13} />
              Label
            </button>
            <button onClick={() => setShowFilter((prev) => !prev)} className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <SlidersHorizontal size={13} />
              Filter
            </button>
            <CrmImportExportButton
              companyId={companyId}
              apiBasePath={apiBasePath}
              pipelines={pipelines}
              labels={labels}
              defaultPipelineId={selectedPipelineId}
              activeFilters={{
                search: debouncedSearch || undefined,
                pipeline_id: selectedPipelineId ?? undefined,
                status: selectedLabel === "all" ? undefined : selectedLabel,
                source: effectiveSourceFilter,
              }}
              onViewImportedPipeline={(pipelineId) => {
                setSelectedPipelineId(pipelineId);
                setSelectedLabel("all");
                setSearch("");
              }}
              onViewAllLeads={() => router.push(`${basePath}/leads`)}
            />
            <button
              onClick={() => { setDefaultStatus("newly_lead"); setIsAddModalOpen(true); }}
              className="se-primary flex items-center gap-2 px-5 py-2.5 bg-[#0B1215] text-white rounded-[10px] text-[12px] font-medium hover:opacity-90 transition-all"
            >
              Add New Leads
              <BookmarkPlus size={15} />
            </button>
          </div>
        </div>

        {salesEngineScope && (
          <div className="flex items-center justify-between rounded-2xl border border-[#09232d]/15 bg-[#09232d]/[0.03] px-4 py-2.5 text-xs text-[#09232d] shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-900">Filtered by: Sales Engine</span>
              <span className="text-slate-500 hidden sm:inline">• Displaying leads discovered and saved from Sales Engine</span>
            </div>
            <button
              type="button"
              onClick={() => router.push(basePath)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-100 transition cursor-pointer"
            >
              <span>Clear Filter</span>
              <X size={12} />
            </button>
          </div>
        )}

        {showFilter && (
          <CrmFilterBar
            pipelines={pipelines}
            labels={labels}
            selectedPipelineId={selectedPipelineId}
            onPipelineChange={setSelectedPipelineId}
            selectedLabel={selectedLabel}
            onLabelChange={setSelectedLabel}
            onClear={() => {
              setSelectedPipelineId(null);
              setSelectedLabel("all");
            }}
          />
        )}

        {/* Summary cards */}
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <TotalLeadsCard
            totalLeads={leadsAnalytics?.total_leads ?? 0}
            weekGrowthPercent={leadsAnalytics?.week_growth_percent ?? 0}
            weekGrowthDirection={leadsAnalytics?.week_growth_direction ?? "flat"}
            isLoading={isAnalyticsLoading}
          />
          <LeadsChart
            dailyTrend={leadsAnalytics?.daily_trend}
            monthNewLeads={leadsAnalytics?.month_new_leads ?? 0}
            monthLabel={leadsAnalytics?.month_label ?? ""}
            highlightDay={leadsAnalytics?.highlight_day}
            isLoading={isAnalyticsLoading}
          />
          {/* <AgentUploadsCard
            basePath={basePath}
            leadListUrl={leadListUrl}
            totalUploadedLeads={agentUploadsOverview?.total_uploaded_leads ?? 0}
            topAgentAvatarUrl={agentUploadsOverview?.top_agent?.avatar_url ?? null}
            topAgentName={agentUploadsOverview?.top_agent?.name ?? null}
          /> */}
        </div>

        {/* Pipeline board */}
        <LeadBoard
          basePath={basePath}
          leadListUrl={agentUploadScope ? leadListUrl : undefined}
          initialContainers={initialContainers}
          onStatusChange={persistStatusChange}
          onAddClick={(status) => { setDefaultStatus(status); setIsAddModalOpen(true); }}
          onEditLeadClick={handleEditLead}
          onDeleteLeadClick={handleDeleteLead}
          isLoading={stageQuery.isLoading}
          stageMeta={stageMeta}
          onLoadMore={(stageId) => stageQuery.loadMore(stageId as ApiLeadStatus)}
        />
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

      {showPipelineModal && companyId && (
        <PipelineManagerModal
          companyId={companyId}
          apiBasePath={apiBasePath}
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          onSelectPipeline={(pipelineId) => {
            setSelectedPipelineId(pipelineId);
          }}
          onClose={() => setShowPipelineModal(false)}
        />
      )}

      {showLabelModal && companyId && (
        <LabelManagerModal
          companyId={companyId}
          apiBasePath={apiBasePath}
          labels={labels}
          onClose={() => setShowLabelModal(false)}
        />
      )}

    </div>
  );
}
