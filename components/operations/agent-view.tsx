"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, BookmarkPlus } from "lucide-react";
import { AgentCurveChart } from "./agent-curve-chart";
import { AgentList } from "./agent-list";
import type { AgentItem } from "./agent-list";
import { AgentInfoCard } from "./agent-sidebar";
import { AddAgentModal } from "./add-agent-modal";
import { JourneyHistoryPanel } from "@/components/operations/journey-history-panel";
import { useInternalUsersPaginated } from "@/hooks/use-internal-users";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  getAgentPresenceLabels,
  mapApiPresence,
} from "@/lib/agent-presence";
import type { InternalUserListItem } from "@/lib/api/internal-users";
import { resolveAvatarSrc } from "@/lib/avatar";

function mapToAgentItem(input: InternalUserListItem): AgentItem {
  const presence = mapApiPresence(input.presence);
  const labels = getAgentPresenceLabels(presence, {
    onboardingStatus: input.onboarding_status,
    isActive: input.is_active,
  });

  return {
    id: String(input.id),
    name: input.name,
    email: input.email,
    description: input.email,
    zone: input.assigned_zone ?? "Unassigned",
    phone: input.phone_number ?? "",
    role: input.internal_role ?? input.role,
    internalRole: input.internal_role ?? input.role,
    supervisorUserId: input.supervisor_user_id ?? null,
    status: labels.badgeLabel,
    time: labels.subtextLabel,
    isSuspended: input.is_suspended ?? false,
    suspendedUntil: input.suspended_until ?? null,
    avatar: resolveAvatarSrc(input.avatar_url),
    active: labels.isMapActive,
    isMapActive: labels.isMapActive,
    isSessionOnline: labels.isSessionOnline,
    presence,
    latitude: presence.latitude ?? undefined,
    longitude: presence.longitude ?? undefined,
    location: presence.activeTaskTitle ?? null,
    avatarKey: input.avatar_key ?? undefined,
    baseSalary: input.base_salary ?? undefined,
    salaryType: input.payroll_salary_type ?? undefined,
    salaryCurrency: input.salary_currency ?? undefined,
  };
}

