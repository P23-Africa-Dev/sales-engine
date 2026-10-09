"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { DndItem } from "@/types/operations";
import { KpiCard } from "./kpi-card";
import { BarChart2 } from "lucide-react";

interface KpiColumnProps {
  id: string;
  title: string;
  color: string;
  items: DndItem[];
  onKpiClick?: (item: DndItem) => void;
  onKpiEdit?: (item: DndItem) => void;
  onKpiDelete?: (item: DndItem) => void;
}

export function KpiColumn({ id, title, color, items, onKpiClick, onKpiEdit, onKpiDelete }: KpiColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col relative h-full">
      {/* Column Header */}
      <div
        className="rounded-t-[30px] px-7.5 pt-3.25 pb-8 flex gap-3 items-center"
        style={{ backgroundColor: color }}
      >
        <h3 className="text-white font-medium text-sm">{title}</h3>
        <div
          className="rounded-full min-w-7 h-7 px-2 flex items-center justify-center font-bold text-xs bg-white"
          style={{ color }}
        >
          {items.length}
        </div>
      </div>

      {/* Droppable Body */}
      <div
        ref={setNodeRef}
        className={`flex-1 relative z-10 -mt-8 transition-colors duration-200 min-h-[300px] flex flex-col ${
          isOver ? "bg-gray-100/50 rounded-[32px] ring-2 ring-inset ring-gray-200" : ""
        }`}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="pt-2">
            {items.map((item) => (
              <KpiCard
                key={item.id}
                item={item}
                onClick={onKpiClick}
                onEdit={onKpiEdit}
                onDelete={onKpiDelete}
              />
            ))}
          </div>
        </SortableContext>

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-300 mt-8">
            <BarChart2 size={28} strokeWidth={1.5} />
            <span className="text-[12px] font-medium">No KPIs here</span>
          </div>
        )}
      </div>
    </div>
  );
}
