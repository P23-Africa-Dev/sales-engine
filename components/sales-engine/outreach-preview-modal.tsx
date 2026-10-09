"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  Eye,
  Loader2,
  Mail,
  Pencil,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useRegenerateOutreach, useSendOutreachActivity } from "@/hooks/use-sales-engine-outreach";
import { useOutreachInboxes } from "@/hooks/use-sales-engine-outreach-inbox";
import { useOutreachSenderSettings } from "@/hooks/use-sales-engine-outreach-sender";
import { normalizeOutreachSubjectBody, SalesEngineApiError } from "@/lib/api/sales-engine";

export type OutreachPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  activityId: number | null;
  channel: "email" | "whatsapp";
  initialSubject?: string | null;
  initialBody: string;
  initialToEmail?: string;
  contextLabel?: string;
  alignmentNote?: string;
  onSent: () => void;
  onConfigureSender?: () => void;
};

const AI_QUICK_PROMPTS = [
  { label: "Make it punchier", prompt: "Make the message shorter, more punchy, and direct." },
  { label: "Warmer tone", prompt: "Use a warmer, more conversational and consultative tone." },
  { label: "Focus on ROI", prompt: "Emphasize concrete ROI, efficiency gains, and business value." },
  { label: "Clear call to action", prompt: "Add a low friction, compelling call to action at the end." },
];

const AI_GENERATING_LABELS = [
  "Reading your draft…",
  "Rewriting the message…",
  "Tuning tone and clarity…",
  "Polishing the final copy…",
];

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SalesEngineApiError) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function AiDraftGeneratingPanel({ label }: { label: string }) {
  return (
    <div
      className="relative min-h-[190px] overflow-hidden rounded-xl border border-[#09232d]/15 bg-slate-50/70 p-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-[#09232d]/10 to-transparent"
          animate={{ y: ["-100%", "420%"] }}
          transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity }}
        />
        <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgba(9,35,45,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(9,35,45,0.04)_1px,transparent_1px)] [background-size:18px_18px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#09232d]/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#09232d] shadow-xs">
          <Sparkles size={12} className="animate-pulse text-amber-500" />
          <span>AI is generating</span>
          <Loader2 size={12} className="animate-spin text-[#09232d]/70" />
        </div>
        <p className="text-xs font-medium text-slate-600">{label}</p>
        <div className="mt-1 w-full max-w-[280px] space-y-2">
          <div className="h-2.5 animate-pulse rounded-full bg-slate-200/90" />
          <div className="h-2.5 w-[88%] animate-pulse rounded-full bg-slate-200/80 [animation-delay:120ms]" />
          <div className="h-2.5 w-[72%] animate-pulse rounded-full bg-slate-200/70 [animation-delay:240ms]" />
          <div className="h-2.5 w-[94%] animate-pulse rounded-full bg-slate-200/80 [animation-delay:360ms]" />
        </div>
      </div>
    </div>
  );
}

