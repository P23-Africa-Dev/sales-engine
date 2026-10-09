"use client";

import { useState, useMemo, useEffect } from "react";
import {
  MoreVertical,
  Search,
  SlidersHorizontal,
  BookmarkPlus,
  User,
  ChevronLeft,
  ChevronRight,
  Edit2,
} from "lucide-react";
import Image from "next/image";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Project } from "@/types/operations";
import Arrow57Deg from "@/assets/images/arrow-57deg.png";
import { CreateProjectDrawer } from "./create-project-drawer";
import { ProjectCardSkeleton } from "./skeletons/project-card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { PaginationData } from "@/lib/api/projects";
import type { ProjectsAnalyticsData } from "@/lib/api/projects";

const STATUS_FILTERS = ["All", "In progress", "Completed", "Pending"];
const PRIORITY_FILTERS = ["All", "High", "Medium", "Low"];

interface ProjectsViewProps {
  projects: Project[];
  analytics?: ProjectsAnalyticsData | null;
  onViewProject: (projectId: string, projectName?: string) => void;
  isLoading?: boolean;
  pagination?: PaginationData | null;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

export function ProjectsViewAgents({
  projects,
  analytics = null,
  onViewProject,
  isLoading = false,
  pagination = null,
  currentPage = 1,
  onPageChange,
}: ProjectsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        const matchesSearch = p.name
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesStatus =
          statusFilter === "All" || p.status === statusFilter;
        const matchesPriority =
          priorityFilter === "All" || p.priority === priorityFilter;
        return matchesSearch && matchesStatus && matchesPriority;
      }),
    [projects, search, statusFilter, priorityFilter],
  );

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0">
          <span className="lg:hidden">Projects Overview</span>
        </h1>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:justify-end min-w-0 mt-2 lg:mt-0 lg:-mt-16 xl:-mt-20 transition-all duration-300 relative z-10">
          <div className="relative w-full sm:flex-1 md:max-w-[458px] group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#09232D] transition-colors"
              size={18}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for Agents"
              className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-[#09232D]/10 transition-all font-sans"
              style={{
                height: "46px",
                borderRadius: "24px",
                border: "0.7px solid #D7D7D7",
                boxShadow:
                  "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026",
              }}
            />
          </div>

          {/* Filter toggle — icon before text */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${showFilters ? "text-white" : "text-gray-500"
              }`}
            style={{
              background: showFilters ? "#34373C" : "#F8F8F8",
              border: showFilters
                ? "0.5px solid #34373C"
                : "0.5px solid #D1D1D1",
              boxShadow: showFilters ? "none" : "0 2px 8px rgba(0, 0, 0, 0.06)",
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 400,
                fontStyle: "normal",
                fontSize: "10px",
                lineHeight: "100%",
                letterSpacing: "0%",
                verticalAlign: "middle",
              }}
            >
              Filter
            </span>
          </button>
        </div>
      </div>

      {/* ── Summary Cards ────────────────────────────────────── */}
      <SummaryCards projects={projects} analytics={analytics} />

      {/* ── Filter panel ─────────────────────────────────────── */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">
              Status
            </label>
            <div className="flex gap-1 flex-wrap">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${statusFilter === s
                    ? "bg-[#0B1215] text-white"
                    : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">
              Priority
            </label>
            <div className="flex gap-1 flex-wrap">
              {PRIORITY_FILTERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${priorityFilter === p
                    ? "bg-[#0B1215] text-white"
                    : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {(statusFilter !== "All" || priorityFilter !== "All") && (
            <div className="flex flex-col justify-end">
              <button
                onClick={() => {
                  setStatusFilter("All");
                  setPriorityFilter("All");
                }}
                className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Grid — wrapped in a thick-shadow container ─────── */}
      {isLoading ? (
        <div
          className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100/60"
          style={{ boxShadow: "0px 8px 12px 6px #00000026" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-x-5 gap-y-10">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 bg-white rounded-3xl border border-gray-100/60" style={{ boxShadow: "0px 8px 12px 6px #00000026" }}>
          <EmptyState
            icon={Search}
            title="No projects found"
            description={
              search || statusFilter !== "All" || priorityFilter !== "All"
                ? "We couldn't find any projects matching your current filters. Try adjusting your search criteria."
                : "You don't have any projects yet. Create a new project to get started."
            }
            actionLabel={
              search || statusFilter !== "All" || priorityFilter !== "All"
                ? "Clear filters"
                : "Create Project"
            }
            onAction={() => {
              if (search || statusFilter !== "All" || priorityFilter !== "All") {
                setSearch("");
                setStatusFilter("All");
                setPriorityFilter("All");
              } else {
                setEditingProject(null);
                setShowDrawer(true);
              }
            }}
          />
        </div>
      ) : (
        <div
          className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100/60"
          style={{ boxShadow: "0px 8px 12px 6px #00000026" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-x-5 gap-y-10">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => onViewProject(project.id, project.name)}
                onEdit={() => {
                  setEditingProject(project);
                  setShowDrawer(true);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showDrawer && (
        <CreateProjectDrawer
          onClose={() => {
            setShowDrawer(false);
            setEditingProject(null);
          }}
          projectToEdit={editingProject || undefined}
        />
      )}

      {/* ── Pagination ────────────────────────────────────────── */}
      {pagination && (pagination.next_page_url || pagination.prev_page_url) && (
        <div className="flex items-center justify-center gap-3 pt-2 pb-4">
          <button
            disabled={!pagination.prev_page_url}
            onClick={() => onPageChange?.(currentPage - 1)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
            Previous
          </button>

          <span className="text-[13px] font-bold text-[#09232D] px-3">
            Page {currentPage}
            {pagination.last_page ? ` of ${pagination.last_page}` : ""}
          </span>

          <button
            disabled={!pagination.next_page_url}
            onClick={() => onPageChange?.(currentPage + 1)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[#09232D] text-white hover:opacity-90 shadow-sm"
          >
            Next
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function ProjectCard({
  project,
  onClick,
  onEdit,
}: {
  project: Project;
  onClick: () => void;
  onEdit: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = () => setMenuOpen(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuOpen]);

  const statusCls = (s: string) => {
    switch (s) {
      case "In progress":
        return "bg-[#0E5D5D] text-white";
      case "Completed":
        return "bg-[#4FD1C5] text-[#0B1215]";
      case "Pending":
        return "bg-[#BD7A22] text-white";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };
  const priorityCls = (p: string) => {
    switch (p) {
      case "High":
        return "bg-[#A3E635] text-[#0B1215]";
      case "Medium":
        return "bg-[#FDE047] text-[#0B1215]";
      case "Low":
        return "bg-[#CBD5E1] text-[#0B1215]";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="relative pb-5 h-full">
      <div
        className="bg-white rounded-3xl p-5 pt-6 border border-gray-100/80 transition-all h-full flex flex-col"
        style={{ boxShadow: "0px 1px 2px 2px #00000026" }}
      >
        <div className="flex items-start justify-between gap-2 relative">
          <h3 className="text-[15px] font-bold text-[#09232D] leading-snug line-clamp-2 pr-6">
            {project.name}
          </h3>
          <div className="absolute right-0 top-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1 rounded-full transition-colors mt-0.5"
            >
              <MoreVertical size={18} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <Edit2 size={14} />
                  Edit Project
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-3 mt-1.5">
          {project.description}
        </p>

        <p className="text-[11px] font-semibold text-gray-400 mt-auto pt-4">
          {project.deadline}
        </p>

        <div className="flex items-center gap-2 mt-3">
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-bold ${statusCls(project.status)}`}
          >
            {project.status}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-bold ${priorityCls(project.priority)}`}
          >
            {project.priority}
          </span>
        </div>

        <div className="flex gap-2 mt-4">
          <div className="flex-1 min-w-0">
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6B9A9A] rounded-full"
                style={{ width: `${project.completedPercent}%` }}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F87171] rounded-full"
                style={{ width: `${project.pendingPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-1.5 mb-3">
          <span className="flex-1 text-[10px] font-semibold text-gray-400">
            Completed
          </span>
          <span className="flex-1 text-[10px] font-semibold text-gray-400">
            Pending
          </span>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <button
          onClick={onClick}
          className="px-10 py-3 bg-[#09232D] text-white rounded-full text-[12px] font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-md cursor-pointer"
        >
          View Project
        </button>
      </div>
    </div>
  );
}

