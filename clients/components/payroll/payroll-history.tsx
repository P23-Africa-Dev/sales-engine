"use client";

import { StatusBadge } from "../ui/status-badge";
import type { PayrollHistoryEntry } from "@/lib/api/payroll";
import { formatPayrollMoney, PAYROLL_DEFAULT_CURRENCY } from "@/lib/payroll/currency";

interface PayrollHistoryProps {
  entries?: PayrollHistoryEntry[] | null;
  currency?: string;
}

export function PayrollHistory({ entries = [], currency = PAYROLL_DEFAULT_CURRENCY }: PayrollHistoryProps) {
  const historyData = entries ?? [];

  return (
    <div className="mt-6">
      <h3 className="text-[16px] font-bold text-[#0B1215] mb-4">
        Payroll History
      </h3>

      <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
        {historyData.length === 0 ? (
          <div className="rounded-[30px] sm:rounded-full px-5 sm:px-7.25 py-4 border-t border-[#CDCDCD] bg-[#F8F9FA] text-[12px] text-gray-400">
            No payroll history available.
          </div>
        ) : (
          historyData.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-[30px] sm:rounded-full px-5 sm:px-7.25 py-4 border-t border-[#CDCDCD] ${entry.status === "Pending" ? "bg-[#FFFFEF]" : "bg-[#E3F4FB]"
                }`}
            >
              <div className="flex flex-wrap gap-4.5">
                <div>
                  <p className="text-[14px] font-bold text-[#7A7A7A] mb-1">
                    Month
                  </p>
                  <p className="text-[10px] font-light text-[#616263]">
                    {entry.month}
                  </p>
                </div>
                <div>
                  <p className="text-[14px] font-bold text-[#7A7A7A] mb-1">
                    Base Salary
                  </p>
                  <p className="text-[10px] font-light text-[#616263]">
                    {formatPayrollMoney(entry.base_salary, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[14px] font-bold text-[#7A7A7A] mb-1">
                    Net Pay
                  </p>
                  <p className="text-[10px] font-light text-[#616263]">
                    {formatPayrollMoney(entry.net_pay, currency)}
                  </p>
                </div>
                <div className="flex flex-1 items-start justify-between">
                  <div>
                    <p className="text-[14px] font-bold text-[#7A7A7A] mb-1">
                      Due Date
                    </p>
                    <p className="text-[10px] font-light text-[#616263]">
                      {entry.due_date ?? "—"}
                    </p>
                  </div>
                  <StatusBadge className="self-center" status={entry.status} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
