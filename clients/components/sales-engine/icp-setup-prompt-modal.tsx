"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Target, X } from "lucide-react";

type IcpSetupPromptModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreateIcp: () => void;
};

export function IcpSetupPromptModal({
  isOpen,
  onClose,
  onCreateIcp,
}: IcpSetupPromptModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", duration: 0.34, bounce: 0.12 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="icp-setup-title"
            className="relative z-10 w-full max-w-[460px] overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.2)]"
          >
            <div className="relative overflow-hidden border-b border-slate-100 bg-[#09232d] px-6 pb-6 pt-5 text-white">
              <div className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-12 left-10 size-28 rounded-full bg-emerald-400/20 blur-2xl" />

              <div className="relative flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
                    <Sparkles size={11} className="text-amber-300" />
                    Setup required
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-2xl bg-white/10 text-white shadow-xs">
                      <Target size={18} />
                    </div>
                    <h2
                      id="icp-setup-title"
                      className="text-[18px] font-semibold leading-snug tracking-tight"
                    >
                      Create an ICP Build to unlock Sales Engine
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              <p className="text-[13px] leading-relaxed text-slate-600">
                Sales Engine uses your Ideal Customer Profile (ICP) to find the right prospects,
                score fit, and power Smart Leads. Without an ICP Build, discovery and outreach
                won&apos;t know who to target.
              </p>

              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                {[
                  "Define industries, roles, and territories you sell into",
                  "Let AI generate leads that match your market",
                  "Keep Smart Leads and Social Listing aligned to one target profile",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-[12px] text-slate-700">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#09232d]" />
                    <span className="leading-relaxed font-medium">{item}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                Takes about a minute. You can edit or switch ICP Builds anytime from ICP Builder.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-xl px-4 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-800 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onCreateIcp}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#09232d] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#0c2e3b] active:scale-[0.98] cursor-pointer"
              >
                <Target size={14} />
                Create ICP Build
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
