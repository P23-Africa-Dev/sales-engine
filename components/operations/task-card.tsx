'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DndItem } from '@/types/operations';
import { Pencil, Trash2 } from 'lucide-react';

interface TaskCardProps {
  item: DndItem;
  onClick?: (item: DndItem) => void;
  onViewMap?: (item: DndItem) => void;
  onEdit?: (item: DndItem) => void;
  onDelete?: (item: DndItem) => void;
}

export function TaskCard({ item, onClick, onViewMap, onEdit, onDelete }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFallbackLocation =
    !item.location ||
    item.location.startsWith("Created:") ||
    item.location === "No location set" ||
    item.location === "Location not set";

  let displayLocation = item.location;
  if (isFallbackLocation) {
    if (item.location?.startsWith("Created:")) {
      displayLocation = item.location.replace(/^Created:\s*/i, "");
    } else if (item.createdAt) {
      try {
        const d = new Date(item.createdAt);
        if (!isNaN(d.getTime())) {
          displayLocation = d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }
      } catch {
        displayLocation = item.location;
      }
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        group relative bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col gap-6
        cursor-pointer transition-all duration-200 select-none mb-3
        ${isDragging ? 'opacity-50 scale-105 z-50 shadow-xl cursor-grabbing' : 'hover:shadow-md hover:-translate-y-0.5'}
      `}
      onClick={() => onClick?.(item)}
    >
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            className="h-8 w-8 rounded-full bg-white border border-gray-200 text-[#094B5C] hover:bg-gray-50 flex items-center justify-center"
            aria-label="Edit task"
          >
            <Pencil size={14} />
          </button>
        ) : null}
        {onDelete ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            className="h-8 w-8 rounded-full bg-white border border-gray-200 text-red-500 hover:bg-red-50 flex items-center justify-center"
            aria-label="Delete task"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      <div>
        <h4 className="text-[#0B1215] font-bold text-[17px] tracking-tight">{item.label}</h4>
        <p className="text-gray-400 text-[13px] mt-1">{item.description}</p>
      </div>

      <div className="space-y-2.5">
        <span className="text-[#0B1215] font-bold text-[15px] block">
          {isFallbackLocation ? "Created" : "Location"}
        </span>
        <div className="flex items-start justify-between gap-3">
          <span className={`text-[12px] leading-relaxed flex-1 ${
            isFallbackLocation
              ? "text-gray-400 no-underline"
              : "text-gray-500 underline decoration-gray-300 underline-offset-4"
          }`}>
            {displayLocation}
          </span>
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            {item.hasTrackableLocation ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewMap?.(item);
                }}
                className="bg-[#D15FE2] text-white text-[10px] font-semibold px-3 py-1.5 rounded-full hover:bg-[#B14FC2] transition-colors"
              >
                View on Map
              </button>
            ) : null}
            <span className="text-gray-400 text-[11px]">{item.time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
