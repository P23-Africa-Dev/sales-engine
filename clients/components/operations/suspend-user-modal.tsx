"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

type SuspendType = "duration" | "date" | "permanent";

type SuspendUserModalProps = {
  open: boolean;
  userName: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    suspend_type: SuspendType;
    suspend_days?: number;
    suspend_until?: string;
  }) => void;
};

const DURATION_OPTIONS = [3, 7, 30] as const;

export function SuspendUserModal({
  open,
  userName,
  isSubmitting = false,
  onClose,
  onConfirm,
}: SuspendUserModalProps) {
  const [suspendType, setSuspendType] = useState<SuspendType>("duration");
  const [suspendDays, setSuspendDays] = useState<number>(3);
  const [suspendUntil, setSuspendUntil] = useState("");

  if (!open) return null;

  const handleConfirm = () => {
    if (suspendType === "date" && !suspendUntil) return;

    onConfirm({
      suspend_type: suspendType,
      suspend_days: suspendType === "duration" ? suspendDays : undefined,
      suspend_until: suspendType === "date" ? suspendUntil : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-dash-dark">Suspend user</h3>
            <p className="text-sm text-gray-500 mt-1">
              Choose how long to suspend <strong>{userName}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {DURATION_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => {
                setSuspendType("duration");
                setSuspendDays(days);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                suspendType === "duration" && suspendDays === days
                  ? "bg-dash-dark text-white border-dash-dark"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {days} days
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSuspendType("permanent")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              suspendType === "permanent"
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            Permanent
          </button>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-bold text-gray-500 mb-2">Custom end date</label>
          <input
            type="date"
            value={suspendUntil}
            onChange={(e) => {
              setSuspendType("date");
              setSuspendUntil(e.target.value);
            }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || (suspendType === "date" && !suspendUntil)}
            className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Suspend user"}
          </button>
        </div>
      </div>
    </div>
  );
}
