import {
  isLiveTaskStale,
  resolveOperationalStatusFromTask,
  taskAgeMs,
} from "@/lib/tracking/operational-status";
import type { LiveTaskState } from "@/types/tracking";

export { taskAgeMs, isLiveTaskStale };

/** Matches backend `tracking.agent_location_stale_after_seconds` default (300s). */
export const TRACKING_STALE_MS = 300_000;

export function hasUsableTaskPosition(task: LiveTaskState): boolean {
  return task.lastPosition[0] !== 0 || task.lastPosition[1] !== 0;
}

/**
 * Agent is actively on a live tracking session right now.
 * Uses open session + recent GPS + backend online flag when present.
 * Delayed agents still count as active while they are tracking.
 */
export function isActivelyOnTask(
  task: LiveTaskState,
  nowMs: number,
  staleMs: number = TRACKING_STALE_MS,
): boolean {
  if (!hasUsableTaskPosition(task)) return false;
  if (task.status === "completed") return false;
  if (task.trackingSessionId <= 0) return false;

  // Freshness is judged by the client's own clock against the event time, which
  // is internally consistent. The backend `is_online` / `operational_status`
  // "offline" flags are derived from server-vs-device time and misfire under
  // clock skew (a live, actively-tracking agent then looks offline), so they
  // must NOT gate activity here.
  if (isLiveTaskStale(task, nowMs, staleMs)) return false;

  const operationalStatus = resolveOperationalStatusFromTask(task, nowMs, staleMs);
  return operationalStatus !== "completed";
}

export function isHistoryFeedTask(
  task: LiveTaskState,
  nowMs: number,
  staleMs: number = TRACKING_STALE_MS,
): boolean {
  if (!hasUsableTaskPosition(task)) return false;
  if (isActivelyOnTask(task, nowMs, staleMs)) return false;
  return true;
}

function sortByLastEventDesc(a: LiveTaskState, b: LiveTaskState): number {
  return new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime();
}

export function splitLiveFeedTasks(
  tasks: LiveTaskState[],
  nowMs: number,
  staleMs: number = TRACKING_STALE_MS,
): { active: LiveTaskState[]; history: LiveTaskState[] } {
  const active: LiveTaskState[] = [];
  const history: LiveTaskState[] = [];

  for (const task of tasks) {
    if (!hasUsableTaskPosition(task)) continue;
    if (isActivelyOnTask(task, nowMs, staleMs)) {
      active.push(task);
    } else {
      history.push(task);
    }
  }

  active.sort(sortByLastEventDesc);
  history.sort(sortByLastEventDesc);

  return { active, history };
}

export function shouldShowTrajectory(
  taskId: number,
  selectedTaskId: number | null,
  followAllActive: boolean,
  activeTaskIds: ReadonlySet<number>,
): boolean {
  if (activeTaskIds.has(taskId)) return true;
  if (followAllActive) return false;
  return selectedTaskId != null && selectedTaskId === taskId;
}

export function resolveMapTasks(
  active: LiveTaskState[],
  history: LiveTaskState[],
  selectedTaskId: number | null,
): LiveTaskState[] {
  if (selectedTaskId == null) return active;

  const selectedHistory = history.find((task) => task.taskId === selectedTaskId);
  if (!selectedHistory) return active;
  if (active.some((task) => task.taskId === selectedTaskId)) return active;

  return [...active, selectedHistory];
}

export function resolveTrajectoryTaskIds(
  active: LiveTaskState[],
  selectedTaskId: number | null,
  _followAllActive: boolean,
): Set<number> {
  const ids = new Set(active.map((task) => task.taskId));
  if (selectedTaskId != null) ids.add(selectedTaskId);
  return ids;
}

export function taskMatchesSearch(task: LiveTaskState, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return (
    task.agentName.toLowerCase().includes(q) ||
    (task.taskTitle ?? "").toLowerCase().includes(q) ||
    (task.projectName ?? "").toLowerCase().includes(q) ||
    (task.taskAddress ?? "").toLowerCase().includes(q) ||
    String(task.taskId).includes(q)
  );
}

/** Count open/live tasks per agent (userId). Completed tasks are excluded. */
export function countLiveTasksByAgent(
  tasks: LiveTaskState[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const task of tasks) {
    if (task.status === "completed") continue;
    if (task.userId <= 0) continue;
    counts.set(task.userId, (counts.get(task.userId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Prefer the most recently updated task per agent for map pins, keeping every
 * task available in the store/feed. Selected task is always retained.
 */
export function resolvePreferredMapTasks(
  tasks: LiveTaskState[],
  selectedTaskId: number | null,
): LiveTaskState[] {
  const byAgent = new Map<number, LiveTaskState>();
  const orphans: LiveTaskState[] = [];

  const sorted = [...tasks].sort(sortByLastEventDesc);

  for (const task of sorted) {
    if (task.userId <= 0) {
      orphans.push(task);
      continue;
    }
    if (!byAgent.has(task.userId)) {
      byAgent.set(task.userId, task);
    }
  }

  const preferred = [...byAgent.values(), ...orphans];
  if (selectedTaskId == null) return preferred;

  const selected = tasks.find((t) => t.taskId === selectedTaskId);
  if (!selected) return preferred;
  if (preferred.some((t) => t.taskId === selectedTaskId)) return preferred;
  return [...preferred, selected];
}

export function formatRelativeLastSeen(
  iso: string | undefined,
  nowMs: number,
): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const ageMs = Math.max(0, nowMs - then);
  const sec = Math.floor(ageMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
