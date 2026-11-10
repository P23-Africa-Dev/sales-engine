"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Star,
  Check,
  Building2,
  Eye,
  FolderKanban,
  FolderPlus,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { ApiRequestError } from "@/lib/api/onboarding";
import type { ApiRoleBasePath, CrmLabel, CrmPipeline } from "@/lib/api/crm";
import {
  useCreateCrmLabel,
  useCreateCrmPipeline,
  useDeleteCrmLabel,
  useDeleteCrmPipeline,
  useReorderCrmLabels,
  useSetCompanyDefaultCrmPipeline,
  useSetPreferredCrmPipeline,
  useCrmPreferences,
  useUpdateCrmLabel,
  useUpdateCrmPipeline,
} from "@/hooks/use-crm";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";

type BaseModalProps = {
  companyId: number | string;
  apiBasePath: ApiRoleBasePath;
  onClose: () => void;
};

export function ModalShell({
  title,
  subtitle,
  badge,
  onClose,
  children,
  className = "",
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  className?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        className={`relative w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-[26px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.2),0_10px_20px_-10px_rgba(0,0,0,0.06)] border border-slate-200/80 ${className}`}
      >
        <div className="sticky top-0 bg-white z-10 border-b border-slate-100 px-6 pt-6 pb-4 flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1.5 min-w-0">
            {badge && <div>{badge}</div>}
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-snug">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-500">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="grid size-8.5 shrink-0 place-items-center rounded-full border border-slate-200/70 bg-white text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 cursor-pointer shadow-2xs"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 min-h-0 [scrollbar-width:thin]">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

function IconAction({
  icon,
  label,
  onClick,
  variant = "default",
  active = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  active?: boolean;
}) {
  return (
    <div className="relative group/tip">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
          active
            ? "bg-[#09232d] border-[#09232d] text-white"
            : variant === "danger"
              ? "border-transparent text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-100"
              : "border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-100 hover:border-slate-200"
        }`}
      >
        {icon}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 scale-95 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover/tip:scale-100 group-hover/tip:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

export function PipelineManagerModal({
  companyId,
  apiBasePath,
  pipelines,
  selectedPipelineId,
  onSelectPipeline,
  onClose,
  mode = "manage",
}: BaseModalProps & {
  pipelines: CrmPipeline[];
  selectedPipelineId?: number | null;
  onSelectPipeline: (pipelineId: number) => void;
  /** `prefer` hides create/edit/delete and company-default controls (agent). */
  mode?: "manage" | "prefer";
}) {
  const canManage = mode === "manage";
  const [newPipelineName, setNewPipelineName] = useState("");
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [editingIds, setEditingIds] = useState<Set<number>>(new Set());
  const [pipelinePendingDelete, setPipelinePendingDelete] =
    useState<CrmPipeline | null>(null);

  const { data: preferences } = useCrmPreferences(companyId, apiBasePath);
  const preferredPipelineId = preferences?.preferred_pipeline_id ?? null;

  const startEdit = (pipeline: CrmPipeline) => {
    setEditing((prev) => ({ ...prev, [pipeline.id]: pipeline.name }));
    setEditingIds((prev) => new Set(prev).add(pipeline.id));
  };

  const stopEdit = (id: number) => {
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const createPipeline = useCreateCrmPipeline(apiBasePath);
  const updatePipeline = useUpdateCrmPipeline(apiBasePath);
  const deletePipeline = useDeleteCrmPipeline(apiBasePath);
  const setPreferredPipeline = useSetPreferredCrmPipeline(apiBasePath);
  const setCompanyDefault = useSetCompanyDefaultCrmPipeline(apiBasePath);

  const saveNew = async () => {
    if (!newPipelineName.trim()) return;
    try {
      await createPipeline.mutateAsync({
        company_id: companyId,
        name: newPipelineName.trim(),
      });
      setNewPipelineName("");
      toast.success("Pipeline created");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create pipeline",
      );
    }
  };

  const saveEdit = async (id: number) => {
    const name = editing[id]?.trim();
    if (!name) return;
    try {
      await updatePipeline.mutateAsync({
        pipelineId: id,
        payload: { company_id: companyId, name },
      });
      stopEdit(id);
      toast.success("Pipeline updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update pipeline",
      );
    }
  };

  const confirmDeletePipeline = async () => {
    if (!pipelinePendingDelete) return;
    const pipeline = pipelinePendingDelete;
    setPipelinePendingDelete(null);

    try {
      const result = await deletePipeline.mutateAsync({
        pipelineId: pipeline.id,
        payload: { company_id: companyId, force: true },
      });

      const movedCount = result.data?.reassigned_leads_count ?? 0;
      if (movedCount > 0) {
        toast.success(
          `${pipeline.name} deleted. ${movedCount} leads were moved to ${result.data.reassigned_to_pipeline_name ?? "another pipeline"}.`,
        );
      } else {
        toast.success("Pipeline deleted");
      }

      if (selectedPipelineId === pipeline.id) {
        const fallback = pipelines.find((item) => item.id !== pipeline.id);
        if (fallback) {
          onSelectPipeline(fallback.id);
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete pipeline",
      );
    }
  };

  const handleSetPreferred = async (pipelineId: number) => {
    try {
      await setPreferredPipeline.mutateAsync({
        company_id: companyId,
        pipeline_id: pipelineId,
      });
      onSelectPipeline(pipelineId);
      toast.success("Personal default pipeline updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to set personal default",
      );
    }
  };

  const handleSetCompanyDefault = async (pipelineId: number) => {
    try {
      await setCompanyDefault.mutateAsync({
        pipelineId,
        payload: { company_id: companyId },
      });
      onSelectPipeline(pipelineId);
      toast.success("Company default pipeline updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to set company default",
      );
    }
  };

  const activePipeline =
    pipelines.find((p) => p.id === selectedPipelineId) ?? pipelines[0];

  const [searchQuery, setSearchQuery] = useState("");
  const filteredPipelines = useMemo(() => {
    if (!searchQuery.trim()) return pipelines;
    const q = searchQuery.toLowerCase().trim();
    return pipelines.filter((p) => p.name.toLowerCase().includes(q));
  }, [pipelines, searchQuery]);

  return (
    <>
      <ModalShell
        title="All Pipelines"
        subtitle="Choose which pipeline will track and nurture your prospects, or manage team stages."
        badge={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              <FolderKanban size={11} className="text-[#09232d]" />
              Pipelines
            </span>
            <span className="text-[11px] font-medium text-slate-400">• Workflows</span>
          </div>
        }
        onClose={onClose}
        className="se-pipeline-modal"
        footer={
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
            <div className="min-w-0 flex-1 pr-3">
              {activePipeline ? (
                <p className="truncate text-xs text-slate-500">
                  Destination:{" "}
                  <span className="font-semibold text-slate-800">
                    {activePipeline.name}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-slate-400">No pipeline selected</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/60 hover:text-slate-800 cursor-pointer"
            >
              Done
            </button>
          </div>
        }
      >
        {/* Search input if > 4 pipelines */}
        {pipelines.length > 4 && (
          <div className="relative mb-3">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pipelines…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8.5 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#09232d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#09232d] transition-all"
            />
          </div>
        )}

        <div className="space-y-2.5">
          {filteredPipelines.map((pipeline) => {
            const isActive = selectedPipelineId === pipeline.id;
            const isPreferred = preferredPipelineId === pipeline.id;
            const isCompanyDefault = pipeline.is_default;
            const canDelete = canManage && !pipeline.is_default;
            const isEditing = editingIds.has(pipeline.id);

            return (
              <div
                key={pipeline.id}
                onClick={() => {
                  if (!isEditing) {
                    onSelectPipeline(pipeline.id);
                    onClose();
                  }
                }}
                className={`group/row relative flex w-full items-center justify-between rounded-2xl border p-3.5 sm:p-4 text-left transition-all duration-150 ${
                  !isEditing ? "cursor-pointer" : ""
                } ${
                  isActive
                    ? "border-[#09232d] bg-[#09232d]/[0.03] shadow-[0_2px_8px_rgba(9,35,45,0.06)] ring-1 ring-[#09232d]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 shadow-2xs"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                  <div
                    className={`grid size-11 shrink-0 place-items-center rounded-xl transition-colors ${
                      isActive
                        ? "bg-[#09232d] text-white shadow-xs"
                        : "bg-slate-100 text-slate-500 group-hover/row:bg-slate-200/70 group-hover/row:text-slate-700"
                    }`}
                  >
                    <FolderKanban size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        value={editing[pipeline.id] ?? pipeline.name}
                        onChange={(e) =>
                          setEditing((prev) => ({
                            ...prev,
                            [pipeline.id]: e.target.value,
                          }))
                        }
                        readOnly={!canManage || !isEditing}
                        onKeyDown={(e) => {
                          if (canManage && isEditing) {
                            if (e.key === "Enter") saveEdit(pipeline.id);
                            if (e.key === "Escape") stopEdit(pipeline.id);
                          }
                        }}
                        className={`w-full truncate text-[14px] leading-snug font-semibold transition-colors ${
                          isActive ? "text-slate-900" : "text-slate-800"
                        } ${
                          canManage && isEditing
                            ? "h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] focus:border-[#09232d] focus:outline-none focus:ring-1 focus:ring-[#09232d] cursor-text"
                            : "border-none bg-transparent p-0 cursor-pointer pointer-events-none focus:outline-none"
                        }`}
                      />
                      {canManage && isEditing && (
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => saveEdit(pipeline.id)}
                            className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#09232d] text-white hover:bg-[#153e4e] cursor-pointer"
                            title="Save"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => stopEdit(pipeline.id)}
                            className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#09232d]">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Selected destination
                        </span>
                      ) : (
                        <span className="text-slate-400">Click to assign</span>
                      )}
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-400">
                        Currency: {pipeline.currency_code || "USD"}
                      </span>
                      {isPreferred && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          <Star size={10} className="fill-amber-500 text-amber-500" /> My default
                        </span>
                      )}
                      {isCompanyDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200/60 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          <Building2 size={10} className="text-blue-500" /> Company default
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions + Radio indicator */}
                <div className="flex items-center gap-2 shrink-0">
                  {!isEditing && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-0.5 transition-opacity opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
                    >
                      <IconAction
                        icon={<Eye size={14} />}
                        label="View pipeline"
                        onClick={() => {
                          onSelectPipeline(pipeline.id);
                          onClose();
                        }}
                        active={isActive}
                      />
                      <IconAction
                        icon={
                          <Star
                            size={14}
                            className={isPreferred ? "fill-current text-amber-500" : ""}
                          />
                        }
                        label={isPreferred ? "My default" : "Set as my default"}
                        onClick={() => handleSetPreferred(pipeline.id)}
                        active={isPreferred}
                      />
                      {canManage && (
                        <IconAction
                          icon={<Building2 size={14} />}
                          label={
                            isCompanyDefault
                              ? "Company default"
                              : "Set company default"
                          }
                          onClick={() => handleSetCompanyDefault(pipeline.id)}
                          active={isCompanyDefault}
                        />
                      )}
                      {canManage && (
                        <IconAction
                          icon={<Pencil size={14} />}
                          label="Edit name"
                          onClick={() => startEdit(pipeline)}
                        />
                      )}
                      {canDelete && (
                        <IconAction
                          icon={<Trash2 size={14} />}
                          label="Delete pipeline"
                          onClick={() => setPipelinePendingDelete(pipeline)}
                          variant="danger"
                        />
                      )}
                    </div>
                  )}

                  {/* Radio indicator */}
                  <div
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-all ${
                      isActive
                        ? "bg-[#09232d] text-white shadow-xs"
                        : "border-2 border-slate-300 bg-white group-hover/row:border-slate-400"
                    }`}
                  >
                    {isActive && <Check size={13} strokeWidth={3} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Creation Input */}
        {canManage && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <FolderPlus
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={newPipelineName}
                  onChange={(e) => setNewPipelineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNew();
                  }}
                  placeholder="Create new pipeline…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9.5 pr-3 text-xs text-slate-800 placeholder:text-slate-400 transition-all focus:border-[#09232d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#09232d]"
                />
              </div>
              <button
                type="button"
                onClick={saveNew}
                disabled={!newPipelineName.trim() || createPipeline.isPending}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#09232d] px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-[#153e4e] active:scale-[0.98] disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Plus size={14} />
                <span>Create</span>
              </button>
            </div>
          </div>
        )}
      </ModalShell>

      <ConfirmDeleteModal
        isOpen={pipelinePendingDelete !== null}
        onClose={() => setPipelinePendingDelete(null)}
        onConfirm={confirmDeletePipeline}
        title="Delete pipeline?"
        description={
          pipelinePendingDelete
            ? `Are you sure you want to delete "${pipelinePendingDelete.name}"? Leads in this pipeline will be moved to another pipeline. This action cannot be undone.`
            : "Are you sure you want to delete this pipeline?"
        }
        confirmLabel="Delete"
      />
    </>
  );
}

export function LabelManagerModal({
  companyId,
  apiBasePath,
  labels,
  onClose,
}: BaseModalProps & { labels: CrmLabel[] }) {
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#2563EB");
  const [drafts, setDrafts] = useState<
    Record<number, { name: string; color: string }>
  >({});

  const createLabel = useCreateCrmLabel(apiBasePath);
  const updateLabel = useUpdateCrmLabel(apiBasePath);
  const deleteLabel = useDeleteCrmLabel(apiBasePath);
  const reorderLabels = useReorderCrmLabels(apiBasePath);

  const sorted = useMemo(
    () => [...labels].sort((a, b) => a.sort_order - b.sort_order),
    [labels],
  );

  const persistOrder = async (orderedIds: number[]) => {
    try {
      await reorderLabels.mutateAsync({
        company_id: companyId,
        ordered_label_ids: orderedIds,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reorder labels",
      );
    }
  };

  const moveLabel = (id: number, direction: "up" | "down") => {
    const ordered = sorted.map((label) => label.id);
    const index = ordered.indexOf(id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const copy = [...ordered];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    persistOrder(copy);
  };

  const saveLabel = async (label: CrmLabel) => {
    const draft = drafts[label.id];
    if (!draft) return;
    try {
      await updateLabel.mutateAsync({
        labelId: label.id,
        payload: {
          company_id: companyId,
          name: draft.name.trim(),
          color: draft.color,
        },
      });
      toast.success("Label updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update label",
      );
    }
  };

  const createNew = async () => {
    if (!newLabelName.trim()) return;
    try {
      await createLabel.mutateAsync({
        company_id: companyId,
        name: newLabelName.trim(),
        color: newLabelColor,
      });
      setNewLabelName("");
      toast.success("Label created");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create label",
      );
    }
  };

  const deleteExistingLabel = async (label: CrmLabel) => {
    try {
      const result = await deleteLabel.mutateAsync({
        labelId: label.id,
        payload: { company_id: companyId, force: false },
      });

      const movedCount = result.data?.deleted_leads_count ?? 0;
      if (movedCount > 0) {
        toast.success(
          `${label.name} deleted. ${movedCount} leads were moved to ${result.data.reassigned_to_label_name ?? "another label"}.`,
        );
      } else {
        toast.success("Label deleted");
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const usageCountRaw = err.errors?.label_usage_count?.[0] ?? "0";
        const usageCount = Number.parseInt(usageCountRaw, 10);

        if (Number.isFinite(usageCount) && usageCount > 0) {
          const confirmed = window.confirm(
            `This label is currently assigned to ${usageCount} leads. Are you sure you want to delete it?`,
          );

          if (!confirmed) return;

          try {
            const forceResult = await deleteLabel.mutateAsync({
              labelId: label.id,
              payload: { company_id: companyId, force: true },
            });
            const movedCount =
              forceResult.data?.deleted_leads_count ?? usageCount;
            toast.success(
              `${label.name} deleted. ${movedCount} leads were reassigned.`,
            );
            return;
          } catch (forceErr) {
            toast.error(
              forceErr instanceof Error
                ? forceErr.message
                : "Failed to delete label",
            );
            return;
          }
        }
      }

      toast.error(
        err instanceof Error ? err.message : "Failed to delete label",
      );
    }
  };

  return (
    <ModalShell title="Manage Labels" onClose={onClose}>
      <div className="space-y-3 mb-5">
        {sorted.map((label) => {
          const draft = drafts[label.id] ?? {
            name: label.name,
            color: label.color,
          };
          return (
            <div
              key={label.id}
              className="border border-gray-200 rounded-xl p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  value={draft.name}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [label.id]: { ...draft, name: e.target.value },
                    }))
                  }
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                />
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [label.id]: { ...draft, color: e.target.value },
                    }))
                  }
                  className="w-10 h-9 border border-gray-200 rounded-lg bg-white p-1"
                />
                <button
                  onClick={() => moveLabel(label.id, "up")}
                  className="p-2 rounded-md border border-gray-200 text-gray-500"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveLabel(label.id, "down")}
                  className="p-2 rounded-md border border-gray-200 text-gray-500"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => saveLabel(label)}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600"
                >
                  Save
                </button>
                <button
                  onClick={() => deleteExistingLabel(label)}
                  className="px-3 py-2 rounded-lg border border-red-200 text-[12px] font-semibold text-red-600"
                >
                  Delete
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Key: {label.slug}
              </p>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-100 pt-4 flex items-center gap-2">
        <input
          value={newLabelName}
          onChange={(e) => setNewLabelName(e.target.value)}
          placeholder="Add new label"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
        />
        <input
          type="color"
          value={newLabelColor}
          onChange={(e) => setNewLabelColor(e.target.value)}
          className="w-10 h-9 border border-gray-200 rounded-lg bg-white p-1"
        />
        <button
          onClick={createNew}
          className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold"
        >
          Add
        </button>
      </div>
    </ModalShell>
  );
}
