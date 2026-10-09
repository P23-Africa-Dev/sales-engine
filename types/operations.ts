export type TaskCategory = 'all' | 'agent' | 'attendance';

export interface DndItem {
  id: string;
  label: string;
  description: string;
  companyName?: string;
  position?: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  hasTrackableLocation?: boolean;
  time: string;
  avatar?: string;
  icon?: string;
  category?: TaskCategory;
  dueDate?: string;
  assignedBy?: string;
  addedDescription?: string;
  statusLabel?: string;
  routeData?: Record<string, unknown>;
  priority?: string;
  value?: string;
  rawValue?: number;
  assignedToUserId?: string | number | null;
  taskType?: string;
  address?: string;
  dueDateIso?: string;
  createdAt?: string;
  requiredActions?: string[];
  visitVerificationRequired?: boolean;
  minPhotosRequired?: number;
}

export interface DndContainer {
  id: string;
  title: string;
  color: string;
  items: DndItem[];
}
export interface ProjectTaskSummary {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  completedPercentage: number;
  pendingPercentage: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string;
  status: 'In progress' | 'Completed' | 'Pending';
  priority: 'High' | 'Medium' | 'Low';
  completedPercent: number;
  pendingPercent: number;
  taskSummary?: ProjectTaskSummary;
  startDate?: string;
  endDate?: string | null;
  type?: string | null;
  creator?: { id: number; name: string; email: string; avatar_url?: string | null } | null;
  manager?: { id: number; name: string; email: string } | null;
}

function formatDeadline(endDate: string | null | undefined): string {
  if (!endDate) return 'No deadline';
  const now = new Date();
  const end = new Date(endDate);
  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return '1 day to Deadline';
  if (diffDays < 7) return `${diffDays} days to Deadline`;
  const weeks = Math.floor(diffDays / 7);
  return weeks === 1 ? '1 week to Deadline' : `${weeks} weeks to Deadline`;
}

function mapStatus(s: string): Project['status'] {
  if (s === 'active') return 'In progress';
  if (s === 'completed') return 'Completed';
  return 'Pending';
}

function mapPriority(p: string | null | undefined): Project['priority'] {
  if (p === 'high') return 'High';
  if (p === 'medium') return 'Medium';
  return 'Low';
}

export function mapApiProject(item: {
  id: number;
  name: string;
  status: string;
  priority?: string | null;
  description?: string;
  start_date?: string;
  end_date?: string | null;
  type?: string | null;
  creator?: { id: number; name: string; email: string; avatar_url?: string | null } | null;
  manager?: { id: number; name: string; email: string } | null;
  task_summary: {
    total_tasks: number;
    completed_tasks: number;
    pending_tasks: number;
    completed_percentage: number;
    pending_percentage: number;
  };
}): Project {
  return {
    id: String(item.id),
    name: item.name,
    description: item.description ?? '',
    deadline: formatDeadline(item.end_date),
    status: mapStatus(item.status),
    priority: mapPriority(item.priority),
    completedPercent: item.task_summary.completed_percentage,
    pendingPercent: item.task_summary.pending_percentage,
    taskSummary: {
      totalTasks: item.task_summary.total_tasks,
      completedTasks: item.task_summary.completed_tasks,
      pendingTasks: item.task_summary.pending_tasks,
      completedPercentage: item.task_summary.completed_percentage,
      pendingPercentage: item.task_summary.pending_percentage,
    },
    startDate: item.start_date,
    endDate: item.end_date,
    type: item.type,
    creator: item.creator ?? null,
    manager: item.manager ?? null,
  };
}
