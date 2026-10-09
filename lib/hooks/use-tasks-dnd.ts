'use client';

import { useState, useCallback } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DndContainer, DndItem } from '@/types/operations';

export function useDragAndDrop(initialContainers: DndContainer[]) {
  const [containers, setContainers] = useState<DndContainer[]>(initialContainers);

  const findContainer = useCallback(
    (id: string) => {
      if (containers.some((c) => c.id === id)) {
        return containers.find((c) => c.id === id);
      }
      return containers.find((c) => c.items.some((item) => item.id === id));
    },
    [containers]
  );

  const addItem = useCallback((containerId: string, item: DndItem) => {
    setContainers((prev) =>
      prev.map((c) =>
        c.id === containerId ? { ...c, items: [...c.items, item] } : c
      )
    );
  }, []);

  const moveItem = useCallback(
    (activeId: string, overId: string, containerId: string) => {
      setContainers((prev) => {
        const container = prev.find((c) => c.id === containerId);
        if (!container) return prev;
        const activeIndex = container.items.findIndex((i) => i.id === activeId);
        const overIndex = container.items.findIndex((i) => i.id === overId);
        return prev.map((c) => {
          if (c.id === containerId) {
            return { ...c, items: arrayMove(c.items, activeIndex, overIndex) };
          }
          return c;
        });
      });
    },
    []
  );

  const moveToContainer = useCallback(
    (activeId: string, overContainerId: string) => {
      setContainers((prev) => {
        const activeContainer = prev.find((c) => c.items.some((i) => i.id === activeId));
        const overContainer = prev.find((c) => c.id === overContainerId);
        if (!activeContainer || !overContainer) return prev;
        const activeItem = activeContainer.items.find((i) => i.id === activeId);
        if (!activeItem) return prev;
        return prev.map((c) => {
          if (c.id === activeContainer.id) return { ...c, items: c.items.filter((i) => i.id !== activeId) };
          if (c.id === overContainerId) return { ...c, items: [...c.items, activeItem] };
          return c;
        });
      });
    },
    []
  );

  const moveBetweenContainers = useCallback(
    (activeId: string, overId: string, activeContainerId: string, overContainerId: string) => {
      setContainers((prev) => {
        const activeContainer = prev.find((c) => c.id === activeContainerId);
        const overContainer = prev.find((c) => c.id === overContainerId);
        if (!activeContainer || !overContainer) return prev;
        const activeItem = activeContainer.items.find((i) => i.id === activeId);
        if (!activeItem) return prev;
        const overIndex = overContainer.items.findIndex((i) => i.id === overId);
        return prev.map((c) => {
          if (c.id === activeContainerId) return { ...c, items: c.items.filter((i) => i.id !== activeId) };
          if (c.id === overContainerId) {
            const newItems = [...overContainer.items];
            newItems.splice(overIndex, 0, activeItem);
            return { ...c, items: newItems };
          }
          return c;
        });
      });
    },
    []
  );

  return { containers, addItem, moveItem, moveToContainer, moveBetweenContainers, findContainer };
}