// ─── Chart data ───────────────────────────────────────────────────────────────
const TOTAL_PROJECTS_DATA = [
  { value: 30 },
  { value: 18 },
  { value: 28 },
  { value: 28 },
  { value: 20 },
  { value: 26 },
  { value: 8 },
  { value: 32 },
];

const PENDING_PROJECTS_DATA = [
  { value: 34 },
  { value: 22 },
  { value: 30 },
  { value: 30 },
  { value: 32 },
  { value: 24 },
  { value: 12 },
  { value: 34 },
];

// ─── Summary Cards ─────────────────────────────────────────────────────────────
const ARC_LENGTH = 188.5;
const CIRCUMFERENCE = 251.3;

function performanceLabel(pct: number) {
  if (pct >= 80) return "Excellent";
  if (pct >= 60) return "Good";
  if (pct >= 40) return "Fair";
  return "Poor";
}

function SummaryCards({
  projects,
  analytics,
}: {
  projects: Project[];
  analytics?: ProjectsAnalyticsData | null;
}) {
  const total = projects.length;
  const pending = projects.filter((p) => p.status !== "Completed").length;
  const completed = projects.filter((p) => p.status === "Completed").length;
  const fallbackPercent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const percent = Math.round(analytics?.project_performance.project_progress ?? fallbackPercent);
  const performanceStatus = analytics?.project_performance.status ?? performanceLabel(percent).toUpperCase();

  const [animatedPct, setAnimatedPct] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const target = percent;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    let raf: number;
    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1);
      setAnimatedPct(ease(t) * target);
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [percent]);

  const animatedDash = (animatedPct / 100) * ARC_LENGTH;
  const dotAngle = (animatedPct / 100) * 270 * (Math.PI / 180);
  const dotX = 50 + 40 * Math.cos(dotAngle);
  const dotY = 50 + 40 * Math.sin(dotAngle);

  return (
    <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-screen -mx-4 px-4 pb-2 gap-6 sm:flex-col lg:flex-row sm:justify-between sm:w-full sm:mx-0 sm:px-8 sm:gap-6 lg:gap-0 animate-in fade-in slide-in-from-bottom-2 duration-500 h-auto sm:overflow-visible sm:snap-none sm:pb-0 lg:h-49">
      <PerformanceCard
        percent={percent}
        status={performanceStatus}
        animatedDash={animatedDash}
        dotX={dotX}
        dotY={dotY}
      />
      <div className="contents sm:grid sm:grid-cols-2 sm:gap-6 lg:gap-6.25 sm:w-auto">
        <TotalProjectsCard total={total} />
        <PendingProjectsCard pending={pending} />
      </div>
    </div>
  );
}

