"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TinyButton } from "../ui/tiny-button";
import { StatusBadge } from "../ui/status-badge";
import type { InternalUserListItem } from "@/lib/api/internal-users";
import { resolveAvatarSrc } from "@/lib/avatar";
export { mapPayrollAgentToUi, mapPayrollProfileToUi } from "@/lib/api/payroll";

export interface PayrollAgent {
  id: string;
  name: string;
  address: string;
  lga: string;
  avatar: string;
  baseSalary: string;
  netPay: string;
  role: string;
  status: "Pending" | "Approved" | "Revoked";
}

export function mapInternalUserToPayrollAgent(user: InternalUserListItem): PayrollAgent {
  const active = user.onboarding_status === "active" || user.is_active === true;

  return {
    id: String(user.id),
    name: user.name,
    address: user.email,
    lga: user.assigned_zone ?? "Unassigned",
    avatar: resolveAvatarSrc(user.avatar_url),
    baseSalary: "--",
    netPay: "--",
    role: user.internal_role ?? user.role,
    status: active ? "Approved" : "Pending",
  };
}

const PAGE_SIZE = 4;

interface PayrollListProps {
  users: PayrollAgent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showViewAll?: boolean;
  onShowViewAll?: () => void;
}

export function PayrollList({
  users,
  selectedId,
  onSelect,
  showViewAll = false,
  onShowViewAll,
}: PayrollListProps) {
  const [page, setPage] = useState(1);

  const source = showViewAll ? users : users.slice(0, 3);
  const totalPages = Math.max(1, Math.ceil(source.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = showViewAll
    ? source.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : source;

  return (
    <div className="bg-white rounded-[30px] pt-5.75 px-4 sm:px-10 pb-6 flex-1 min-w-0 flex flex-col h-auto lg:h-140 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]">
      {/* Header */}
      {!showViewAll && (
        <div className="flex justify-end mb-7 shrink-0">
          <TinyButton onClick={onShowViewAll}>All Payroll List</TinyButton>
        </div>
      )}

      {/* Scrollable rows */}
      <div className="overflow-visible lg:flex-1 lg:min-h-0 lg:overflow-y-auto pr-1 space-y-3.5">
        {paginated.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-gray-200 bg-[#F8F9FA] p-6 text-center text-[12px] text-gray-400">
            No payroll agents found.
          </div>
        ) : null}
        {paginated.map((agent) => {
          const isSelected = selectedId === agent.id;
          return (
            <div
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={`flex border-[#E8E5E5] border-[0.8px] items-center gap-3 sm:gap-5 rounded-[30px] pr-4 sm:pr-5 overflow-hidden cursor-pointer ${isSelected ? "bg-dash-dark" : "bg-[#F8F9FA]"
                }`}
            >
              <div className={`w-5 self-stretch shrink-0 rounded-l-[30px] ${isSelected ? "" : "bg-[#83C4F8]"}`} />
              <div className="w-14.75 h-14.75 mt-3.5 mb-3 sm:w-14 sm:h-14 rounded-full overflow-hidden shrink-0">
                <Image src={agent.avatar} width={56} height={56} className="w-full h-full object-cover" alt={agent.name} />
              </div>
              <div className="min-w-0 max-w-35 flex-1 sm:flex-none sm:w-40 lg:w-44 py-3">
                <p className={`text-[13px] sm:text-[14px] font-bold truncate ${isSelected ? "text-white" : "text-[#0B1215]"}`}>{agent.name}</p>
                <p className={`text-[9px] sm:text-[10px] mt-0.5 ${isSelected ? "text-white" : "text-[#616263]"}`}>{agent.address}</p>
              </div>
              <div className="hidden sm:block flex-1 min-w-0 py-3 self-baseline">
                <p className={`text-[14px] font-bold ${isSelected ? "text-white" : "text-[#34373C]"}`}>Base Salary</p>
                <p className={`text-[10px] font-light ${isSelected ? "text-[#E8E8E8]" : "text-[#616263]"}`}>{agent.baseSalary}</p>
              </div>
              <div className="hidden md:block flex-1 min-w-0 py-3 self-baseline">
                <p className={`text-[14px] font-bold ${isSelected ? "text-white" : "text-[#34373C]"}`}>Net Pay</p>
                <p className={`text-[10px] font-light ${isSelected ? "text-[#E8E8E8]" : "text-[#616263]"}`}>{agent.netPay}</p>
              </div>
              <div className="hidden lg:block flex-1 min-w-0 py-3 self-baseline">
                <p className={`text-[14px] font-bold ${isSelected ? "text-white" : "text-[#34373C]"}`}>Role</p>
                <p className={`text-[10px] font-light ${isSelected ? "text-[#E8E8E8]" : "text-[#616263]"}`}>{agent.role}</p>
              </div>
              <div className="shrink-0 py-3 self-baseline">
                <StatusBadge status={agent.status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination — only in full list view */}
      {showViewAll && (
        <div className="shrink-0 flex items-center justify-between pt-5 mt-4 border-t border-gray-100">
          <p className="text-[12px] text-gray-400">
            {source.length === 0
              ? "Showing 0 of 0"
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, source.length)} of ${source.length}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-full text-[13px] font-bold transition-all ${p === currentPage ? "bg-dash-dark text-white shadow-sm" : "text-gray-400 hover:bg-gray-100"}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
