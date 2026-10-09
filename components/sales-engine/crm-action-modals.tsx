"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Building2,
  Check,
  Clock,
  Copy,
  FolderKanban,
  Loader2,
  Mail,
  Radio,
  Search,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";

export type CrmPipelineOption = { id: string; name: string };

/* ==========================================================================
   1. ADD TO CRM PIPELINE MODAL
   ========================================================================== */

export function AddToCrmPipelineModal({
  isOpen,
  onClose,
  prospectName,
  pipelines,
  isLoading = false,
  isError = false,
  onRetry,
  isConfirming = false,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  prospectName: string | null;
  pipelines: CrmPipelineOption[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isConfirming?: boolean;
  onConfirm: (pipelineId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, [isOpen]);
  const close = () => { if (!isConfirming) onClose(); };
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPipelines = useMemo(() => {
    if (!searchQuery.trim()) return pipelines;
    const q = searchQuery.toLowerCase();
    return pipelines.filter((p) => p.name.toLowerCase().includes(q));
  }, [pipelines, searchQuery]);

  const effectiveSelectedId =
    selectedPipelineId && pipelines.some((pipeline) => pipeline.id === selectedPipelineId)
      ? selectedPipelineId
      : (pipelines[0]?.id ?? null);

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === effectiveSelectedId),
    [pipelines, effectiveSelectedId]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-destination-title"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              if (event.key !== "Tab") return;
              const controls = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
              if (!controls?.length) return;
              const first = controls[0], last = controls[controls.length - 1];
              if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
            className="relative z-10 w-full max-w-[450px] overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.18),0_10px_20px_-10px_rgba(0,0,0,0.06)]"
          >
            {/* Modal Header */}
            <div className="border-b border-slate-100 bg-white px-6 pt-6 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                      <UserPlus size={11} className="text-[#09232d]" />
                      Add to CRM
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">• Pipeline</span>
                  </div>

                  <h3 id="crm-destination-title" className="text-base font-semibold text-slate-900 tracking-tight leading-snug">
                    {prospectName ? (
                      <>
                        Select a pipeline for{" "}
                        <span className="font-semibold text-[#09232d]">{prospectName}</span>
                      </>
                    ) : (
                      "Select a CRM Pipeline"
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Choose which pipeline will track and nurture this prospect.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-200/70 bg-white text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Search input if > 4 pipelines */}
              {pipelines.length > 4 && (
                <div className="relative mt-3.5">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search pipelines…"
                    className="h-8.5 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8.5 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#09232d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#09232d]"
                  />
                </div>
              )}
            </div>

            {/* Pipeline Selection List */}
            <div className="max-h-[300px] space-y-2 overflow-y-auto px-6 py-4 [scrollbar-width:thin]">
              {isError ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Could not load CRM pipelines. <button type="button" onClick={onRetry} className="underline">Retry</button></div> : isLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-xs font-semibold text-slate-500">
                  <Loader2 size={20} className="animate-spin text-[#09232d]" />
                  <span>Loading available pipelines…</span>
                </div>
              ) : pipelines.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                  <FolderKanban size={24} className="mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-700">No pipelines found</p>
                  <p className="mt-0.5 text-slate-400">Please create a pipeline in CRM first.</p>
                </div>
              ) : filteredPipelines.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  No pipelines match &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredPipelines.map((pipeline) => {
                  const isSelected = effectiveSelectedId === pipeline.id;
                  return (
                    <button
                      key={pipeline.id}
                      type="button"
                      onClick={() => setSelectedPipelineId(pipeline.id)}
                      className={`group flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? "border-[#09232d] bg-[#09232d]/[0.03] shadow-[0_2px_8px_rgba(9,35,45,0.06)] ring-1 ring-[#09232d]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${
                            isSelected
                              ? "bg-[#09232d] text-white shadow-xs"
                              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200/70 group-hover:text-slate-700"
                          }`}
                        >
                          <FolderKanban size={16} />
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`truncate text-[13px] leading-snug font-semibold ${
                              isSelected ? "text-slate-900" : "text-slate-800"
                            }`}
                          >
                            {pipeline.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-[#09232d]">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                Selected destination
                              </span>
                            ) : (
                              <span className="text-slate-400">Click to assign</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Radio indicator */}
                      <div
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full transition-all ${
                          isSelected
                            ? "bg-[#09232d] text-white shadow-xs"
                            : "border-2 border-slate-300 bg-white group-hover:border-slate-400"
                        }`}
                      >
                        {isSelected && <Check size={11} strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <div className="min-w-0 flex-1 pr-3">
                {selectedPipeline ? (
                  <p className="truncate text-xs text-slate-500">
                    Destination:{" "}
                    <span className="font-semibold text-slate-800">{selectedPipeline.name}</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">No pipeline selected</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={close}
                  disabled={isConfirming}
                  className="h-9.5 rounded-xl px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/60 hover:text-slate-800 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!effectiveSelectedId || isConfirming || isLoading || isError || pipelines.length === 0}
                  onClick={() => effectiveSelectedId && onConfirm(effectiveSelectedId)}
                  className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-[#09232d] px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#153e4e] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Adding…</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={13} />
                      <span>Add Prospect</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ==========================================================================
   2. CONFIRM ACTION MODAL SHELL
   ========================================================================== */

function ConfirmActionShell({
  isOpen,
  onClose,
  eyebrow,
  title,
  subtitle,
  icon,
  children,
  confirmLabel,
  isConfirming = false,
  confirmDisabled = false,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  isConfirming?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
            className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.18),0_10px_20px_-10px_rgba(0,0,0,0.06)]"
          >
            {/* Header */}
            <div className="border-b border-slate-100 bg-white px-6 pt-6 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {icon && (
                    <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-[#09232d] shadow-xs">
                      {icon}
                    </div>
                  )}
                  <div className="space-y-1 min-w-0">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                      {eyebrow}
                    </span>
                    <h3 className="text-base font-semibold text-slate-900 tracking-tight leading-snug truncate">
                      {title}
                    </h3>
                    {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-200/70 bg-white text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="max-h-[420px] space-y-3 overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
              {children}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isConfirming}
                className="h-9.5 rounded-xl px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/60 hover:text-slate-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmDisabled || isConfirming}
                onClick={onConfirm}
                className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-[#09232d] px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#153e4e] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {isConfirming ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <span>{confirmLabel}</span>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ==========================================================================
   3. CREATE OUTREACH CONFIRM MODAL
   ========================================================================== */

export function CreateOutreachConfirmModal({
  isOpen,
  onClose,
  prospectName,
  company,
  channel,
  suggestedMessage,
  source,
  intent,
  isConfirming = false,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  prospectName: string;
  company: string;
  channel: string;
  suggestedMessage: string;
  source: string;
  intent: string;
  isConfirming?: boolean;
  onConfirm: () => void;
}) {
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = () => {
    if (!suggestedMessage) return;
    navigator.clipboard.writeText(suggestedMessage);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const initial = (prospectName || "P").trim().charAt(0).toUpperCase();

  return (
    <ConfirmActionShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Create Outreach"
      title={`Draft outreach for ${prospectName}`}
      subtitle="Review signals and message draft before generating outreach."
      icon={<Mail size={18} />}
      confirmLabel="Create Outreach"
      isConfirming={isConfirming}
      onConfirm={onConfirm}
    >
      {/* Target Prospect & Company Card */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#09232d] text-white text-xs font-semibold shadow-xs">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">{prospectName}</p>
            <p className="flex items-center gap-1 truncate text-[11px] text-slate-500">
              <Building2 size={11} className="text-slate-400 shrink-0" />
              <span className="truncate">{company || "Unknown Company"}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-xs">
            <Radio size={11} className="text-emerald-500 shrink-0" />
            <span>{channel}</span>
          </span>
        </div>
      </div>

      {/* Signals Grid: Source & Intent */}
      {(source || intent) && (
        <div className="grid grid-cols-2 gap-2">
          {source && (
            <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Source
              </span>
              <p className="truncate mt-0.5 text-xs font-semibold text-slate-800">{source}</p>
            </div>
          )}
          {intent && (
            <div className="rounded-xl border border-slate-200/80 bg-white p-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Intent
              </span>
              <p className="truncate mt-0.5 text-xs font-semibold text-[#09232d]">{intent}</p>
            </div>
          )}
        </div>
      )}

      {/* Suggested Message Card */}
      {suggestedMessage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
              <Sparkles size={12} className="text-[#09232d]" />
              <span>Suggested Draft</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">
                {suggestedMessage.length} characters
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                {hasCopied ? (
                  <>
                    <Check size={10} className="text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={10} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <p className="whitespace-pre-line text-xs font-normal leading-relaxed text-slate-700 bg-slate-50/70 rounded-xl p-3 border border-slate-100 italic">
            &ldquo;{suggestedMessage}&rdquo;
          </p>
        </div>
      )}
    </ConfirmActionShell>
  );
}

/* ==========================================================================
   4. SET REMINDER CONFIRM MODAL
   ========================================================================== */

export function SetReminderConfirmModal({
  isOpen,
  onClose,
  prospectName,
  company,
  remindAtLabel,
  note,
  isConfirming = false,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  prospectName: string;
  company: string;
  remindAtLabel: string;
  note: string;
  isConfirming?: boolean;
  onConfirm: () => void;
}) {
  const initial = (prospectName || "P").trim().charAt(0).toUpperCase();

  return (
    <ConfirmActionShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Set Reminder"
      title={`Remind me about ${prospectName}`}
      subtitle="Schedule an automated reminder notification for this opportunity."
      icon={<Bell size={18} />}
      confirmLabel="Confirm Reminder"
      isConfirming={isConfirming}
      onConfirm={onConfirm}
    >
      {/* Target Prospect & Company Card */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#09232d] text-white text-xs font-semibold shadow-xs">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">{prospectName}</p>
            <p className="flex items-center gap-1 truncate text-[11px] text-slate-500">
              <Building2 size={11} className="text-slate-400 shrink-0" />
              <span className="truncate">{company || "Unknown Company"}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Reminder Timing Card */}
      <div className="flex items-center gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/40 p-3.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
          <Clock size={16} />
        </div>
        <div className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800/70">
            Reminder Scheduled
          </span>
          <p className="text-xs font-semibold text-amber-950 mt-0.5">
            {remindAtLabel || "Next scheduled follow up"}
          </p>
        </div>
      </div>

      {/* Note Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Follow up note
        </span>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-700 bg-slate-50/70 rounded-xl p-3 border border-slate-100">
          {note || "Follow up on this social opportunity."}
        </p>
      </div>
    </ConfirmActionShell>
  );
}
