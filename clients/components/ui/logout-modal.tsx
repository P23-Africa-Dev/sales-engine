"use client";

import { motion, AnimatePresence } from "framer-motion";
import { LogOut } from "lucide-react";

type LogoutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function LogoutModal({ isOpen, onClose, onConfirm }: LogoutModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop with premium blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-[#0d2d3a] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-[400px] w-full shadow-2xl flex flex-col items-center text-center z-10"
          >
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-5 shrink-0">
              <LogOut size={24} className="text-red-400 ml-0.5" />
            </div>

            <h3 className="text-[18px] font-bold text-white mb-2">
              Sign Out
            </h3>
            <p className="text-[13px] text-white/50 leading-relaxed mb-6">
              Are you sure you want to log out? You will need to re-authenticate to access your dashboard.
              </p>

            <div className="flex gap-3 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[13px] font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[13px] font-semibold shadow-lg shadow-red-500/15 transition-all cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
