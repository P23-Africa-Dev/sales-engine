"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import { useUpdateAgentPayroll } from "@/hooks/use-payroll";
import { useSupportedCurrencies } from "@/hooks/use-currencies";
import type { PayrollAgentProfileView } from "@/components/payroll/payroll-sidebar";
import { toast } from "sonner";
import type { ApiRequestError } from "@/lib/api/onboarding";
import { PAYROLL_DEFAULT_CURRENCY } from "@/lib/payroll/currency";

interface EditAgentPayrollModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: PayrollAgentProfileView | null;
    companyId: number | string | null | undefined;
}

export function EditAgentPayrollModal({ isOpen, onClose, agent, companyId }: EditAgentPayrollModalProps) {
    const [salaryType, setSalaryType] = useState("monthly");
    const [baseSalary, setBaseSalary] = useState("");
    const [currencyCode, setCurrencyCode] = useState(PAYROLL_DEFAULT_CURRENCY);
    const [attendanceAffectsPay, setAttendanceAffectsPay] = useState(true);
    const [workDaysOverride, setWorkDaysOverride] = useState("");
    const [syncedAgentId, setSyncedAgentId] = useState<string | null>(null);
    const mutation = useUpdateAgentPayroll(agent ? Number(agent.id) : undefined);
    const { data: currenciesData, isLoading: loadingCurrencies } = useSupportedCurrencies();

    const currencyOptions = currenciesData?.currencies;
    const currencyOptionList = currencyOptions ?? [];
    const supportedCurrencyCodes = useMemo(
        () => new Set((currencyOptions ?? []).map((item) => item.code)),
        [currencyOptions]
    );
    const fallbackCurrencyCode = (currenciesData?.default_currency ?? PAYROLL_DEFAULT_CURRENCY).toUpperCase();
    const normalizedCurrencyCode = currencyCode.trim().toUpperCase();
    const selectedCurrencyCode = useMemo(
        () => (normalizedCurrencyCode && (supportedCurrencyCodes.size === 0 || supportedCurrencyCodes.has(normalizedCurrencyCode))
            ? normalizedCurrencyCode
            : fallbackCurrencyCode),
        [fallbackCurrencyCode, normalizedCurrencyCode, supportedCurrencyCodes]
    );

    if (agent && agent.id !== syncedAgentId) {
        setSyncedAgentId(agent.id);
        setSalaryType(agent.salaryType.toLowerCase());
        setBaseSalary(String(Number(agent.baseSalary.replace(/[^0-9.]/g, ""))));
        setCurrencyCode((agent.currency ?? PAYROLL_DEFAULT_CURRENCY).toUpperCase());
        setAttendanceAffectsPay(agent.attendanceAffectsPay);
        setWorkDaysOverride(String(agent.workDays || ""));
    }

    if (!isOpen || !agent) return null;

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const numericBaseSalary = Number(baseSalary.replace(/[^0-9.]/g, ""));
        if (!companyId) {
            toast.error("No active company found.");
            return;
        }

        const normalizedCurrency = selectedCurrencyCode;
        const currencyIsSupported = supportedCurrencyCodes.size > 0
            ? supportedCurrencyCodes.has(normalizedCurrency)
            : /^[A-Z]{3}$/.test(normalizedCurrency);

        if (!currencyIsSupported) {
            toast.error("Select a supported currency.");
            return;
        }

        mutation.mutate(
            {
                company_id: companyId,
                base_salary: numericBaseSalary,
                salary_type: salaryType as "daily" | "monthly" | "weekly",
                currency_code: selectedCurrencyCode,
                attendance_affects_pay: attendanceAffectsPay,
                work_days_override: workDaysOverride.trim() ? Number(workDaysOverride) : null,
            },
            {
                onSuccess: () => {
                    toast.success("Agent payroll updated successfully.");
                    onClose();
                },
                onError: (error) => {
                    const apiErr = error as ApiRequestError;
                    toast.error(apiErr.message ?? "Unable to update payroll.");
                },
            }
        );
    };

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-white/40" onClick={onClose} />
            <div className="absolute right-12 bottom-3.25 bg-white rounded-[28px] w-full max-w-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden">
                <div className="bg-transparent h-18 relative overflow-hidden flex items-center px-7">
                    <div className="absolute top-0 right-0 w-[50%] h-full pointer-events-none">
                        <svg viewBox="0 0 200 72" fill="none" className="w-full h-full" preserveAspectRatio="none">
                            <path d="M0 0 C60 24, 20 48, 190 72 L200 92 L200 0 Z" fill="#09232D" />
                        </svg>
                    </div>
                    <h2 className="text-[18px] font-bold text-dash-dark relative z-10">Edit Payroll</h2>
                    <button onClick={onClose} className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-7 pb-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                    <div className="space-y-4 mb-5">
                        <SectionDivider label="Salary" />
                        <FormRow label="Salary Type">
                            <InlineSelect
                                value={salaryType}
                                onChange={(v) => setSalaryType(v)}
                                options={[{ value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }]}
                                className="col-span-2"
                            />
                        </FormRow>
                        <FormRow label="Currency">
                            <InlineSelect 
                                value={selectedCurrencyCode} 
                                onChange={(v) => setCurrencyCode(v)} 
                                options={currencyOptionList.length === 0 ? [{ value: PAYROLL_DEFAULT_CURRENCY, label: loadingCurrencies ? "Loading currencies..." : "No currencies available" }] : currencyOptionList.map((currencyOption) => ({ value: currencyOption.code, label: currencyOption.label }))}
                                className="col-span-2"
                            />
                        </FormRow>
                        <FormRow label="Base Salary">
                            <InlineInput value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="col-span-2" />
                        </FormRow>
                    </div>

                    <div className="space-y-4 mb-5">
                        <SectionDivider label="Attendance" />
                        <FormRow label="Attendance Affect Pay">
                            <Toggle enabled={attendanceAffectsPay} onToggle={() => setAttendanceAffectsPay((value) => !value)} />
                        </FormRow>
                        <FormRow label="Work Days Override">
                            <InlineInput value={workDaysOverride} onChange={(e) => setWorkDaysOverride(e.target.value)} className="col-span-2" />
                        </FormRow>
                    </div>

                    <button type="submit" disabled={mutation.isPending} className="w-full h-11 bg-[#0B1215] text-white rounded-full text-[13px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                        {mutation.isPending ? "Saving…" : "Done"}
                    </button>
                </form>
            </div>
        </div>
    );
}
