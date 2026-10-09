"use client";

import {
  BookmarkPlus,
  ChevronDown,
  Eye,
  Pencil,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useCrmLabels, useCrmPipelines, useCrmPreferences, useDeleteLead, useLeads, useUpdateLead } from "@/hooks/use-crm";
import { resolveCrmPipelineId } from "@/lib/crm/resolve-pipeline";
import { AddLeadModal } from "@/components/crm/add-lead-modal";
import { LabelManagerModal, PipelineManagerModal } from "@/components/crm/crm-toolbar-modals";
import { CrmImportExportButton } from "@/components/crm/crm-import-export-button";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import { CrmFilterBar } from "@/components/crm/crm-filter-bar";
import { LeadPagination } from "@/components/crm/lead-pagination";
import type { ApiLeadStatus, LeadApiItem } from "@/lib/api/crm";
import { resolveLeadBudgetAmount } from "@/lib/api/crm";
import { toast } from "sonner";

interface Lead {
  id: string;
  name: string;
  company: string;
  status: ApiLeadStatus;
  statusColor: string;
  value: number;
  assignedTo: string;
  source: string;
}

function getStatusColor(status: string | null | undefined, labels: Array<{ slug: string; color: string }>): string {
  const match = labels.find((label) => label.slug === status);
  return match ? match.color : "#9CA3AF";
}

