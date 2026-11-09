"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Zap, X } from "lucide-react";
import { toast } from "sonner";
import { useCreditTopupCheckout } from "@/hooks/use-map-credits";

const PRESET_AMOUNTS = [5, 10, 25, 50];

export function TopupModal({
  isOpen,
  onClose,
  creditsPerUsd,
  companyId,
}: {
  isOpen: boolean;
  onClose: () => void;
  creditsPerUsd: number;
  companyId?: number | string;
}) {
  const [amount, setAmount] = useState("10");
  const checkout = useCreditTopupCheckout(companyId);

  const rate = creditsPerUsd > 0 ? creditsPerUsd : 100;
  const usd = Math.max(0, Number(amount) || 0);
  const credits = Math.round(usd * rate);

  const submit = async () => {
    if (usd < 1) {
      toast.error("The minimum top up amount is $1.");
      return;
    }
    try {
      const res = await checkout.mutateAsync(usd);
      window.location.href = res.data.checkout_url;
    } catch (error) {
      toast.error((error as Error).message || "Unable to start checkout.");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-3xl p-6 sm:p-7 max-w-[420px] w-full shadow-2xl z-10"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center mb-4">
              <Zap size={22} className="text-green-600" />
            </div>

            <h3 className="text-[18px] font-bold text-dash-dark mb-1">Top up map credits</h3>
            <p className="text-[13px] text-gray-500 mb-5">
              Credits never expire and are added instantly after payment. 1 credit = ${(1 / rate).toFixed(2)}.
            </p>

            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Amount (USD)
            </label>
            <div className="relative mb-3">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
              <input
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-[16px] font-semibold text-dash-dark focus:outline-none focus:ring-2 focus:ring-green-500/30"
              />
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${
                    usd === preset
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 mb-5 flex items-center justify-between">
              <span className="text-[13px] text-gray-500">You&apos;ll receive</span>
              <span className="text-[18px] font-black text-dash-dark">
                {credits.toLocaleString()} <span className="text-[13px] font-semibold text-gray-500">credits</span>
              </span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={checkout.isPending || usd < 1}
                className="flex-1 py-3 rounded-xl bg-dash-dark text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {checkout.isPending && <Loader2 size={15} className="animate-spin" />}
                Continue to payment
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
