"use client";

import { ChevronDown, MoreHorizontal, Radio, Users } from "lucide-react";
import { useMemo } from "react";

import { AgentAvatar } from "@/components/map/agent-avatar";
import {
  OPERATIONAL_STATUS_META,
  resolveOperationalStatusFromTask,
} from "@/lib/tracking/operational-status";
import {
  countLiveTasksByAgent,
  formatRelativeLastSeen,
  splitLiveFeedTasks,
  taskMatchesSearch,
  TRACKING_STALE_MS,
} from "@/lib/tracking/live-feed-groups";
import type { LiveTaskState } from "@/types/tracking";

function formatMetricDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) return "--";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatSpeed(speedMps: number | null | undefined): string {
  if (speedMps == null || Number.isNaN(speedMps)) return "--";
  return `${(speedMps * 3.6).toFixed(1)} km/h`;
}

function formatEta(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || etaSeconds < 0) return "--";
  if (etaSeconds < 60) return "<1 min";
  const minutes = Math.round(etaSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

interface LiveFeedsPanelProps {
  tasks: LiveTaskState[];
  nowMs: number;
  selectedTaskId: number | null;
  isInitialHydrating: boolean;
  followAllActive: boolean;
  showHistory: boolean;
  searchQuery?: string;
  onToggleHistory: () => void;
  onToggleFollowAll: () => void;
  onSelectTask: (taskId: number) => void;
  /** Opens route history for a completed / stale feed task. */
  onViewHistoryTask?: (task: LiveTaskState) => void;
}

function LoadingFeedCard() {
  return (
    <div className="w-full rounded-[20px] bg-[#F8FAFC] px-4 py-3.5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-200 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-4 w-28 rounded-full bg-slate-200" />
            <div className="h-5 w-16 rounded-full bg-slate-200" />
          </div>
          <div className="mt-2 h-3 w-40 rounded-full bg-slate-200" />
          <div className="mt-2 h-3 w-32 rounded-full bg-slate-200" />
        </div>
        <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0" />
      </div>
    </div>
  );
}

function FeedCard({
  task,
  isSelected,
  nowMs,
  liveTaskCount = 1,
  onSelect,
}: {
  task: LiveTaskState;
  isSelected: boolean;
  nowMs: number;
  liveTaskCount?: number;
  onSelect: () => void;
}) {
  const operationalStatus = resolveOperationalStatusFromTask(task, nowMs, TRACKING_STALE_MS);
  const statusMeta = OPERATIONAL_STATUS_META[operationalStatus];
  const lastSeen = formatRelativeLastSeen(task.lastEventAt, nowMs);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-all rounded-[20px] ${
        isSelected ? "bg-[#0A192F]" : "bg-[#F8FAFC] hover:bg-gray-100"
      }`}
    >
      <div className="relative shrink-0">
        <AgentAvatar
          key={`${task.taskId}-${task.agentAvatarUrl ?? ""}`}
          name={task.agentName}
          avatarUrl={task.agentAvatarUrl}
          sizeClassName="w-12 h-12"
        />
        {liveTaskCount > 1 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white"
            title={`${liveTaskCount} live tasks`}
          >
            {liveTaskCount > 9 ? "9+" : liveTaskCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`text-[14px] font-bold truncate ${
              isSelected ? "text-white" : "text-dash-dark"
            }`}
          >
            {task.agentName || "Agent"}
          </p>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isSelected
                ? "bg-white/15 text-white border border-white/20"
                : statusMeta.badgeClassName
            }`}
          >
            {statusMeta.label}
          </span>
        </div>
        <p
          className={`text-[12px] truncate mt-0.5 ${
            isSelected ? "text-gray-300" : "text-gray-500"
          }`}
        >
          {task.taskAddress ?? task.taskTitle ?? `Task #${task.taskId}`}
        </p>
        {(task.projectName ?? "").length > 0 && (
          <p
            className={`text-[10px] mt-1 truncate ${
              isSelected ? "text-slate-300" : "text-slate-500"
            }`}
          >
            Project {task.projectName}
          </p>
        )}
        <p
          className={`text-[10px] mt-1 ${
            isSelected ? "text-slate-300" : "text-slate-500"
          }`}
        >
          Last seen {lastSeen} · ETA {formatEta(task.etaSeconds)} · Speed{" "}
          {formatSpeed(task.speedMps)} · Left {formatMetricDistance(task.distanceRemainingMeters)}
        </p>
      </div>
      <MoreHorizontal size={20} className={isSelected ? "text-white/50" : "text-gray-400"} />
    </button>
  );
}

