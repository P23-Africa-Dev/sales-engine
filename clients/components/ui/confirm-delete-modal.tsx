"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Trash2 } from "lucide-react";

type ConfirmDeleteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  /** When false, caller controls closing (e.g. after async success). Default true. */
  closeOnConfirm?: boolean;
  confirmDisabled?: boolean;
};

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete",
  description = "Are you sure you want to delete this? This action cannot be undone.",
  confirmLabel = "Delete",
  closeOnConfirm = true,
  confirmDisabled = false,
}: ConfirmDeleteModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!confirmDisabled) onClose();
            }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", duration: 0.28 }}
            className="relative bg-white border border-gray-100 rounded-3xl p-6 sm:p-8 max-w-[380px] w-full shadow-2xl flex flex-col items-center text-center z-10"
          >
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-5 shrink-0">
              <Trash2 size={22} className="text-red-500" />
            </div>

            <h3 className="text-[17px] font-bold text-[#0B1215] mb-2">{title}</h3>
            <p className="text-[13px] text-gray-500 leading-relaxed mb-6">{description}</p>

            <div className="flex gap-3 w-full">
              <button
                onClick={onClose}
                disabled={confirmDisabled}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-[#0B1215] rounded-xl text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  if (closeOnConfirm) onClose();
                }}
                disabled={confirmDisabled}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[13px] font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
