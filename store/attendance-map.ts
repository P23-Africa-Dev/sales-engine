import { create } from "zustand";
import type { AttendanceMapSnapshotItem } from "@/lib/api/attendance";

interface AttendanceMapStore {
  items: Record<number, AttendanceMapSnapshotItem>;
  selectedUserId: number | null;
  setSnapshots: (items: AttendanceMapSnapshotItem[]) => void;
  upsertSnapshot: (item: AttendanceMapSnapshotItem) => void;
  removeSnapshot: (userId: number) => void;
  setSelectedUserId: (userId: number | null) => void;
}

export const useAttendanceMapStore = create<AttendanceMapStore>((set) => ({
  items: {},
  selectedUserId: null,
  setSnapshots: (items) =>
    set({
      items: Object.fromEntries(items.map((item) => [item.user_id, item])),
    }),
  upsertSnapshot: (item) =>
    set((state) => ({
      items: { ...state.items, [item.user_id]: item },
    })),
  removeSnapshot: (userId) =>
    set((state) => {
      const next = { ...state.items };
      delete next[userId];
      return { items: next };
    }),
  setSelectedUserId: (userId) => set({ selectedUserId: userId }),
}));