export function LiveFeedsPanel({
  tasks,
  nowMs,
  selectedTaskId,
  isInitialHydrating,
  followAllActive,
  showHistory,
  searchQuery = "",
  onToggleHistory,
  onToggleFollowAll,
  onSelectTask,
  onViewHistoryTask,
}: LiveFeedsPanelProps) {
  const needle = searchQuery.trim();
  const { active, history } = splitLiveFeedTasks(tasks, nowMs, TRACKING_STALE_MS);
  const agentTaskCounts = useMemo(() => countLiveTasksByAgent(tasks), [tasks]);

  const selectHistoryTask = (task: LiveTaskState) => {
    onSelectTask(task.taskId);
    // Route history slide-in disabled — see docs/map-route-history-panel.md
    // onViewHistoryTask?.(task);
  };

  const searchResults = useMemo(() => {
    if (!needle) return [];
    return [...active, ...history]
      .filter((task) => taskMatchesSearch(task, needle))
      .slice(0, 12);
  }, [active, history, needle]);

  if (needle) {
    return (
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-2">
        {isInitialHydrating ? (
          <>
            <LoadingFeedCard />
            <LoadingFeedCard />
          </>
        ) : searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Radio size={24} className="text-gray-200" />
            <p className="text-[12px] text-gray-400">No matching agents</p>
          </div>
        ) : (
          searchResults.map((task) => (
            <FeedCard
              key={task.taskId}
              task={task}
              isSelected={selectedTaskId === task.taskId}
              nowMs={nowMs}
              liveTaskCount={agentTaskCounts.get(task.userId) ?? 1}
              onSelect={() => onSelectTask(task.taskId)}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 flex flex-col gap-2 min-h-0">
      <div className="flex items-center justify-between gap-2 shrink-0 pb-1">
        <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold">
          {isInitialHydrating ? "Active (Loading...)" : `Active (${active.length})`}
        </span>
        <button
          type="button"
          onClick={onToggleFollowAll}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            followAllActive
              ? "bg-[#0A192F] text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Users size={13} />
          {followAllActive ? "Following all" : "Follow all"}
        </button>
      </div>

      {isInitialHydrating ? (
        <>
          <LoadingFeedCard />
          <LoadingFeedCard />
        </>
      ) : active.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Radio size={24} className="text-gray-200" />
          <p className="text-[12px] text-gray-400 text-center">
            No agents actively tracking
          </p>
        </div>
      ) : (
        active.map((task) => (
          <FeedCard
            key={task.taskId}
            task={task}
            isSelected={selectedTaskId === task.taskId}
            nowMs={nowMs}
            liveTaskCount={agentTaskCounts.get(task.userId) ?? 1}
            onSelect={() => onSelectTask(task.taskId)}
          />
        ))
      )}

      {history.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2 shrink-0">
          <button
            type="button"
            onClick={onToggleHistory}
            className="w-full flex items-center justify-between gap-2 px-1 py-2 text-left text-[12px] font-semibold text-slate-600 hover:text-slate-800"
          >
            <span>Tracking history ({history.length})</span>
            <ChevronDown
              size={16}
              className={`transition-transform ${showHistory ? "rotate-180" : ""}`}
            />
          </button>
          {showHistory && (
            <div className="space-y-2 mt-1">
              {history.map((task) => (
                <FeedCard
                  key={task.taskId}
                  task={task}
                  isSelected={selectedTaskId === task.taskId}
                  nowMs={nowMs}
                  liveTaskCount={agentTaskCounts.get(task.userId) ?? 1}
                  onSelect={() => onSelectTask(task.taskId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
