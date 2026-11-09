"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Toggle } from "@/components/ui/toggle";
import { SettingsSectionCard } from "@/components/settings/settings-section-card";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { useCreatePayroll, usePayroll, useUpdatePayroll } from "@/hooks/use-payroll";
import { useSupportedCurrencies } from "@/hooks/use-currencies";
import { PAYROLL_DEFAULT_CURRENCY } from "@/lib/payroll/currency";

export function PayrollSettingsPanel() {
  const { companyId, basePath, sections } = useSettingsAccess();
  const canEdit = sections.find((s) => s.id === "payroll")?.canEdit ?? false;

  const { data: existingPayroll, isLoading } = usePayroll(companyId);
  const createMutation = useCreatePayroll();
  const updateMutation = useUpdatePayroll(existingPayroll?.id);
  const { data: currenciesData } = useSupportedCurrencies();

  const [salaryType, setSalaryType] = useState<"daily" | "monthly" | "weekly">("monthly");
  const [currency, setCurrency] = useState(PAYROLL_DEFAULT_CURRENCY);
  const [baseSalary, setBaseSalary] = useState("30000");
  const [workDays, setWorkDays] = useState("22");
  const [workHours, setWorkHours] = useState("8");
  const [attendanceAffectPay, setAttendanceAffectPay] = useState(true);
  const [commissionEnabled, setCommissionEnabled] = useState(false);

  useEffect(() => {
    if (!existingPayroll) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate payroll form from fetched settings
    setSalaryType(existingPayroll.salary_type);
    setCurrency(existingPayroll.currency);
    setBaseSalary(String(existingPayroll.base_salary));
    setWorkDays(String(existingPayroll.work_days));
    setWorkHours(String(existingPayroll.work_hours));
    setAttendanceAffectPay(existingPayroll.attendance_affects_pay);
    setCommissionEnabled(existingPayroll.commission_enabled);
  }, [existingPayroll]);

  function handleSave() {
    if (!companyId || !canEdit) return;

    const payload = {
      company_id: companyId,
      salary_type: salaryType,
      base_salary: Number(baseSalary),
      currency: currency.toUpperCase(),
      work_days: Number(workDays),
      work_hours: Number(workHours),
      attendance_affects_pay: attendanceAffectPay,
      commission_enabled: commissionEnabled,
    };

    const mutation = existingPayroll ? updateMutation : createMutation;
    mutation.mutate(payload, {
      onSuccess: () => toast.success("Payroll defaults saved."),
      onError: (err: Error) => toast.error(err.message || "Failed to save payroll settings."),
    });
  }

  return (
    <SettingsSectionCard
      title="Payroll"
      description="Company-wide payroll defaults"
      scope="organization"
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          {!canEdit && (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              You have read only access to payroll defaults.
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Salary type
              </label>
              <select
                value={salaryType}
                disabled={!canEdit}
                onChange={(e) => setSalaryType(e.target.value as "daily" | "monthly" | "weekly")}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] disabled:opacity-60"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Currency
              </label>
              <select
                value={currency}
                disabled={!canEdit}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] disabled:opacity-60"
              >
                {(currenciesData?.currencies ?? [{ code: currency, name: currency }]).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Base salary
              </label>
              <input
                type="number"
                value={baseSalary}
                disabled={!canEdit}
                onChange={(e) => setBaseSalary(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Work days / month
              </label>
              <input
                type="number"
                value={workDays}
                disabled={!canEdit}
                onChange={(e) => setWorkDays(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Work hours / day
              </label>
              <input
                type="number"
                value={workHours}
                disabled={!canEdit}
                onChange={(e) => setWorkHours(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] disabled:opacity-60"
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-[13px] text-gray-700">Attendance affects pay</span>
            <Toggle
              enabled={attendanceAffectPay}
              onToggle={() => canEdit && setAttendanceAffectPay((v) => !v)}
            />
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[13px] text-gray-700">Commission enabled</span>
            <Toggle
              enabled={commissionEnabled}
              onToggle={() => canEdit && setCommissionEnabled((v) => !v)}
            />
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold disabled:opacity-50"
            >
              Save payroll defaults
            </button>
          )}

          <Link
            href={`${basePath}/payroll`}
            className="inline-block text-[13px] font-semibold text-dash-dark underline"
          >
            Open payroll dashboard
          </Link>
        </div>
      )}
    </SettingsSectionCard>
  );
}
