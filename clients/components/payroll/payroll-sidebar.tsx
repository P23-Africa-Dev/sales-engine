"use client";

import CustomizeIcon from "@/assets/images/customize-icon.png";
import MessageIcon from "@/assets/images/message-icon.png";
import Image from "next/image";
import { TinyButton } from "../ui/tiny-button";
import type { PayrollAgent } from "./payroll-list";
import { useState, useEffect } from "react";
import { useApprovePayrollAgent } from "@/hooks/use-payroll";
import type { ApprovalAction } from "@/lib/api/payroll";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export type PayrollAgentProfileView = PayrollAgent & {
  email: string;
  salaryType: string;
  dailyPay: string;
  attendanceDays: number;
  attendanceAffectsPay: boolean;
  currency: string;
  workDays?: number;
  workHours?: number;
  commissionEnabled?: boolean;
};

interface PayrollSidebarProps {
  agent: PayrollAgentProfileView | null;
  onEditPayroll?: () => void;
  companyId?: number | string;
  onApprovalSuccess?: () => void;
}

function mailTo(email: string) {
  return `mailto:${encodeURIComponent(email)}`;
}

function ApprovalModal({
  agent,
  companyId,
  onClose,
  onSuccess,
}: {
  agent: PayrollAgentProfileView;
  companyId?: number | string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedAction, setSelectedAction] = useState<ApprovalAction | null>(null);
  const [reason, setReason] = useState("");
  const isPending = agent.status === "Pending";
  const isApproved = agent.status === "Approved";

  const approveMutation = useApprovePayrollAgent(agent.id, {
    onSuccess: () => {
      toast.success(
        selectedAction === "approve" ? "Payroll approved successfully." : "Approval revoked."
      );
      onSuccess();
      onClose();
    },
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = () => {
    if (!selectedAction || !companyId) return;
    approveMutation.mutate({ company_id: companyId, action: selectedAction, reason: reason.trim() || undefined });
  };

  const canApprove = !isApproved;
  const canRevoke = isApproved;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ backgroundColor: "rgba(9,35,45,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Header band */}
        <div className="bg-dash-dark px-8 pt-8 pb-6 relative">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-white/20 shrink-0">
              <Image src={agent.avatar} width={56} height={56} className="w-full h-full object-cover" alt={agent.name} />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-[15px] truncate">{agent.name}</p>
              <p className="text-white/50 text-[11px] mt-0.5">{agent.role}</p>
            </div>
            <div className="ml-auto shrink-0">
              <span
                className={`text-[10px] font-semibold px-3 py-1 rounded-full ${isPending
                  ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40"
                  : "bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/40"
                  }`}
              >
                {agent.status}
              </span>
            </div>
          </div>

          <p className="text-white/40 text-[11px] mt-5 mb-0">
            Select an action and optionally provide a reason.
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-5">
          {/* Action selector */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!canApprove}
              onClick={() => setSelectedAction("approve")}
              className={`relative flex flex-col items-center gap-2 rounded-2xl p-4 border-2 transition-all ${!canApprove
                ? "opacity-30 cursor-not-allowed border-gray-100 bg-gray-50"
                : selectedAction === "approve"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-100 bg-gray-50 hover:border-emerald-200 hover:bg-emerald-50/40"
                }`}
            >
              <CheckCircle2
                size={28}
                className={selectedAction === "approve" ? "text-emerald-500" : "text-gray-300"}
              />
              <span className={`text-[12px] font-semibold ${selectedAction === "approve" ? "text-emerald-600" : "text-gray-400"}`}>
                Approve
              </span>
              {selectedAction === "approve" && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>

            <button
              type="button"
              disabled={!canRevoke}
              onClick={() => setSelectedAction("revoke")}
              className={`relative flex flex-col items-center gap-2 rounded-2xl p-4 border-2 transition-all ${!canRevoke
                ? "opacity-30 cursor-not-allowed border-gray-100 bg-gray-50"
                : selectedAction === "revoke"
                  ? "border-rose-500 bg-rose-50"
                  : "border-gray-100 bg-gray-50 hover:border-rose-200 hover:bg-rose-50/40"
                }`}
            >
              <XCircle
                size={28}
                className={selectedAction === "revoke" ? "text-rose-500" : "text-gray-300"}
              />
              <span className={`text-[12px] font-semibold ${selectedAction === "revoke" ? "text-rose-600" : "text-gray-400"}`}>
                Revoke
              </span>
              {selectedAction === "revoke" && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Reason <span className="font-normal text-gray-300 normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add a note about this decision..."
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[13px] text-dash-dark placeholder-gray-300 outline-none focus:ring-2 focus:ring-dash-dark/10 focus:border-dash-dark/20 transition-all"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedAction || approveMutation.isPending}
              onClick={handleSubmit}
              className={`flex-1 py-3 rounded-xl text-[13px] font-semibold text-white transition-all flex items-center justify-center gap-2 ${!selectedAction
                ? "bg-gray-200 cursor-not-allowed"
                : selectedAction === "approve"
                  ? "bg-emerald-500 hover:bg-emerald-600"
                  : "bg-rose-500 hover:bg-rose-600"
                }`}
            >
              {approveMutation.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : null}
              {approveMutation.isPending
                ? "Submitting..."
                : selectedAction === "approve"
                  ? "Confirm Approval"
                  : selectedAction === "revoke"
                    ? "Confirm Revoke"
                    : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PayrollSidebar({ agent, onEditPayroll, companyId, onApprovalSuccess }: PayrollSidebarProps) {
  const [approvalOpen, setApprovalOpen] = useState(false);

  if (!agent) return null;

  const baseSalary = agent.baseSalary;
  const dailyPay = agent.dailyPay;
  const workDays = agent.workDays ? `${agent.workDays}` : "—";
  const workHours = agent.workHours ? `${agent.workHours} hrs` : "—";
  const salaryType = agent.salaryType ? agent.salaryType.charAt(0).toUpperCase() + agent.salaryType.slice(1) : "—";
  const currency = agent.currency || "—";
  const currentEarnings = agent.netPay;
  const isApproved = agent.status === "Approved";

  return (
    <>
      <div className="payroll-cutout w-full text-dash-dark h-auto lg:h-140 overflow-y-auto border-dash-dark/5 bg-white p-8 sm:p-[55px_42px_46.52px] relative rounded-2xl shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]">
        <div className="absolute right-4 sm:right-11 top-3.25">
          <TinyButton>View Payroll</TinyButton>
        </div>

        {/* Info grid + photo side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,280px)_160px] gap-6 sm:gap-0">
          {/* Detail grid */}
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
                Salary Type
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {salaryType}
              </p>
            </div>
            <div>
              <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
                Base Salary
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {baseSalary}
              </p>
            </div>
            <div>
              <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
                Currency
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {currency}
              </p>
            </div>
            <div>
              <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
                Daily Pay
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {dailyPay}
              </p>
            </div>
            <div>
              <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
                Current Earnings
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {currentEarnings}
              </p>
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#34373C] mb-1">
                Attendance Accumulation
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {agent.attendanceDays} day{agent.attendanceDays === 1 ? "" : "s"}
              </p>
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#34373C] mb-1">
                Attendance Pay
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {agent.attendanceAffectsPay ? "Yes" : "No"}
              </p>
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#34373C] mb-1">
                Work Days
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {workDays}
              </p>
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#34373C] mb-1">
                Work Hours
              </p>
              <p className="text-[10px] leading-2.5 font-light text-[#616263]">
                {workHours}
              </p>
            </div>
          </div>

          {/* Photo card */}
          <div className="shrink-0 hidden sm:flex flex-col items-center">
            <div className="w-39.75 h-32.5 rounded-[20px] overflow-hidden shadow-lg bg-[#C9A84C]">
              <Image
                src={agent.avatar}
                width={116}
                height={144}
                className="w-full h-full object-cover"
                alt={agent.name}
              />
            </div>
            <div className="flex items-end gap-3 mt-0">
              <div>
                <p className="text-[11px] font-bold text-[#0B1215] mt-2 text-center">
                  {agent.name}
                </p>
                <p className="text-[10px] font-light text-dash-dark text-left">
                  {agent.lga} LGA
                </p>
              </div>
              <div className="px-[4.5px] rounded-full py-0.5 text-[6px] h-fit font-medium bg-[#2F6C0E] text-white">
                {agent.status}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-1.75 mt-6.5">
              <button
                type="button"
                onClick={() => {
                  window.location.href = mailTo(agent.email);
                }}
                className="w-[32.48px] h-[32.48px] rounded-full bg-[#EAEAEA] flex items-center justify-center cursor-pointer"
              >
                <Image src={MessageIcon} alt="Message" width={14} height={14} />
              </button>
              {onEditPayroll ? (
                <button
                  type="button"
                  onClick={onEditPayroll}
                  className="w-[32.48px] h-[32.48px] rounded-full bg-[#EAEAEA] flex items-center justify-center cursor-pointer"
                >
                  <Image
                    src={CustomizeIcon}
                    alt="Customize"
                    width={14}
                    height={14}
                  />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Approval action button */}
        {companyId && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setApprovalOpen(true)}
              className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-[13px] font-semibold transition-all ${isApproved
                ? "bg-dash-dark text-white hover:opacity-90"
                : "bg-emerald-500 text-white hover:bg-emerald-600"
                }`}
            >
              <ShieldCheck size={16} />
              {isApproved ? "Manage Approval" : "Approve Payroll"}
            </button>
          </div>
        )}
      </div>

      {approvalOpen && (
        <ApprovalModal
          agent={agent}
          companyId={companyId}
          onClose={() => setApprovalOpen(false)}
          onSuccess={() => onApprovalSuccess?.()}
        />
      )}
    </>
  );
}
