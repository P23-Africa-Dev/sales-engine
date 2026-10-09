import { Project } from "@/types/operations";
import { BookmarkPlus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { CreateProjectDrawer } from "../create-project-drawer";
import { PRIORITY_FILTERS, STATUS_FILTERS } from "./constants";
import { ProjectCard } from "./project-card";
import { SummaryCards } from "./summary-cards";

interface ProjectsViewProps {
  projects: Project[];
  onViewProject: (projectId: string) => void;
}

export function ProjectsView({ projects, onViewProject }: ProjectsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

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

  const handleClearFilters = () => {
    setStatusFilter("All");
    setPriorityFilter("All");
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        showFilters={showFilters}
        onFilterToggle={() => setShowFilters((v) => !v)}
        onCreateClick={() => setShowDrawer(true)}
      />

      {/* ── Summary Cards ────────────────────────────────────── */}
      <SummaryCards projects={projects} />

      {/* ── Filter Panel ─────────────────────────────────────── */}
      {showFilters && (
        <FilterPanel
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
          onStatusChange={setStatusFilter}
          onPriorityChange={setPriorityFilter}
          onClear={handleClearFilters}
        />
      )}

      {/* ── Projects Grid ────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <ProjectsGrid projects={filtered} onViewProject={onViewProject} />
      )}

      {/* ── Create Project Drawer ────────────────────────────── */}
      {showDrawer && (
        <CreateProjectDrawer onClose={() => setShowDrawer(false)} />
      )}
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  showFilters: boolean;
  onFilterToggle: () => void;
  onCreateClick: () => void;
}

function Toolbar({
  search,
  onSearchChange,
  showFilters,
  onFilterToggle,
  onCreateClick,
}: ToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-[20px] font-extrabold text-dash-dark shrink-0 ml-10.25">
        All project
      </h1>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1 md:justify-end min-w-0">
        <SearchInput value={search} onChange={onSearchChange} />
        <FilterButton active={showFilters} onClick={onFilterToggle} />
        <CreateButton onClick={onCreateClick} />
      </div>
    </div>
  );
}

// ─── Search Input ─────────────────────────────────────────────────────────────
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <div className="relative w-full md:flex-1 md:max-w-114.5 group">
      <Search
        className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-dark transition-colors"
        size={18}
        strokeWidth={2}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search for Agents"
        className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all font-sans"
        style={{
          height: "46px",
          borderRadius: "24px",
          border: "0.7px solid #D7D7D7",
          boxShadow: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026",
        }}
      />
    </div>
  );
}

// ─── Filter Button ────────────────────────────────────────────────────────────
interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
}

function FilterButton({ active, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${
        active ? "text-white" : "text-gray-500"
      }`}
      style={{
        background: active ? "#34373C" : "#F8F8F8",
        border: active ? "0.5px solid #34373C" : "0.5px solid #D1D1D1",
        boxShadow: active ? "none" : "0 2px 8px rgba(0, 0, 0, 0.06)",
      }}
    >
      <SlidersHorizontal size={14} strokeWidth={2} />
      <span
        style={{
          fontFamily: "Poppins, sans-serif",
          fontWeight: 400,
          fontSize: "10px",
          lineHeight: "100%",
        }}
      >
        Filter
      </span>
    </button>
  );
}

// ─── Create Button ────────────────────────────────────────────────────────────
interface CreateButtonProps {
  onClick: () => void;
}

function CreateButton({ onClick }: CreateButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-5 py-3 bg-dash-dark text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shrink-0 cursor-pointer"
      style={{ boxShadow: "0 4px 14px rgba(9, 35, 45, 0.3)" }}
    >
      <BookmarkPlus size={15} strokeWidth={2} />
      <span className="hidden sm:inline whitespace-nowrap">
        Create New Project
      </span>
      <span className="sm:hidden">New</span>
    </button>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────
interface FilterPanelProps {
  statusFilter: string;
  priorityFilter: string;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onClear: () => void;
}

function FilterPanel({
  statusFilter,
  priorityFilter,
  onStatusChange,
  onPriorityChange,
  onClear,
}: FilterPanelProps) {
  const hasActiveFilters = statusFilter !== "All" || priorityFilter !== "All";

  return (
    <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Status Filters */}
      <FilterGroup
        label="Status"
        options={STATUS_FILTERS}
        selected={statusFilter}
        onChange={onStatusChange}
      />

      {/* Priority Filters */}
      <FilterGroup
        label="Priority"
        options={PRIORITY_FILTERS}
        selected={priorityFilter}
        onChange={onPriorityChange}
      />

      {/* Clear Button */}
      {hasActiveFilters && (
        <div className="flex flex-col justify-end">
          <button
            onClick={onClear}
            className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Filter Group ─────────────────────────────────────────────────────────────
interface FilterGroupProps {
  label: string;
  options: string[];
  selected: string;
  onChange: (option: string) => void;
}

function FilterGroup({ label, options, selected, onChange }: FilterGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-gray-400 px-1">
        {label}
      </label>
      <div className="flex gap-1 flex-wrap">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${
              selected === option
                ? "bg-[#0B1215] text-white"
                : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="py-20 text-center text-gray-400 text-[14px] font-medium">
      No projects match your search.
    </div>
  );
}

// ─── Projects Grid ────────────────────────────────────────────────────────────
interface ProjectsGridProps {
  projects: Project[];
  onViewProject: (projectId: string) => void;
}

function ProjectsGrid({ projects, onViewProject }: ProjectsGridProps) {
  return (
    <div
      className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100/60"
      style={{ boxShadow: "0px 8px 12px 6px #00000026" }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-x-5 gap-y-10">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onClick={() => onViewProject(project.id)}
          />
        ))}
      </div>
    </div>
  );
}