function StatusDropdown({
  value,
  color,
  options,
  onChange,
}: {
  value: ApiLeadStatus;
  color: string;
  options: Array<{ label: string; value: ApiLeadStatus; color: string }>;
  onChange: (value: ApiLeadStatus, color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find((option) => option.value === value)?.label ?? "New Lead";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-[11px] font-semibold transition-opacity hover:opacity-85"
        style={{ backgroundColor: color }}
      >
        {label}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[150px]">
          {options.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                onChange(s.value, s.color);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[12px] text-[#0B1215] font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export default function AllLeadsPage() {
  const basePath = "/crm";
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [prevDefaultPipelineId, setPrevDefaultPipelineId] = useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("all");
  const [showFilter, setShowFilter] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadApiItem | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const sourceParam = (searchParams.get("source") ?? "").trim().toLowerCase();
  const agentUploadScope = [
    "agent_upload",
    "agent uploaded",
    "agent upload",
    "uploaded_by_agent",
    "uploaded by agent",
    "uploaded_by_agents",
    "uploaded by agents",
  ].includes(sourceParam);

  const salesEngineScope = [
    "sales_engine",
    "sales engine",
    "sales-engine",
    "smart_lead",
    "smart lead",
    "smart-lead",
    "smart_leads",
    "smart leads",
  ].includes(sourceParam);

  const effectiveSourceFilter = agentUploadScope
    ? "agent_upload"
    : salesEngineScope
      ? "sales_engine"
      : sourceParam || undefined;

  const boardUrl = useMemo(
    () => (agentUploadScope ? `${basePath}?source=agent_upload` : salesEngineScope ? `${basePath}?source=sales_engine` : basePath),
    [agentUploadScope, salesEngineScope, basePath],
  );

  const { data: pipelines = [] } = useCrmPipelines(companyId ?? undefined, "/admin");
  const { data: preferences } = useCrmPreferences(companyId ?? undefined, "/admin");
  const { data: labels = [] } = useCrmLabels(companyId ?? undefined, "/admin");

  const defaultPipelineId = useMemo(
    () =>
      resolveCrmPipelineId(
        pipelines,
        preferences?.preferred_pipeline_id,
        preferences?.company_default_pipeline_id
      ),
    [pipelines, preferences?.preferred_pipeline_id, preferences?.company_default_pipeline_id]
  );

  if (defaultPipelineId != null && defaultPipelineId !== prevDefaultPipelineId) {
    setPrevDefaultPipelineId(defaultPipelineId);
    setSelectedPipelineId(defaultPipelineId);
    setPage(1);
    setSelected(new Set());
  }

  const { data, isFetching, refetch } = useLeads({
    company_id: companyId ?? undefined,
    page,
    search: search.trim() || undefined,
    pipeline_id: selectedPipelineId ?? undefined,
    status: selectedLabel === "all" ? undefined : selectedLabel,
    source: effectiveSourceFilter,
  }, "/admin");
  const updateLeadMutation = useUpdateLead(undefined, "/admin");
  const deleteLeadMutation = useDeleteLead(undefined, "/admin");



  const rawApiLeads = data?.leads ?? [];
  const apiLeads = rawApiLeads;

  const statusOptions = labels.map((label) => ({
    label: label.name,
    value: label.slug,
    color: label.color,
  }));

  const leads: Lead[] = apiLeads.map((l) => ({
    id: String(l.id),
    name: l.name,
    company: l.location ?? l.source ?? "—",
    status: (l.status ?? "newly_lead") as ApiLeadStatus,
    statusColor: getStatusColor(l.status, labels),
    value: resolveLeadBudgetAmount(l),
    assignedTo: l.assignee?.name ?? "Unassigned",
    source: l.source ?? "—",
  }));

  const allChecked = leads.length > 0 && selected.size === leads.length;

  const resetPageSelection = () => {
    setPage(1);
    setSelected(new Set());
  };

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateStatus = async (id: string, status: ApiLeadStatus) => {
    try {
      await updateLeadMutation.mutateAsync({
        leadId: id,
        payload: { company_id: companyId ?? "", status },
      });
      toast.success("Status updated");
      refetch();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const deleteLead = async (id: string) => {
    try {
      await deleteLeadMutation.mutateAsync({
        leadId: id,
        companyId: companyId ?? undefined,
      });
      toast.success("Lead deleted successfully");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeleteTargetId(null);
      refetch();
    } catch {
      toast.error("Could not delete the lead. Please try again.");
    }
  };

  const deleteSelectedLeads = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    try {
      await Promise.all(
        ids.map((id) =>
          deleteLeadMutation.mutateAsync({
            leadId: id,
            companyId: companyId ?? undefined,
          })
        )
      );
      toast.success(
        ids.length === 1 ? "Lead deleted successfully" : `${ids.length} leads deleted successfully`
      );
      setSelected(new Set());
      setShowBulkDeleteConfirm(false);
      refetch();
    } catch {
      toast.error("Could not delete one or more leads. Please try again.");
      refetch();
    }
  };

  const openEditLead = (id: string) => {
    const lead = apiLeads.find((entry) => String(entry.id) === id);
    if (lead) {
      setEditingLead(lead);
    }
  };

  return (
    <div className="se-workspace min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto flex flex-col gap-5">
        {/* Top bar */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="relative w-full max-w-110 group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPageSelection();
              }}
              placeholder="Search for Leads"
              className="se-search w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowPipelineModal(true)} className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              {selectedPipelineId
                ? (pipelines.find((pipeline) => pipeline.id === selectedPipelineId)?.name ?? "All Pipeline")
                : "All Pipeline"}
              <ChevronDown size={13} />
            </button>

            <button onClick={() => setShowLabelModal(true)} className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <Tag size={13} />
              Label
            </button>
            <button onClick={() => setShowFilter((prev) => !prev)} className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <SlidersHorizontal size={13} />
              Filter
            </button>
            <CrmImportExportButton
              companyId={companyId}
              apiBasePath="/admin"
              pipelines={pipelines}
              labels={labels}
              defaultPipelineId={selectedPipelineId}
              activeFilters={{
                search: search.trim() || undefined,
                pipeline_id: selectedPipelineId ?? undefined,
                status: selectedLabel === "all" ? undefined : selectedLabel,
                source: effectiveSourceFilter,
              }}
              selectedLeadIds={Array.from(selected)}
              onViewImportedPipeline={(pipelineId) => {
                setSearch("");
                setSelectedPipelineId(pipelineId);
                setSelectedLabel("all");
                resetPageSelection();
              }}
              onViewAllLeads={() => {
                setSearch("");
                setSelectedPipelineId(null);
                setSelectedLabel("all");
                setPage(1);
              }}
            />
            <button onClick={() => setShowAddModal(true)} className="se-primary flex items-center gap-2 px-5 py-2.5 bg-[#0B1215] text-white rounded-[10px] text-[12px] font-medium hover:opacity-90 transition-all">
              Add New Leads
              <BookmarkPlus size={15} />
            </button>
          </div>
        </div>

        {salesEngineScope && (
          <div className="flex items-center justify-between rounded-2xl border border-[#09232d]/15 bg-[#09232d]/[0.03] px-4 py-2.5 text-xs text-[#09232d] shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-900">Filtered by: Sales Engine</span>
              <span className="text-slate-500 hidden sm:inline">• Displaying leads discovered and saved from Sales Engine</span>
            </div>
            <button
              type="button"
              onClick={() => router.push(basePath)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-100 transition cursor-pointer"
            >
              <span>Clear Filter</span>
              <X size={12} />
            </button>
          </div>
        )}

        {showFilter && (
          <CrmFilterBar
            pipelines={pipelines}
            labels={labels}
            selectedPipelineId={selectedPipelineId}
            onPipelineChange={(pipelineId) => {
              setSelectedPipelineId(pipelineId);
              resetPageSelection();
            }}
            selectedLabel={selectedLabel}
            onLabelChange={(label) => {
              setSelectedLabel(label);
              resetPageSelection();
            }}
            onClear={() => {
              setSelectedPipelineId(defaultPipelineId);
              setSelectedLabel("all");
              resetPageSelection();
            }}
          />
        )}

        {/* Table card */}
        <div className="se-surface se-list-surface bg-white rounded-[24px] shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden flex flex-col h-[calc(100vh-200px)] min-h-96">
          {/* Select all + view toggle */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <div
                onClick={toggleAll}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${allChecked
                    ? "bg-[#0B1215] border-[#0B1215]"
                    : "border-gray-300 group-hover:border-gray-400"
                  }`}
              >
                {allChecked && (
                  <svg
                    width="10"
                    height="8"
                    viewBox="0 0 10 8"
                    fill="none"
                  >
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="text-[13px] font-medium text-gray-500">Select page</span>
            </label>

            <div className="flex items-center gap-1">
              <button
                onClick={() => router.push(boardUrl)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
              >
                {/* Grid icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
                </svg>
              </button>
              <button className="se-primary p-1.5 rounded-md bg-[#0B1215] text-white transition-colors">
                {/* List icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="se-list-heading grid grid-cols-[40px_1fr_1.4fr_1.1fr_0.9fr_1fr_0.9fr_100px] gap-3 px-6 pb-4 shrink-0">
            <div />
            <div className="bg-[#3B82F6] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Leads
            </div>
            <div className="bg-[#D946EF] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Company
            </div>
            <div className="bg-[#F59E0B] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Status
            </div>
            <div className="bg-[#06B6D4] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Value
            </div>
            <div className="bg-[#8B5CF6] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Assigned to
            </div>
            <div className="bg-[#65A30D] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Source
            </div>
            <div className="text-[12px] font-semibold text-gray-500 px-4 py-2 text-center">
              Actions
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto px-4">
            {leads.map((lead) => {
              const isSelected = selected.has(lead.id);
              return (
                <div
                  key={lead.id}
                  onClick={() => router.push(`${basePath}/leads/${lead.id}`)}
                  className={`se-list-row ${isSelected ? "se-table-row-active" : ""} grid grid-cols-[40px_1fr_1.4fr_1.1fr_0.9fr_1fr_0.9fr_100px] gap-3 items-center px-2 py-3.5 rounded-2xl mb-1 transition-all duration-150 group/row cursor-pointer ${isSelected
                      ? "bg-[#0B1215]"
                      : "hover:bg-gray-50 border border-transparent hover:border-gray-100"
                    }`}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center">
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleOne(lead.id); }}
                      className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected
                          ? "bg-white border-white"
                          : "border-gray-300"
                        }`}
                    >
                      {isSelected && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path
                            d="M1 3.5L3 5.5L8 1"
                            stroke="#0B1215"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <span
                    className={`text-[13px] font-semibold truncate ${isSelected ? "text-white" : "text-[#0B1215]"
                      }`}
                  >
                    {lead.name}
                  </span>

                  {/* Company */}
                  <span
                    className={`text-[12px] truncate ${isSelected ? "text-white/80" : "text-gray-500"
                      }`}
                  >
                    {lead.company}
                  </span>

                  {/* Status */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <StatusDropdown
                      value={lead.status}
                      color={lead.statusColor}
                      options={statusOptions}
                      onChange={(s) => updateStatus(lead.id, s)}
                    />
                  </div>

                  {/* Value */}
                  <span
                    className={`text-[13px] font-semibold ${isSelected ? "text-white" : "text-[#0B1215]"
                      }`}
                  >
                    $ {lead.value.toLocaleString()}
                  </span>

                  {/* Assigned to */}
                  <span
                    className={`text-[12px] truncate ${isSelected ? "text-white/80" : "text-gray-500"
                      }`}
                  >
                    {lead.assignedTo}
                  </span>

                  {/* Source */}
                  <span
                    className={`text-[12px] truncate ${isSelected ? "text-white/80" : "text-gray-500"
                      }`}
                  >
                    {lead.source}
                  </span>

                  {/* Actions */}
                  <div
                    className={`flex items-center justify-center gap-2 ${isSelected
                        ? "opacity-100"
                        : "opacity-0 group-hover/row:opacity-100"
                      } transition-opacity`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => router.push(`${basePath}/leads/${lead.id}`)}
                      className={`p-1 rounded-md transition-colors ${isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                        }`}
                    >
                      <Eye
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                    <button
                      onClick={() => openEditLead(lead.id)}
                      className={`p-1 rounded-md transition-colors ${isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                        }`}
                    >
                      <Pencil
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                    <button
                      className={`p-1 rounded-md transition-colors ${isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                        }`}
                      onClick={() => setDeleteTargetId(lead.id)}
                    >
                      <Trash2
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="shrink-0">
            {selected.size > 0 && (
              <div className="px-6 py-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[12px] text-gray-400">{selected.size} selected on this page</span>
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-red-500 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={13} />
                  Delete selected
                </button>
              </div>
            )}
            <LeadPagination
              pagination={data?.pagination}
              itemCount={leads.length}
              page={page}
              onPageChange={(nextPage) => {
                setSelected(new Set());
                setPage(nextPage);
              }}
              disabled={isFetching}
            />
          </div>
        </div>
      </div>

      {showPipelineModal && companyId && (
        <PipelineManagerModal
          companyId={companyId}
          apiBasePath="/admin"
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          onSelectPipeline={(pipelineId) => {
            setSelectedPipelineId(pipelineId);
            resetPageSelection();
          }}
          onClose={() => setShowPipelineModal(false)}
        />
      )}

      {showLabelModal && companyId && (
        <LabelManagerModal
          companyId={companyId}
          apiBasePath="/admin"
          labels={labels}
          onClose={() => setShowLabelModal(false)}
        />
      )}

      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          apiBasePath="/admin"
        />
      )}

      {editingLead && (
        <AddLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          apiBasePath="/admin"
        />
      )}

      <ConfirmDeleteModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => { if (deleteTargetId) void deleteLead(deleteTargetId); }}
        title="Delete Lead"
        description="Are you sure you want to delete this lead? This action cannot be undone."
      />

      <ConfirmDeleteModal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={() => { void deleteSelectedLeads(); }}
        title={`Delete ${selected.size} Lead${selected.size === 1 ? "" : "s"}`}
        description={`Are you sure you want to delete ${selected.size} selected lead${selected.size === 1 ? "" : "s"}? This action cannot be undone.`}
      />
    </div>
  );
}
