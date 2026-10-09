"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { DndContainer, DndItem } from "@/types/operations";
import { KpiColumn } from "./kpi-column";
import { KpiCard } from "./kpi-card";

interface KpiBoardProps {
  containers: DndContainer[];
  onKpiClick?: (item: DndItem, containerId: string) => void;
  onKpiEdit?: (item: DndItem, containerId: string) => void;
  onKpiDelete?: (item: DndItem, containerId: string) => void;
  canManageCards?: boolean;
  findContainer: (id: string) => DndContainer | undefined;
  moveItem: (activeId: string, overId: string, containerId: string) => void;
  moveToContainer: (activeId: string, overContainerId: string) => void;
  moveBetweenContainers: (
    activeId: string,
    overId: string,
    activeContainerId: string,
    overContainerId: string
  ) => void;
  onStatusDrop?: (activeId: string, fromContainerId: string, toContainerId: string) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

export function KpiBoard({
  containers,
  onKpiClick,
  onKpiEdit,
  onKpiDelete,
  canManageCards = false,
  findContainer,
  moveItem,
  moveToContainer,
  moveBetweenContainers,
  onStatusDrop,
  onDragStateChange,
}: KpiBoardProps) {
  const [activeItem, setActiveItem] = useState<DndItem | null>(null);
  const [dragStartContainerId, setDragStartContainerId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    onDragStateChange?.(true);
    const container = findContainer(active.id as string);
    const item = container?.items.find((i) => i.id === active.id);
    setDragStartContainerId(container?.id ?? null);
    setActiveItem(item ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(activeId);
    const overIsContainer = containers.some((c) => c.id === overId);
    const overContainer = overIsContainer
      ? containers.find((c) => c.id === overId)
      : findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeContainer.id === overContainer.id) return;
    if (overIsContainer) {
      moveToContainer(activeId, overId);
    } else {
      moveBetweenContainers(activeId, overId, activeContainer.id, overContainer.id);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);
    onDragStateChange?.(false);
    if (!over) {
      setDragStartContainerId(null);
      return;
    }
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(activeId);
    const overIsContainer = containers.some((c) => c.id === overId);
    const overContainer = overIsContainer
      ? containers.find((c) => c.id === overId)
      : findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeId !== overId && activeContainer.id === overContainer.id) {
      moveItem(activeId, overId, activeContainer.id);
    }
    if (onStatusDrop && dragStartContainerId && dragStartContainerId !== overContainer.id) {
      onStatusDrop(activeId, dragStartContainerId, overContainer.id);
    }
    setDragStartContainerId(null);
  }

  function handleDragCancel() {
    setActiveItem(null);
    setDragStartContainerId(null);
    onDragStateChange?.(false);
  }

  return (
    <DndContext
      id="kpi-board-context"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {containers.map((container) => (
          <KpiColumn
            key={container.id}
            id={container.id}
            title={container.title}
            color={container.color}
            items={container.items}
            onKpiClick={(item) => onKpiClick?.(item, container.id)}
            onKpiEdit={canManageCards ? (item) => onKpiEdit?.(item, container.id) : undefined}
            onKpiDelete={canManageCards ? (item) => onKpiDelete?.(item, container.id) : undefined}
          />
        ))}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="shadow-2xl scale-105 pointer-events-none">
            <KpiCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
