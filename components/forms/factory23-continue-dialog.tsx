"use client";

import { useEffect } from "react";

type Factory23ContinueDialogProps = {
  open: boolean;
  name: string;
  email: string;
  organization: string;
  loading: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
};

function initials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function Factory23ContinueDialog({
  open,
  name,
  email,
  organization,
  loading,
  error,
  onCancel,
  onConfirm,
}: Factory23ContinueDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onCancel, open]);

  if (!open) return null;

  const displayName = name.trim() || email;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close Factory23 confirmation"
        className="absolute inset-0 bg-[#09232d]/50"
        onClick={() => {
          if (!loading) onCancel();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="factory23-continue-title"
        className="relative w-full max-w-[420px] rounded-3xl bg-white p-6 shadow-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6FA8A6]">Factory23</p>
        <h2 id="factory23-continue-title" className="mt-2 text-xl font-semibold text-[#143028]">
          Continue with Factory23
        </h2>
        <p className="mt-2 text-sm leading-5 text-[#616263]">
          Sales Engine will use this Factory23 account to create your access. Review the record before you continue.
        </p>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#143028]/10 bg-[#f7f8f4] px-4 py-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#143028] text-sm font-semibold text-[#d6f25c]">
            {initials(name, email)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[#143028]">{displayName}</span>
            <span className="block truncate text-xs text-[#616263]">{email}</span>
          </span>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-[#143028]">Sales Engine will use</p>
          <ul className="mt-2 space-y-2 text-sm text-[#34373C]">
            <li className="flex justify-between gap-4 border-b border-[#143028]/10 pb-2">
              <span className="text-[#616263]">Name</span>
              <span className="truncate font-medium">{displayName}</span>
            </li>
            <li className="flex justify-between gap-4 border-b border-[#143028]/10 pb-2">
              <span className="text-[#616263]">Email</span>
              <span className="truncate font-medium">{email}</span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-[#616263]">Workspace</span>
              <span className="truncate font-medium">{organization}</span>
            </li>
          </ul>
          <p className="mt-3 text-xs leading-5 text-[#616263]">
            You will be added to {organization} as a member. Your Factory23 password stays on Factory23.
          </p>
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-[46px] flex-1 rounded-full border border-[#143028]/15 text-sm font-semibold text-[#143028] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="h-[46px] flex-1 rounded-full bg-[#143028] text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Continuing…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