function formatStatCount(value: number): string {
  return String(value).padStart(3, "0");
}

// ─── Performance Card ─────────────────────────────────────────────────────────
function PerformanceCard({
  percent,
  status,
  animatedDash,
  dotX,
  dotY,
}: {
  percent: number;
  status: string;
  animatedDash: number;
  dotX: number;
  dotY: number;
}) {
  return (
    <div className="bg-[#0B1C25] rounded-[20px] p-5 sm:p-8 relative flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-4 sm:gap-6 lg:gap-10 overflow-hidden min-h-45 max-h-60 sm:max-h-52 w-[85vw] sm:w-auto shrink-0 snap-center shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]">
      <div className="relative w-28 h-28 sm:w-41.5 sm:h-41.5 shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          style={{ transform: "rotate(135deg)" }}
        >
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#6B9A9A"
            strokeOpacity="0.3"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#6B9A9A"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${animatedDash} ${CIRCUMFERENCE}`}
          />
          <circle
            cx={dotX}
            cy={dotY}
            r="3"
            fill="#fff"
            stroke="#7BB6B8"
            strokeWidth="4px"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 sm:gap-1">
          <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-[#EF6C55] flex items-center justify-center shadow-lg">
            <User className="text-white fill-current w-3 h-3 sm:w-4.5 sm:h-4.5" />
          </div>
          <span className="text-white font-semibold text-[24px] sm:text-[40px] leading-none">
            {percent}%
          </span>
        </div>
      </div>
      <div className="flex flex-col z-10 text-white min-w-0">
        <p className="text-[#E8E8E8] font-normal text-[12px] sm:text-[14px] lg:text-[16px] leading-tight mb-0.5">
          Overall Project
        </p>
        <h2 className="text-[20px] sm:text-[28px] lg:text-[36px] font-semibold leading-[1.1] mb-2 sm:mb-7 tracking-tight">
          Performance
        </h2>
        <p className="text-[11px] sm:text-[14px] font-medium text-[#E8E8E8]/80">
          Status: <span className="text-white font-semibold">{status}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Total Projects Card ──────────────────────────────────────────────────────
function TotalProjectsCard({ total }: { total: number }) {
  return (
    <div className="px-5 sm:px-6 pb-3 bg-white rounded-[20px] overflow-hidden border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative flex flex-col min-h-45 w-[85vw] sm:w-full lg:w-69.75 shrink-0 snap-center">
      <div className="flex items-start justify-between pt-5 sm:pt-6">
        <div>
          <p className="text-[14px] font-medium text-[#2D2D2D]">
            Total Projects
          </p>
          <h2 className="text-[64px] font-bold text-[#34373C] leading-none tracking-[-0.04em]">
            {formatStatCount(total)}
          </h2>
        </div>
        <button className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#3AB37E] text-white rounded-full text-[7px] hover:bg-[#27ae60] transition-colors mt-1">
          View All
          <Image src={Arrow57Deg} alt="View All" width={7.5} height={7.5} />
        </button>
      </div>
      <div className="w-full h-14.5 mt-auto">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={TOTAL_PROJECTS_DATA}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3AB37E" stopOpacity={1} />
                <stop offset="95%" stopColor="#D9D9D9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3AB37E"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#gradGreen)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Pending Projects Card ────────────────────────────────────────────────────
function PendingProjectsCard({ pending }: { pending: number }) {
  return (
    <div className="px-5 sm:px-6 pb-3 bg-white rounded-[20px] overflow-hidden border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative flex flex-col min-h-45 w-[85vw] sm:w-full lg:w-69.75 shrink-0 snap-center">
      <div className="flex items-start justify-between pt-5 sm:pt-6">
        <div>
          <p className="text-[14px] font-medium text-[#2D2D2D]">
            Pending Projects
          </p>
          <h2 className="text-[64px] font-bold text-[#34373C] leading-none tracking-[-0.04em]">
            {formatStatCount(pending)}
          </h2>
        </div>
        <button className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#EF8E5B] text-white rounded-full text-[7px] hover:bg-[#d57848] transition-colors mt-1">
          View All
          <Image src={Arrow57Deg} alt="View All" width={7.5} height={7.5} />
        </button>
      </div>
      <div className="w-full h-14.5 mt-auto">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={PENDING_PROJECTS_DATA}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E8875B" stopOpacity={1} />
                <stop offset="95%" stopColor="#D9D9D9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="#E8875B"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#gradOrange)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
