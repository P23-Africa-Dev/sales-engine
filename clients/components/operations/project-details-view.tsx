"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, SlidersHorizontal, BookmarkPlus, Loader2 } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { TaskBoard } from "@/components/operations/task-board";
import { OperationsCalendar } from "@/components/operations/operations-calendar";
import { CreateTaskModal } from "@/components/operations/create-task-modal";
import { TaskDetailModal } from "@/components/operations/task-detail-modal";
import { ProjectDetailsSkeleton } from "@/components/operations/skeletons/project-details-skeleton";
import { useProject } from "@/hooks/use-projects";
import { useTasks, useUpdateTaskStatusAdmin } from "@/hooks/use-tasks";
import type { DndContainer, DndItem } from "@/types/operations";
import type { ApiTaskStatus, TaskApiItem } from "@/lib/api/tasks";
import { formatTaskLocationLabel, hasTrackableTaskLocation } from "@/lib/tasks/location";
import { buildTaskMapUrl } from "@/lib/tasks/map-navigation";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";

// ─── Pie chart label ──────────────────────────────────────────────────────────
function CustomLabel({
  cx = 0, cy = 0, midAngle = 0,
  innerRadius = 0, outerRadius = 0, value = 0,
}: {
  cx?: number; cy?: number; midAngle?: number;
  innerRadius?: number; outerRadius?: number; value?: number;
}) {
  if (value === 0) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <circle cx={x} cy={y} r={22} fill="white" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fill="#0B1215" fontSize={13} fontWeight={800}>
        {value}%
      </text>
    </g>
  );
}