export function OutreachPreviewModal({
  open,
  onClose,
  activityId,
  channel,
  initialSubject,
  initialBody,
  initialToEmail = "",
  contextLabel,
  alignmentNote,
  onSent,
  onConfigureSender,
}: OutreachPreviewModalProps) {
  const sendOutreach = useSendOutreachActivity();
  const regenerate = useRegenerateOutreach();
  const { data: senderSettings } = useOutreachSenderSettings(open && channel === "email");
  const { data: inboxes } = useOutreachInboxes(open && channel === "email");

  const [toEmail, setToEmail] = useState(initialToEmail);
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody);
  const [instructions, setInstructions] = useState("");
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [alignmentDismissed, setAlignmentDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatingLabelIndex, setGeneratingLabelIndex] = useState(0);
  const [isTypingOut, setIsTypingOut] = useState(false);
  const [selectedInboxId, setSelectedInboxId] = useState<number | null>(null);
  const typewriterRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const draftWorkspaceRef = useRef<HTMLDivElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);

  const clearTypewriter = useCallback(() => {
    if (typewriterRef.current != null) {
      window.clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    setIsTypingOut(false);
  }, []);

  const bringDraftIntoView = useCallback(() => {
    // Prefer scrolling the draft workspace into the modal viewport.
    draftWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Also nudge the modal scroller in case nested layout ignores scrollIntoView.
    const scroller = scrollContainerRef.current;
    const workspace = draftWorkspaceRef.current;
    if (scroller && workspace) {
      const scrollerRect = scroller.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const nextTop =
        scroller.scrollTop + (workspaceRect.top - scrollerRect.top) - scroller.clientHeight * 0.18;
      scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
    }
  }, []);

  const typeOutDraft = useCallback(
    (nextBody: string, nextSubject: string) => {
      clearTypewriter();
      setActiveTab("edit");
      setIsTypingOut(true);
      setSubject(nextSubject);
      setBody("");
      window.requestAnimationFrame(() => bringDraftIntoView());

      let index = 0;
      const step = Math.max(2, Math.ceil(nextBody.length / 90));
      typewriterRef.current = window.setInterval(() => {
        index = Math.min(nextBody.length, index + step);
        setBody(nextBody.slice(0, index));
        const textarea = draftTextareaRef.current;
        if (textarea) {
          textarea.scrollTop = textarea.scrollHeight;
        }
        if (index >= nextBody.length) {
          clearTypewriter();
        }
      }, 18);
    },
    [bringDraftIntoView, clearTypewriter]
  );

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeOutreachSubjectBody(initialBody, initialSubject);
    /* eslint-disable react-hooks/set-state-in-effect -- reset draft fields when modal opens */
    clearTypewriter();
    setToEmail(initialToEmail);
    setSubject(normalized.subject);
    setBody(normalized.body);
    setInstructions("");
    setShowAiAssistant(false);
    setActiveTab("edit");
    setAlignmentDismissed(false);
    setCopied(false);
    setGeneratingLabelIndex(0);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, activityId, initialSubject, initialBody, initialToEmail, clearTypewriter]);

  useEffect(() => {
    if (!regenerate.isPending) return;
    const timer = window.setInterval(() => {
      setGeneratingLabelIndex((current) => (current + 1) % AI_GENERATING_LABELS.length);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [regenerate.isPending]);

  useEffect(() => {
    return () => {
      if (typewriterRef.current != null) {
        window.clearInterval(typewriterRef.current);
      }
    };
  }, []);

  const emailValid = useMemo(() => isValidEmail(toEmail), [toEmail]);
  const bodyReady = body.trim().length > 0;
  const isBusy = sendOutreach.isPending || regenerate.isPending || isTypingOut;
  const isAiRewriting = regenerate.isPending || isTypingOut;

  const confirmedInboxes = useMemo(
    () => (inboxes ?? []).filter((i) => i.status === "confirmed"),
    [inboxes]
  );

  useEffect(() => {
    if (!open || channel !== "email") return;
    const preferred =
      senderSettings?.default_inbox?.id ??
      confirmedInboxes.find((i) => i.is_default)?.id ??
      confirmedInboxes[0]?.id ??
      null;
    setSelectedInboxId(preferred);
  }, [open, channel, senderSettings?.default_inbox?.id, confirmedInboxes]);

  const selectedInbox = useMemo(
    () => confirmedInboxes.find((i) => i.id === selectedInboxId) ?? null,
    [confirmedInboxes, selectedInboxId]
  );

  const setupReady = Boolean(senderSettings?.setup?.can_send_organization && selectedInbox);
  const usingPlatform = (senderSettings?.sender_mode ?? "platform") === "platform" || !setupReady;
  const canSendEmail =
    channel === "email" &&
    Boolean(activityId) &&
    emailValid &&
    bodyReady &&
    !isBusy &&
    (usingPlatform || setupReady);

  useEffect(() => {
    if (!isAiRewriting) return;
    const frame = window.requestAnimationFrame(() => bringDraftIntoView());
    return () => window.cancelAnimationFrame(frame);
  }, [isAiRewriting, bringDraftIntoView]);

  const wordCount = useMemo(() => {
    return body.trim() ? body.trim().split(/\s+/).length : 0;
  }, [body]);

  const readTimeSeconds = useMemo(() => {
    return Math.max(10, Math.round((wordCount / 200) * 60));
  }, [wordCount]);

  const fromAddress = usingPlatform
    ? senderSettings?.platform_from_email || "Platform email"
    : selectedInbox?.email ?? "Confirm an inbox in email settings";

  const isVerifiedSender = usingPlatform || setupReady;

  const handleCopy = async () => {
    try {
      const text =
        channel === "email" && subject.trim()
          ? `Subject: ${subject.trim()}\n\n${body}`
          : body;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Message copied to clipboard.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy message.");
    }
  };

  const handleRegenerateWithPrompt = (customPrompt?: string) => {
    if (!activityId || regenerate.isPending || isTypingOut) return;
    const promptToSend = customPrompt ?? instructions.trim();
    clearTypewriter();
    setGeneratingLabelIndex(0);
    setActiveTab("edit");
    bringDraftIntoView();
    regenerate.mutate(
      {
        activityId,
        instructions: promptToSend || undefined,
        channel,
      },
      {
        onSuccess: (result) => {
          const normalized = normalizeOutreachSubjectBody(result.body, result.subject);
          typeOutDraft(normalized.body, normalized.subject);
          toast.success("Draft regenerated successfully.");
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not regenerate draft.")),
      }
    );
  };

  const handleSend = useCallback(() => {
    if (!activityId || !canSendEmail) return;
    if (!usingPlatform && !selectedInboxId) return;
    sendOutreach.mutate(
      {
        activityId,
        to_email: toEmail.trim(),
        subject: subject.trim() || undefined,
        body: body.trim(),
        ...(usingPlatform ? {} : { inbox_id: selectedInboxId ?? undefined }),
      },
      {
        onSuccess: () => {
          toast.success(`Outreach queued for ${toEmail.trim()}.`);
          onSent();
          onClose();
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not send outreach email.")),
      }
    );
  }, [
    activityId,
    canSendEmail,
    usingPlatform,
    selectedInboxId,
    onSent,
    onClose,
    sendOutreach,
    toEmail,
    subject,
    body,
  ]);

  // Keyboard shortcut: Cmd+Enter / Ctrl+Enter to send
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (canSendEmail) {
          handleSend();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, canSendEmail, handleSend]);

  return typeof document !== "undefined"
    ? createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !isBusy && onClose()}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-md"
              />

              {/* Modal Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 14 }}
                transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
                role="dialog"
                aria-modal="true"
                aria-label="Review outreach"
                className="relative z-10 flex max-h-[92vh] w-full max-w-[620px] flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-white text-slate-900 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.18),0_10px_20px_-10px_rgba(0,0,0,0.06)]"
              >
                {/* Executive Top Banner */}
                <div className="border-b border-slate-100 bg-white px-6 pt-5 pb-4 shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {/* Avatar Icon */}
                      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#09232d] text-white shadow-xs">
                        <Mail size={18} />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">
                            Outreach Dispatch
                          </span>

                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
                              channel === "whatsapp"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-blue-200 bg-blue-50 text-blue-800"
                            }`}
                          >
                            <Radio
                              size={10}
                              className={
                                channel === "whatsapp" ? "text-emerald-600" : "text-blue-600"
                              }
                            />
                            {channel === "whatsapp" ? "WhatsApp" : "Direct Email"}
                          </span>

                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              isAiRewriting
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "bg-emerald-50 border-emerald-200/70 text-emerald-700"
                            }`}
                          >
                            <span
                              className={`size-1.5 rounded-full ${
                                isAiRewriting
                                  ? "bg-amber-500 animate-pulse"
                                  : "bg-emerald-500 animate-pulse"
                              }`}
                            />
                            {regenerate.isPending
                              ? "AI Generating"
                              : isTypingOut
                                ? "Writing Draft"
                                : "Ready to Send"}
                          </span>
                        </div>

                        <h3 className="text-base font-semibold text-slate-900 tracking-tight leading-snug truncate">
                          {contextLabel ? `Review Outreach for ${contextLabel}` : "Review & Dispatch Outreach"}
                        </h3>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => !isBusy && onClose()}
                      aria-label="Close"
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-slate-200/80 bg-white text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Always-visible generating banner (outside scroll so it can't hide) */}
                <AnimatePresence>
                  {isAiRewriting && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="shrink-0 overflow-hidden border-b border-amber-200/80 bg-amber-50"
                    >
                      <div className="flex items-center justify-between gap-3 px-6 py-2.5">
                        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-amber-900">
                          {regenerate.isPending ? (
                            <Loader2 size={13} className="shrink-0 animate-spin text-amber-700" />
                          ) : (
                            <Sparkles size={13} className="shrink-0 animate-pulse text-amber-600" />
                          )}
                          <span className="truncate">
                            {regenerate.isPending
                              ? AI_GENERATING_LABELS[generatingLabelIndex]
                              : "AI is writing your updated draft…"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={bringDraftIntoView}
                          className="shrink-0 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-900 transition hover:bg-amber-100 cursor-pointer"
                        >
                          Show draft
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main Scrollable Canvas */}
                <div
                  ref={scrollContainerRef}
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 [scrollbar-width:thin]"
                >
                  {/* Alignment Note (if provided) */}
                  {alignmentNote && !alignmentDismissed && (
                    <div className="flex items-start gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3 shadow-xs">
                      <Zap size={15} className="mt-0.5 shrink-0 text-indigo-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wider">
                          Context Alignment
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-indigo-900/80 font-medium">
                          {alignmentNote}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAlignmentDismissed(true)}
                        className="shrink-0 text-indigo-400 hover:text-indigo-700 transition cursor-pointer"
                        aria-label="Dismiss note"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {/* Envelope Section: Sender, Recipient & Subject Line */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                    {/* To Field */}
                    <div className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        To:
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="relative">
                          <input
                            type="email"
                            value={toEmail}
                            onChange={(e) => setToEmail(e.target.value)}
                            placeholder="recipient@company.com"
                            disabled={channel === "whatsapp"}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#09232d] focus:ring-1 focus:ring-[#09232d] disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      </div>
                    </div>

                    {channel === "email" && toEmail.trim() && !emailValid && (
                      <p className="pl-[68px] text-[10px] font-semibold text-rose-600">
                        Please enter a valid email address.
                      </p>
                    )}

                    {/* From Field */}
                    {channel === "email" && (
                      <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-200/60">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span className="w-14 shrink-0 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            From:
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            {confirmedInboxes.length > 0 && !usingPlatform ? (
                              <select
                                value={selectedInboxId ?? ""}
                                onChange={(e) =>
                                  setSelectedInboxId(
                                    e.target.value ? Number(e.target.value) : null
                                  )
                                }
                                className="h-8 w-full max-w-[280px] rounded-[8px] border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800"
                              >
                                {confirmedInboxes.map((inbox) => (
                                  <option key={inbox.id} value={inbox.id}>
                                    {inbox.email}
                                    {inbox.is_default ? " (default)" : ""}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="truncate text-xs font-medium text-slate-800">
                                {fromAddress}
                              </span>
                            )}
                            <div className="flex items-center gap-1.5">
                              {isVerifiedSender ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 shrink-0">
                                  <ShieldCheck size={12} />
                                  {usingPlatform ? "Platform ready" : "Ready"}
                                </span>
                              ) : (
                                <span className="text-[10px] text-rose-600 shrink-0">
                                  {(senderSettings?.setup?.blocking_reasons ?? []).join(" ") ||
                                    "Complete email setup before sending."}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {onConfigureSender && (
                          <button
                            type="button"
                            onClick={onConfigureSender}
                            className="shrink-0 text-[11px] font-semibold text-[#09232d] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                          >
                            Configure
                          </button>
                        )}
                      </div>
                    )}

                    {/* Subject Line */}
                    {channel === "email" && (
                      <div className="flex items-center gap-3 pt-2 border-t border-slate-200/60">
                        <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Subject:
                        </span>
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Email subject line…"
                            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#09232d] focus:ring-1 focus:ring-[#09232d]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Message Workspace Card */}
                  <div
                    ref={draftWorkspaceRef}
                    className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs"
                  >
                    {/* Workspace Sub-header & Mode Switcher */}
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
                      {/* Segmented Control */}
                      <div className="flex items-center rounded-xl bg-slate-200/70 p-0.5">
                        <button
                          type="button"
                          onClick={() => setActiveTab("edit")}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                            activeTab === "edit"
                              ? "bg-white text-slate-900 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Pencil size={11} />
                          <span>Edit Draft</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("preview")}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                            activeTab === "preview"
                              ? "bg-white text-slate-900 shadow-xs"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Eye size={11} />
                          <span>Recipient Preview</span>
                        </button>
                      </div>

                      {/* Live Counter Badges */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                        {isAiRewriting ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#09232d]">
                            <Loader2 size={11} className="animate-spin" />
                            {regenerate.isPending ? "Generating…" : "Writing draft…"}
                          </span>
                        ) : (
                          <>
                            <span>{wordCount} words</span>
                            <span>•</span>
                            <span>~{readTimeSeconds}s read</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Mode 1: Editor View */}
                    {activeTab === "edit" ? (
                      <div className="p-3">
                        {regenerate.isPending ? (
                          <AiDraftGeneratingPanel
                            label={AI_GENERATING_LABELS[generatingLabelIndex]}
                          />
                        ) : (
                          <div className="relative">
                            <textarea
                              ref={draftTextareaRef}
                              value={body}
                              onChange={(e) => setBody(e.target.value)}
                              rows={9}
                              disabled={isTypingOut}
                              placeholder="Draft message content…"
                              className={`min-h-[190px] w-full resize-y rounded-xl border border-slate-100 bg-slate-50/40 p-3 text-xs leading-relaxed text-slate-800 outline-none transition focus:border-[#09232d] focus:bg-white focus:ring-1 focus:ring-[#09232d] ${
                                isTypingOut ? "caret-amber-500" : ""
                              }`}
                            />
                            {isTypingOut && (
                              <div className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800 shadow-xs">
                                <Sparkles size={10} className="animate-pulse" />
                                Writing…
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Mode 2: Real Recipient Preview */
                      <div className="p-5 min-h-[210px] bg-slate-50/40 space-y-4">
                        {regenerate.isPending ? (
                          <AiDraftGeneratingPanel
                            label={AI_GENERATING_LABELS[generatingLabelIndex]}
                          />
                        ) : (
                          <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-2 shadow-xs">
                            {channel === "email" && subject.trim() && (
                              <h4 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
                                {subject}
                              </h4>
                            )}
                            <div className="whitespace-pre-line text-xs leading-relaxed text-slate-800">
                              {body || (
                                <span className="italic text-slate-400">Empty message draft</span>
                              )}
                              {isTypingOut && (
                                <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-[#09232d] align-middle" />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI Copilot Quick Toolbar */}
                    <div className="border-t border-slate-100 bg-slate-50/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <Wand2 size={13} className="text-amber-500" />
                          <span>{regenerate.isPending ? "AI Assist working…" : "AI Assist:"}</span>
                        </div>

                        {/* Quick Action Prompt Chips */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {AI_QUICK_PROMPTS.map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              disabled={!activityId || isAiRewriting}
                              onClick={() => {
                                setInstructions(item.prompt);
                                setShowAiAssistant(true);
                                handleRegenerateWithPrompt(item.prompt);
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-2xs transition hover:border-[#09232d] hover:text-[#09232d] hover:bg-slate-50 active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              {item.label}
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() => setShowAiAssistant((prev) => !prev)}
                            disabled={isAiRewriting}
                            className="rounded-lg bg-slate-200/70 px-2 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-300/70 cursor-pointer disabled:opacity-50"
                          >
                            {showAiAssistant ? "Hide Custom Prompt" : "Custom Prompt…"}
                          </button>
                        </div>
                      </div>

                      {/* Custom Prompt Drawer */}
                      {showAiAssistant && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 space-y-2">
                          <input
                            type="text"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            disabled={isAiRewriting}
                            placeholder="e.g. Add urgency, mention our fintech analytics module, keep it under 100 words…"
                            className="h-8.5 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#09232d] focus:ring-1 focus:ring-[#09232d] disabled:opacity-60"
                          />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              disabled={!activityId || isAiRewriting}
                              onClick={() => handleRegenerateWithPrompt()}
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#09232d] px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#153e4e] active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              {regenerate.isPending ? (
                                <>
                                  <Loader2 size={12} className="animate-spin text-white" />
                                  <span>Regenerating…</span>
                                </>
                              ) : isTypingOut ? (
                                <>
                                  <Sparkles size={12} className="animate-pulse text-amber-400" />
                                  <span>Writing draft…</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={12} className="text-amber-400" />
                                  <span>Regenerate with AI</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Channel Guidance (WhatsApp) */}
                  {channel === "whatsapp" && (
                    <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 font-medium">
                      <Radio size={14} className="text-emerald-600 shrink-0" />
                      <span>
                        WhatsApp direct dispatch is in beta. Use <strong>Copy Message</strong> to paste and send directly into WhatsApp Web or mobile.
                      </span>
                    </div>
                  )}

                  {!activityId && (
                    <p className="text-center text-[11px] font-semibold text-rose-600">
                      Draft is not linked to a registered database activity record.
                    </p>
                  )}
                </div>

                {/* Polished Executive Footer */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                  {/* Left: Copy & Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex h-9.5 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check size={13} className="text-emerald-600" />
                          <span className="text-emerald-600 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copy Message</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right: Cancel & Send */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={onClose}
                      className="h-9.5 rounded-xl px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/60 hover:text-slate-800 disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>

                    {channel === "email" ? (
                      <button
                        type="button"
                        disabled={!canSendEmail}
                        onClick={handleSend}
                        className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-[#09232d] px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#153e4e] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                      >
                        {sendOutreach.isPending ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-white" />
                            <span>Sending…</span>
                          </>
                        ) : (
                          <>
                            <Send size={13} />
                            <span>Send Email</span>
                            <kbd className="hidden sm:inline-block text-[9px] bg-white/20 px-1.5 py-0.5 rounded text-white/90">
                              ⌘↵
                            </kbd>
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-[#09232d] px-5 text-xs font-semibold text-white opacity-40"
                      >
                        <Send size={13} />
                        <span>Send</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )
    : null;
}
