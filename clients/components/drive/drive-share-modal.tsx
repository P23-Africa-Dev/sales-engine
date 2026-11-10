"use client";

import { useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useInternalUsersPaginated } from "@/hooks/use-internal-users";
import type { DriveFile } from "@/lib/api/drive";

type DriveShareModalProps = {
  file: DriveFile;
  companyId: number | string;
  onClose: () => void;
  onSave: (shareWithAll: boolean, userIds: number[]) => Promise<void>;
  isSaving: boolean;
};

export function DriveShareModal({ file, companyId, onClose, onSave, isSaving }: DriveShareModalProps) {
  const initialAll = file.grants.some((g) => g.grantee_type === "all");
  const initialUserIds = file.grants
    .filter((g) => g.grantee_type === "user" && g.user_id != null)
    .map((g) => g.user_id as number);

  const [shareWithAll, setShareWithAll] = useState(initialAll);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>(initialUserIds);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useInternalUsersPaginated({
    company_id: companyId,
    per_page: 100,
    page: 1,
    search: search || undefined,
  });

  const users = useMemo(() => data?.items ?? [], [data]);

  function toggleUser(userId: number) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-[16px] font-bold text-dash-dark">Share file</h3>
            <p className="text-[12px] text-gray-400 truncate max-w-[240px]">{file.original_name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <label className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100 cursor-pointer">
            <input
              type="checkbox"
              checked={shareWithAll}
              onChange={(e) => setShareWithAll(e.target.checked)}
              className="rounded"
            />
            <div>
              <p className="text-[13px] font-bold text-dash-dark">All company members</p>
              <p className="text-[11px] text-gray-400">Everyone in this workspace can access this file</p>
            </div>
          </label>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              Specific people
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team members..."
              className="w-full mb-3 rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none"
            />
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-gray-300" size={20} />
              </div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {users.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(Number(user.id))}
                      onChange={() => toggleUser(Number(user.id))}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-dash-dark truncate">{user.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void onSave(shareWithAll, selectedUserIds)}
            className="flex-1 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            Save sharing
          </button>
        </div>
      </div>
    </div>
  );
}