export function AgentView({ basePath }: { basePath: string }) {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "agent" | "supervisor">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "offline" | "pending">("all");
  const [zoneFilter, setZoneFilter] = useState("all");

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const roleParam = roleFilter === "all" ? undefined : roleFilter;
  const statusParam =
    statusFilter === "all"
      ? undefined
      : statusFilter === "active"
        ? "active"
        : statusFilter === "offline"
          ? "offline"
          : "pending_onboarding";
  const zoneParam = zoneFilter === "all" ? undefined : zoneFilter;

  const { data: paginatedData, isLoading } = useInternalUsersPaginated({
    company_id: companyId ?? undefined,
    role: roleParam,
    status: statusParam,
    zone: zoneParam,
    search: search.trim() || undefined,
    per_page: 4,
    page,
  }, { refetchInterval: 30_000 });

  const agents = useMemo(() => {
    return (paginatedData?.items ?? []).map((item) => mapToAgentItem(item));
  }, [paginatedData]);

  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const item of paginatedData?.items ?? []) {
      if (item.assigned_zone) set.add(item.assigned_zone);
    }

    return ["all", ...Array.from(set)];
  }, [paginatedData]);

  const pagination = paginatedData?.pagination;
  const totalPages = Math.max(1, pagination?.last_page ?? 1);
  const currentPage = pagination?.current_page ?? page;
  const totalItems = pagination?.total ?? agents.length;

  const selectedAgent = useMemo<AgentItem | null>(() => {
    if (!agents.length) {
      return null;
    }

    return agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  }, [agents, selectedAgentId]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const clearFilters = () => {
    setRoleFilter("all");
    setStatusFilter("all");
    setZoneFilter("all");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0">
          <span className="lg:hidden">Agents Overview</span>
        </h1>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:justify-end min-w-0 mt-2 lg:mt-0 lg:-mt-16 xl:-mt-20 transition-all duration-300 relative z-10">
          {/* Search */}
          <div className="relative w-full md:w-[458px] group shrink-0">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#09232D] transition-colors"
              size={18}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name......"
              className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-[#09232D]/10 transition-all font-sans"
              style={{
                height: '46px',
                borderRadius: '24px',
                border: '0.7px solid #D7D7D7',
                boxShadow: '0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026'
              }}
            />
          </div>

          {/* Filter toggle — icon before text */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${showFilters ? "text-white" : "text-gray-500"}`}
            style={{
              background: showFilters ? "#34373C" : "#F8F8F8",
              border: showFilters ? "0.5px solid #34373C" : "0.5px solid #D1D1D1",
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

          {/* Create — shorter than search */}
          <button
            onClick={() => setShowAddAgent(true)}
            className="flex items-center gap-2 px-5 py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shrink-0 cursor-pointer"
            style={{ boxShadow: "0 4px 14px rgba(9, 35, 45, 0.3)" }}
          >
            <BookmarkPlus size={15} strokeWidth={2} />
            <span className="hidden sm:inline whitespace-nowrap">Add New Agent</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Role</label>
            <SearchableSelect
              value={roleFilter}
              onChange={(v) => { setRoleFilter(v as "all" | "admin" | "agent" | "supervisor"); setPage(1); }}
              options={[{ value: "all", label: "All Roles" }, { value: "admin", label: "Admin" }, { value: "agent", label: "Field Agent" }, { value: "supervisor", label: "Supervisor" }]}
              className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
            <SearchableSelect
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v as "all" | "active" | "offline" | "pending"); setPage(1); }}
              options={[{ value: "all", label: "All Status" }, { value: "active", label: "Active" }, { value: "offline", label: "Offline" }, { value: "pending", label: "Pending Onboarding" }]}
              className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Zone</label>
            <SearchableSelect
              value={zoneFilter}
              onChange={(v) => { setZoneFilter(v); setPage(1); }}
              options={[{ value: "all", label: "All Zones" }, ...zones.filter((z) => z !== "all").map((z) => ({ value: z, label: z }))]}
              className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark cursor-pointer"
            />
          </div>

          {(roleFilter !== "all" || statusFilter !== "all" || zoneFilter !== "all" || search.trim() !== "") && (
            <div className="flex flex-col justify-end">
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_22.5rem] gap-5 mt-2">
        {/* Row 1 / Col 1 — Chart */}
        <div className="xl:col-start-1 xl:row-start-1">
          <AgentCurveChart />
        </div>

        {/* Row 2 / Col 1 — Agents list */}
        <div className="xl:col-start-1 xl:row-start-2 min-w-0">
          {isLoading ? (
            <div className="bg-white rounded-3xl p-8 text-[13px] text-gray-400 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]">
              Loading agents...
            </div>
          ) : (
            <AgentList
              agents={agents}
              basePath={basePath}
              selectedId={selectedAgent?.id}
              onSelect={(agent) => setSelectedAgentId(agent.id)}
              page={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pagination?.per_page ?? 4}
              onPageChange={setPage}
            />
          )}
        </div>

        {/* Row 1 / Col 2 — Agent info */}
        {selectedAgent && (
          <div className="xl:col-start-2 xl:row-start-1 xl:row-span-2 flex flex-col gap-5">
            <AgentInfoCard agent={selectedAgent} />
            <JourneyHistoryPanel
              selected={{ userId: selectedAgent.id, name: selectedAgent.name }}
              companyId={companyId ?? undefined}
            />
          </div>
        )}
      </div>

      {/* ── Modal ─────────────────────────────────────────────── */}
      {showAddAgent && <AddAgentModal onClose={() => setShowAddAgent(false)} />}
    </div >
  );
}
