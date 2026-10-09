"use client";

import CalendarIcon from "@/assets/images/calendar-icon.png";
import CardValidationIcon from "@/assets/images/card-validation-icon.png";
import FileExportIcon from "@/assets/images/file-export-icon.png";
import { PaymentOverview } from "@/components/payroll/payment-overview";
import {
  mapPayrollAgentToUi,
  mapPayrollProfileToUi,
  PayrollList,
} from "@/components/payroll/payroll-list";
import { PayrollSidebar } from "@/components/payroll/payroll-sidebar";
import { SetPayrollModal } from "@/components/payroll/set-payroll-modal";
import { EditAgentPayrollModal } from "@/components/payroll/edit-agent-payroll-modal";
import { usePayroll, usePayrollAgents, usePayrollAgentProfile, usePayrollExport, usePayrollOverview } from "@/hooks/use-payroll";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { formatPayrollDateLabel, nextPayrollStatusFilter, type PayrollStatusFilter } from "@/lib/payroll/page-controls";
import { Search, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export function PayrollView() {
  const router = useRouter();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [isAgentEditOpen, setIsAgentEditOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PayrollStatusFilter>("all");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const isAgent = role === "agent";

  const { data: overview } = usePayrollOverview({ company_id: companyId ?? undefined, date: selectedDate });
  const { data: existingPayroll } = usePayroll(companyId);
  const exportMutation = usePayrollExport({
    onSuccess: () => {
      toast.success("Payroll export downloaded.");
    },
    onError: (error) => {
      toast.error(error.message || "Payroll export failed.");
    },
  });
  const { data: agentsData, isLoading: isUsersLoading } = usePayrollAgents({
    company_id: companyId ?? undefined,
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    date: selectedDate,
    per_page: 100,
  });

  const payrollAgents = useMemo(
    () => (agentsData?.items ?? []).map((agent) => mapPayrollAgentToUi(agent)),
    [agentsData]
  );

  useEffect(() => {
    if (!payrollAgents.length) {
      if (selectedAgentId !== null) {
        const timeout = setTimeout(() => setSelectedAgentId(null), 0);
        return () => clearTimeout(timeout);
      }
      return;
    }

    if (selectedAgentId && payrollAgents.some((agent) => agent.id === selectedAgentId)) {
      return;
    }

    const timeout = setTimeout(() => setSelectedAgentId(payrollAgents[0].id), 0);
    return () => clearTimeout(timeout);
  }, [payrollAgents, selectedAgentId]);

  const selectedAgentSummary = selectedAgentId
    ? (payrollAgents.find((a) => a.id === selectedAgentId) ?? null)
    : null;

  const selectedAgentProfileQuery = usePayrollAgentProfile(selectedAgentId ?? undefined, {
    company_id: companyId ?? undefined,
    date: selectedDate,
  });

  const selectedAgent = selectedAgentProfileQuery.data
    ? mapPayrollProfileToUi(selectedAgentProfileQuery.data)
    : selectedAgentSummary;

  const handleToggleFilter = () => {
    setStatusFilter((current) => nextPayrollStatusFilter(current));
  };

  const handleExport = (format: "csv" | "xlsx") => {
    if (!companyId || isAgent) {
      return;
    }

    exportMutation.mutate({
      company_id: companyId,
      search: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      date: selectedDate,
      format,
    });
  };

  if (!companyId) {
    return (
      <div className="h-full p-8">
        <div className="max-w-3xl mx-auto bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-500">
          No active company context was found for this account.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mt-1">
        <div className="relative w-full max-w-114">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search for agents"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-dash-teal/20 transition-all shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]"
          />
        </div>

        <div className="flex items-center gap-4.25 flex-wrap">
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
            className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] text-gray-500 transition-all cursor-pointer bg-white"
          >
            <Image src={CalendarIcon} alt="Calendar Icon" width={13} height={13} />
            {formatPayrollDateLabel(selectedDate)}
            <input
              ref={dateInputRef}
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="sr-only"
            />
          </button>
          {!isAgent && (
            <div className="flex items-center rounded-[10px] border border-gray-200 overflow-hidden text-[10px] text-gray-500 transition-all bg-white">
              <button
                type="button"
                onClick={() => handleExport("csv")}
                className="flex items-center gap-2 px-2.5 py-[8.5px] hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                disabled={exportMutation.isPending}
              >
                <Image
                  src={FileExportIcon}
                  alt="Export Icon"
                  width={13}
                  height={13}
                  style={{ filter: "invert(40%) sepia(0%) grayscale(100%)" }}
                />
                CSV
              </button>
              <button
                type="button"
                onClick={() => handleExport("xlsx")}
                className="border-l border-gray-200 px-2.5 py-[8.5px] hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                disabled={exportMutation.isPending}
              >
                Excel
              </button>
            </div>
          )}
          <button onClick={handleToggleFilter} className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] text-gray-500 transition-all cursor-pointer bg-white">
            <SlidersHorizontal size={13} />
            Filter: {statusFilter}
          </button>
          {!isAgent && (
            <button
              onClick={() => setIsPayrollModalOpen(true)}
              className="flex items-center gap-2.5 px-2.5 py-[8.5px] font-medium bg-dash-dark text-white rounded-[10px] text-[10px] hover:opacity-90 transition-all cursor-pointer"
            >
              {existingPayroll ? "Edit Payroll" : "Set Payroll"}
              <Image
                src={CardValidationIcon}
                alt="Set Payroll Icon"
                width={13}
                height={13}
              />
            </button>
          )}
        </div>
      </div>
      {/* Main Content */}
      <div className="py-6 space-y-6">
        <PaymentOverview overview={overview ?? null} currency={overview?.currency ?? existingPayroll?.currency ?? "USD"} />

        {/* Payroll List + Sidebar */}
        <div className="flex flex-col xl:flex-row gap-6">
          <div className="flex-1 min-w-0">
            {isUsersLoading ? (
              <div className="bg-white rounded-[30px] px-6 py-8 text-[13px] text-gray-400 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]">
                Loading payroll agents...
              </div>
            ) : (
              <PayrollList
                users={payrollAgents}
                selectedId={selectedAgentId}
                onSelect={setSelectedAgentId}
                onShowViewAll={() => router.push("/payroll/payroll-list")}
              />
            )}
          </div>

          <div className="w-full xl:w-85 xl:shrink-0 xl:min-w-131.25">
            <div className="drop-shadow-[0px_1px_3px_#0000004D,0px_4px_8px_#00000026]">
              <PayrollSidebar
                agent={selectedAgent}
                onEditPayroll={() => setIsAgentEditOpen(true)}
                companyId={companyId ?? undefined}
                onApprovalSuccess={() => {
                  selectedAgentProfileQuery.refetch();
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Set Payroll Modal */}
      <SetPayrollModal
        isOpen={isPayrollModalOpen}
        onClose={() => setIsPayrollModalOpen(false)}
        existingPayroll={existingPayroll}
      />

      <EditAgentPayrollModal
        isOpen={isAgentEditOpen}
        onClose={() => setIsAgentEditOpen(false)}
        agent={selectedAgent}
        companyId={companyId}
      />
    </div>
  );
}