export function ProjectDetailsView({ projectId, basePath }: { projectId: string; basePath: string }) {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(authUser);
  const canManageTaskStatuses =
    role === "owner" ||
    role === "admin" ||
    role === "management" ||
    role === "manager" ||
    role === "supervisor";

  const { data: project, isPending: loadingProject } = useProject(projectId, basePath);
  const { data: tasksData, isPending: loadingTasks } = useTasks({ project_id: projectId });
  const statusMutation = useUpdateTaskStatusAdmin();

  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ item: DndItem; containerId: string } | null>(null);
  const serverContainers = useMemo(
    () => buildContainers(tasksData?.tasks ?? []),
    [tasksData?.tasks],
  );
  const [boardContainers, setBoardContainers] = useState<DndContainer[]>(serverContainers);
  const [isDraggingBoard, setIsDraggingBoard] = useState(false);
  const [pendingServerContainers, setPendingServerContainers] = useState<DndContainer[] | null>(null);
  const [prevServerContainers, setPrevServerContainers] = useState(serverContainers);

  if (serverContainers !== prevServerContainers) {
    setPrevServerContainers(serverContainers);
    if (isDraggingBoard) {
      setPendingServerContainers(serverContainers);
    } else {
      setBoardContainers(serverContainers);
      setPendingServerContainers(null);
    }
  }

  const handleDragStateChange = useCallback((dragging: boolean) => {
    if (!dragging && pendingServerContainers) {
      setBoardContainers(pendingServerContainers);
      setPrevServerContainers(pendingServerContainers);
      setPendingServerContainers(null);
    }
    setIsDraggingBoard(dragging);
  }, [pendingServerContainers]);

  const findContainer = useCallback(
    (id: string) => {
      if (boardContainers.some((c) => c.id === id)) {
        return boardContainers.find((c) => c.id === id);
      }

      return boardContainers.find((c) => c.items.some((item) => item.id === id));
    },
    [boardContainers]
  );

  const moveItem = useCallback((activeId: string, overId: string, containerId: string) => {
    if (!canManageTaskStatuses) return;

    setBoardContainers((prev) =>
      prev.map((container) => {
        if (container.id !== containerId) return container;

        const activeIndex = container.items.findIndex((item) => item.id === activeId);
        const overIndex = container.items.findIndex((item) => item.id === overId);
        if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
          return container;
        }

        return {
          ...container,
          items: arrayMove(container.items, activeIndex, overIndex),
        };
      })
    );
  }, [canManageTaskStatuses]);

  const moveToContainer = useCallback((activeId: string, overContainerId: string) => {
    if (!canManageTaskStatuses) return;

    setBoardContainers((prev) => {
      const activeContainer = prev.find((container) =>
        container.items.some((item) => item.id === activeId)
      );
      const overContainer = prev.find((container) => container.id === overContainerId);
      if (!activeContainer || !overContainer) return prev;

      const activeItem = activeContainer.items.find((item) => item.id === activeId);
      if (!activeItem) return prev;

      return prev.map((container) => {
        if (container.id === activeContainer.id) {
          return {
            ...container,
            items: container.items.filter((item) => item.id !== activeId),
          };
        }

        if (container.id === overContainerId) {
          return {
            ...container,
            items: [...container.items, activeItem],
          };
        }

        return container;
      });
    });
  }, [canManageTaskStatuses]);

  const moveBetweenContainers = useCallback(
    (activeId: string, overId: string, activeContainerId: string, overContainerId: string) => {
      if (!canManageTaskStatuses) return;

      setBoardContainers((prev) => {
        const activeContainer = prev.find((container) => container.id === activeContainerId);
        const overContainer = prev.find((container) => container.id === overContainerId);
        if (!activeContainer || !overContainer) return prev;

        const activeItem = activeContainer.items.find((item) => item.id === activeId);
        if (!activeItem) return prev;

        const overIndex = overContainer.items.findIndex((item) => item.id === overId);
        const insertionIndex = overIndex >= 0 ? overIndex : overContainer.items.length;

        return prev.map((container) => {
          if (container.id === activeContainerId) {
            return {
              ...container,
              items: container.items.filter((item) => item.id !== activeId),
            };
          }

          if (container.id === overContainerId) {
            const nextItems = [...overContainer.items];
            nextItems.splice(insertionIndex, 0, activeItem);
            return {
              ...container,
              items: nextItems,
            };
          }

          return container;
        });
      });
    },
    [canManageTaskStatuses]
  );

  const handleStatusDrop = useCallback(
    (activeId: string, fromContainerId: string, toContainerId: string) => {
      const nextStatus = containerToApiStatus(toContainerId);
      const previousStatus = containerToApiStatus(fromContainerId);

      if (!nextStatus || !previousStatus || nextStatus === previousStatus) {
        return;
      }

      if (!canManageTaskStatuses) {
        toast.error("Only management users can move task status on this board.");
        setBoardContainers(buildContainers(tasksData?.tasks ?? []));
        return;
      }

      if (!companyId) {
        toast.error("Company context is required.");
        setBoardContainers(buildContainers(tasksData?.tasks ?? []));
        return;
      }

      const taskId = Number(activeId);
      if (!Number.isFinite(taskId)) {
        setBoardContainers(buildContainers(tasksData?.tasks ?? []));
        return;
      }

      const snapshot = boardContainers;

      statusMutation.mutate(
        {
          taskId,
          payload: {
            company_id: companyId,
            status: nextStatus,
          },
        },
        {
          onSuccess: (response) => {
            setBoardContainers((prev) =>
              prev.map((container) => ({
                ...container,
                items: container.items.map((item) =>
                  item.id === activeId
                    ? {
                      ...item,
                      statusLabel: mapStatusToLabel(response.data.task.status),
                    }
                    : item
                ),
              }))
            );

            toast.success(getStatusTransitionMessage(previousStatus, nextStatus));
          },
          onError: () => {
            setBoardContainers(snapshot);
            toast.error("Failed to update task status. Board state has been restored.");
          },
        }
      );
    },
    [boardContainers, canManageTaskStatuses, companyId, statusMutation, tasksData?.tasks]
  );

  const stats = useMemo(() => {
    const total = boardContainers.reduce((s, c) => s + c.items.length, 0);
    if (total === 0) return [
      { name: "Pending", value: 0, color: "#BD7A22" },
      { name: "In Progress", value: 0, color: "#094B5C" },
      { name: "Complete", value: 0, color: "#4FD1C5" },
    ];
    const pending = boardContainers.find((c) => c.id === "pending")?.items.length ?? 0;
    const inProgress = boardContainers.find((c) => c.id === "in-progress")?.items.length ?? 0;
    const completed = boardContainers.find((c) => c.id === "completed")?.items.length ?? 0;

    return [
      { name: "Pending", value: Math.round((pending / total) * 100), color: "#BD7A22" },
      { name: "In Progress", value: Math.round((inProgress / total) * 100), color: "#094B5C" },
      { name: "Complete", value: Math.round((completed / total) * 100), color: "#4FD1C5" },
    ];
  }, [boardContainers]);

  if (loadingProject) {
    return <ProjectDetailsSkeleton />;
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#F4F7F9] p-8 flex flex-col items-center justify-center text-gray-400">
        <span className="font-bold text-lg">Project not found</span>
        <button onClick={() => router.push(`${basePath}/projects`)} className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Go back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="flex flex-col xl:flex-row gap-6 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* ── LEFT: header + kanban ─────────────────────────── */}
        <div className="flex-1 xl:flex-3 min-w-0 flex flex-col gap-5 w-full">

          {/* Header row */}
          <div className="flex flex-col gap-6 mb-8">
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-12">
              <button
                onClick={() => router.push(`${basePath}/projects`)}
                className="mt-1 text-[#092635] hover:opacity-70 transition-all shrink-0 cursor-pointer"
              >
                <ChevronLeft size={24} strokeWidth={2} />
              </button>

              <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h1 className="text-[20px] font-extrabold text-[#092635] leading-tight">
                      {project.name}
                    </h1>
                    <p className="text-[16px] text-[#717171] mt-1 max-w-2xl font-light">
                      {project.description || "No description provided."}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-xl transition-all cursor-pointer bg-white border border-[#D1D1D1] shadow-sm hover:bg-gray-50 flex-1 sm:flex-initial justify-center"
                    >
                      <SlidersHorizontal size={16} strokeWidth={2} className="text-gray-400" />
                      <span className="text-gray-500 text-[12px] font-medium">Filter</span>
                    </button>

                    {canManageTaskStatuses && (
                      <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shadow-md cursor-pointer whitespace-nowrap flex-1 sm:flex-initial justify-center"
                      >
                        <BookmarkPlus size={16} strokeWidth={2} />
                        <span>Create New Task</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 mt-6 md:mt-8">
                  <div className="space-y-1">
                    <h3 className="text-[14px] md:text-[16px] font-bold text-[#092635]">Created By</h3>
                    <p className="text-[14px] md:text-[16px] text-[#717171] font-light">
                      {project.creator?.name || project.manager?.name || "Unknown"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-[14px] md:text-[16px] font-bold text-[#092635]">Due Date</h3>
                    <p className="text-[14px] md:text-[16px] text-[#717171] font-light">
                      {project.deadline || "No deadline"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-[14px] md:text-[16px] font-bold text-[#092635]">Emphasis</h3>
                    <div className="mt-1">
                      <span className="px-6 py-1 bg-[#C241B4] text-white rounded-full text-[12px] font-bold inline-flex items-center justify-center min-w-[100px] capitalize">
                        {project.priority}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {loadingTasks ? (
            <div className="py-20 flex justify-center text-gray-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <TaskBoard
              containers={boardContainers}
              activeTab="all"
              onAddCard={() => { }}
              findContainer={findContainer}
              moveItem={moveItem}
              moveToContainer={moveToContainer}
              moveBetweenContainers={moveBetweenContainers}
              onStatusDrop={handleStatusDrop}
              onDragStateChange={handleDragStateChange}
              onTaskClick={(item, containerId) => setSelectedTask({ item, containerId })}
              onViewMap={(item) => {
                const url = buildTaskMapUrl(item, role);
                if (!url) {
                  toast.error("This task has no map coordinates yet.");
                  return;
                }
                router.push(url);
              }}
            />
          )}
        </div>

        {/* ── RIGHT: stats + calendar ───────────────────────── */}
        <div className="w-full sm:max-w-sm xl:max-w-85 xl:flex-1 xl:min-w-70 flex flex-col gap-5 xl:shrink-0">

          <div className="bg-[#0A1A22] rounded-[28px] px-5 pt-5 pb-4 shadow-xl overflow-visible">
            <h3 className="text-gray-400 font-medium text-[13px] mb-1">Task Stats</h3>
            <div className="flex items-center justify-between gap-2">
              <div className="w-44 h-44 shrink-0 -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }} style={{ overflow: 'visible' }}>
                    <Pie
                      data={stats}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={62}
                      paddingAngle={1}
                      dataKey="value"
                      stroke="none"
                      labelLine={false}
                      label={(props) => <CustomLabel {...props} />}
                    >
                      {stats.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-4 flex-1 pr-2">
                {stats.map((stat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: stat.color }}
                    />
                    <span className="text-[12px] text-[#A0B3B8] font-medium whitespace-nowrap">
                      {stat.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <OperationsCalendar projectId={projectId} />
        </div>
      </div>

      <CreateTaskModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        projectId={projectId}
      />
      <TaskDetailModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask?.item ?? null}
        status={selectedTask?.containerId ?? ""}
      />
    </div>
  );
}

function containerToApiStatus(containerId: string): ApiTaskStatus | null {
  if (containerId === "pending") return "pending";
  if (containerId === "in-progress") return "in_progress";
  if (containerId === "completed") return "completed";
  return null;
}

function mapStatusToLabel(status: ApiTaskStatus): string {
  if (status === "in_progress") return "In Progress";
  if (status === "paused") return "Paused";
  if (status === "resumed") return "Resumed";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function getStatusTransitionMessage(from: ApiTaskStatus, to: ApiTaskStatus): string {
  if (from === "pending" && to === "in_progress") return "Task moved to In Progress successfully.";
  if (from === "in_progress" && to === "completed") return "Task marked as Completed successfully.";
  if (from === "in_progress" && to === "pending") return "Task moved back to Pending.";
  if (from === "completed" && to === "in_progress") return "Task reopened and moved back to In Progress.";
  if (from === "completed" && to === "pending") return "Task reverted to Pending.";

  return "Task status updated successfully.";
}

function buildContainers(tasks: TaskApiItem[]): DndContainer[] {
  const pendingItems = tasks
    .filter((task) => task.status === "pending")
    .map(mapTaskToDnd);

  const inProgressItems = tasks
    .filter((task) => task.status === "in_progress" || task.status === "paused" || task.status === "resumed")
    .map(mapTaskToDnd);

  const completedItems = tasks
    .filter((task) => task.status === "completed")
    .map(mapTaskToDnd);

  return [
    {
      id: "pending",
      title: "Pending Task",
      color: "#BD7A22",
      items: pendingItems,
    },
    {
      id: "in-progress",
      title: "Task In-Progress",
      color: "#094B5C",
      items: inProgressItems,
    },
    {
      id: "completed",
      title: "Completed Task",
      color: "#4FD1C5",
      items: completedItems,
    },
  ];
}

function mapTaskToDnd(apiTask: TaskApiItem): DndItem {
  const statusLabel = mapStatusToLabel(apiTask.status);

  const assigneeLabel =
    apiTask.assigned_users && apiTask.assigned_users.length > 0
      ? apiTask.assigned_users.map((user) => user.name).join(", ")
      : apiTask.assignee?.name || "Unassigned";

  return {
    id: String(apiTask.id),
    label: assigneeLabel,
    description: apiTask.title,
    location: formatTaskLocationLabel(apiTask.location, apiTask.address, "No location set", apiTask.created_at),
    latitude: apiTask.latitude ?? null,
    longitude: apiTask.longitude ?? null,
    hasTrackableLocation: hasTrackableTaskLocation(apiTask),
    time: "Just now",
    avatar: apiTask.assignee?.avatar_url || undefined,
    category: (apiTask.type || "agent") as DndItem["category"],
    dueDate: apiTask.due_date ? new Date(apiTask.due_date).toLocaleDateString() : undefined,
    createdAt: apiTask.created_at ?? undefined,
    assignedBy: apiTask.creator?.name || `User ID: ${apiTask.created_by_user_id}`,
    addedDescription: apiTask.description,
    statusLabel,
  };
}
