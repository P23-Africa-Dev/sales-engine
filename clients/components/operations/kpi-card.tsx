"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DndItem } from "@/types/operations";
import { User, CalendarDays, Pencil, Trash2 } from "lucide-react";

interface KpiCardProps {
  item: DndItem;
  onClick?: (item: DndItem) => void;
  onEdit?: (item: DndItem) => void;
  onDelete?: (item: DndItem) => void;
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  sales_visit:   { bg: "#DBEAFE", text: "#1E3A8A", label: "Sales" },
  collection:    { bg: "#EDE9FE", text: "#5B21B6", label: "Collection" },
  inspection:    { bg: "#FEF3C7", text: "#92400E", label: "Inspection" },
  delivery:      { bg: "#CCFBF1", text: "#0D4E4E", label: "Delivery" },
  awareness:     { bg: "#FCE7F3", text: "#9D174D", label: "Awareness" },
  general:       { bg: "#E2E8F0", text: "#334155", label: "General" },
};

const PRIORITY_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  high:     { dot: "#EF4444", text: "#991B1B", label: "High" },
  medium:   { dot: "#F59E0B", text: "#92400E", label: "Medium" },
  low:      { dot: "#10B981", text: "#166534", label: "Low" },
  critical: { dot: "#7C3AED", text: "#4C1D95", label: "Critical" },
};

function CategoryBadge({ category }: { category?: string }) {
  const style = category
    ? (CATEGORY_STYLES[category] ?? { bg: "#E2E8F0", text: "#334155", label: category })
    : null;
  if (!style) return null;
  return (
    <span
      className="text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide uppercase"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  const p = priority?.toLowerCase();
  const style = p ? PRIORITY_STYLES[p] : null;
  if (!style) return null;
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: style.dot }}
      />
      <span className="text-[11px] font-semibold" style={{ color: style.text }}>
        {style.label}
      </span>
    </span>
  );
}

export function KpiCard({ item, onClick, onEdit, onDelete }: KpiCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(item)}
      className={`
        group relative bg-white rounded-[24px] p-5 border border-gray-100
        shadow-[0px_2px_12px_rgba(0,0,0,0.05)]
        flex flex-col gap-3.5
        cursor-pointer select-none mb-3 transition-all duration-200
        ${isDragging
          ? "opacity-50 scale-105 z-50 shadow-xl cursor-grabbing"
          : "hover:shadow-md hover:-translate-y-0.5"
        }
      `}
    >
      {(onEdit || onDelete) && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-7 w-7 rounded-full bg-white border border-gray-200 text-[#094B5C] hover:bg-gray-50 flex items-center justify-center"
              aria-label="Edit KPI"
            >
              <Pencil size={13} />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-7 w-7 rounded-full bg-white border border-gray-200 text-red-500 hover:bg-red-50 flex items-center justify-center"
              aria-label="Delete KPI"
            >
              <Trash2 size={13} />
            </button>
          ) : null}
        </div>
      )}

      {/* Top row — category + priority */}
      <div className="flex items-center justify-between gap-2">
        <CategoryBadge category={item.category} />
        <PriorityBadge priority={item.priority} />
      </div>

      {/* KPI Name */}
      <div>
        <h4 className="text-[#0B1215] font-bold text-[15px] leading-snug tracking-tight">
          {item.description}
        </h4>
        {item.addedDescription && (
          <p className="text-gray-400 text-[12px] mt-1 line-clamp-2 leading-relaxed">
            {item.addedDescription}
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* Footer — assignee + due date */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <User size={12} className="text-gray-400 shrink-0" />
          <span className="text-[12px] text-gray-500 font-medium truncate">
            {item.label || "Unassigned"}
          </span>
        </div>
        {item.dueDate && (
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarDays size={12} className="text-gray-400" />
            <span className="text-[11px] text-gray-400 font-medium">{item.dueDate}</span>
          </div>
        )}
      </div>
    </div>
  );
}
