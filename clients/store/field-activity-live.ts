import { create } from "zustand";

export type FieldActivityLiveStop = {
  id: number;
  field_activity_session_id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  duration_seconds?: number;
  classification?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
};

export type FieldActivityLiveAgent = {
  userId: number;
  name: string;
  avatarUrl: string | null;
  sessionId: number;
  lastPosition: [number, number] | null;
  lastMovementState: string | null;
  lastRecordedAt: string | null;
  polyline: [number, number][];
  stops: FieldActivityLiveStop[];
};

const MAX_POLYLINE_PTS = 2000;

type FieldActivityLiveStore = {
  agents: Record<number, FieldActivityLiveAgent>;
  followUserId: number | null;
  followAll: boolean;
  focusMode: boolean;
  hydrate: (agents: FieldActivityLiveAgent[]) => void;
  appendPoint: (
    userId: number,
    point: [number, number],
    meta?: {
      sessionId?: number;
      movementState?: string | null;
      recordedAt?: string | null;
      name?: string;
    },
  ) => void;
  upsertStop: (userId: number, stop: FieldActivityLiveStop) => void;
  removeAgent: (userId: number) => void;
  clear: () => void;
  setFollowUserId: (userId: number | null) => void;
  setFollowAll: (value: boolean) => void;
  setFocusMode: (value: boolean) => void;
};

function appendPolyline(
  prev: [number, number][],
  point: [number, number],
): [number, number][] {
  const last = prev[prev.length - 1];
  if (last && last[0] === point[0] && last[1] === point[1]) {
    return prev;
  }
  const next = [...prev, point];
  return next.length > MAX_POLYLINE_PTS ? next.slice(-MAX_POLYLINE_PTS) : next;
}

export const useFieldActivityLiveStore = create<FieldActivityLiveStore>((set) => ({
  agents: {},
  followUserId: null,
  followAll: false,
  focusMode: false,

  hydrate: (agents) =>
    set({
      agents: Object.fromEntries(agents.map((agent) => [agent.userId, agent])),
    }),

  appendPoint: (userId, point, meta) =>
    set((state) => {
      const existing = state.agents[userId];
      if (!existing) {
        if (!meta?.sessionId) return state;
        return {
          agents: {
            ...state.agents,
            [userId]: {
              userId,
              name: meta.name ?? "Agent",
              avatarUrl: null,
              sessionId: meta.sessionId,
              lastPosition: point,
              lastMovementState: meta.movementState ?? null,
              lastRecordedAt: meta.recordedAt ?? null,
              polyline: [point],
              stops: [],
            },
          },
        };
      }

      return {
        agents: {
          ...state.agents,
          [userId]: {
            ...existing,
            lastPosition: point,
            lastMovementState: meta?.movementState ?? existing.lastMovementState,
            lastRecordedAt: meta?.recordedAt ?? existing.lastRecordedAt,
            sessionId: meta?.sessionId ?? existing.sessionId,
            polyline: appendPolyline(existing.polyline, point),
          },
        },
      };
    }),

  upsertStop: (userId, stop) =>
    set((state) => {
      const existing = state.agents[userId];
      if (!existing) return state;
      const without = existing.stops.filter((s) => s.id !== stop.id);
      return {
        agents: {
          ...state.agents,
          [userId]: {
            ...existing,
            stops: [...without, stop],
          },
        },
      };
    }),

  removeAgent: (userId) =>
    set((state) => {
      const next = { ...state.agents };
      delete next[userId];
      return {
        agents: next,
        followUserId: state.followUserId === userId ? null : state.followUserId,
      };
    }),

  clear: () => set({ agents: {}, followUserId: null, followAll: false, focusMode: false }),

  setFollowUserId: (userId) =>
    set({
      followUserId: userId,
      followAll: false,
      focusMode: userId != null,
    }),

  setFollowAll: (value) =>
    set({
      followAll: value,
      followUserId: null,
      focusMode: false,
    }),

  setFocusMode: (value) => set({ focusMode: value }),
}));
