"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Toggle } from "@/components/ui/toggle";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import {
  AgentDetailsModal,
  type AgentDetails,
} from "@/components/operations/agent-details-modal";
import { useCompanyZones, useCreateInternalUser } from "@/hooks/use-internal-users";
import { CreateZoneModal } from "@/components/zones/create-zone-modal";
import { getProfile } from "@/lib/api/profile";
import { getBillingStatus } from "@/lib/api/billing";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { useInternalUsers } from "@/hooks/use-projects";
import { useSupportedCurrencies } from "@/hooks/use-currencies";
import { useAuthStore } from "@/store/auth";
import type { ApiRequestError } from "@/lib/api/onboarding";
import { getActiveCompanyContext } from "@/lib/company-context";
import { PAYROLL_DEFAULT_CURRENCY } from "@/lib/payroll/currency";

const ROLE_OPTIONS = [
  { label: "Admin", value: "admin" },
  { label: "Supervisor", value: "supervisor" },
  { label: "Agent", value: "agent" },
] as const;

const WEEKDAYS = [
  { label: "Mon", value: "monday" },
  { label: "Tue", value: "tuesday" },
  { label: "Wed", value: "wednesday" },
  { label: "Thu", value: "thursday" },
  { label: "Fri", value: "friday" },
  { label: "Sat", value: "saturday" },
  { label: "Sun", value: "sunday" },
];

type FormErrors = Partial<{
  name: string;
  email: string;
  role: string;
  salaryType: string;
  salary: string;
  currency: string;
  workDays: string;
  assignedZoneIds: string;
  supervisorId: string;
  phone: string;
  gender: string;
  avatarKey: string;
}>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-500 mt-0.5 text-right">{message}</p>;
}

export function AddAgentModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "supervisor" | "agent" | "">("");
  const [salaryType, setSalaryType] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [currencyCode, setCurrencyCode] = useState(PAYROLL_DEFAULT_CURRENCY);
  const [salary, setSalary] = useState("");
  const [workDays, setWorkDays] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const [assignedZoneIds, setAssignedZoneIds] = useState<number[]>([]);
  const [supervisorId, setSupervisorId] = useState("");
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [fillForAgent, setFillForAgent] = useState(false);
  const [agentDetailsModalOpen, setAgentDetailsModalOpen] = useState(false);
  const [agentDetails, setAgentDetails] = useState<AgentDetails>({
    phone: "",
    gender: "",
    avatarKey: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showCreateZoneModal, setShowCreateZoneModal] = useState(false);
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  const { data: profileData } = useQuery({
    queryKey: ["org-profile"],
    queryFn: async () => {
      const res = await getProfile(token ?? "");
      return res.data;
    },
    enabled: !!token,
  });

  const { data: billingStatus } = useQuery({
    queryKey: ["billing-status"],
    queryFn: async () => {
      const res = await getBillingStatus();
      return res.data;
    },
    enabled: !!token,
  });

  const seatUsage = billingStatus?.seat_usage;
  const seatsAtCap =
    seatUsage != null &&
    seatUsage.remaining !== null &&
    seatUsage.remaining <= 0;

  const createMutation = useCreateInternalUser();
  const { data: currenciesData, isLoading: loadingCurrencies } = useSupportedCurrencies();

  const currencyOptions = currenciesData?.currencies;
  const currencyOptionList = currencyOptions ?? [];
  const supportedCurrencyCodes = useMemo(
    () => new Set((currencyOptions ?? []).map((currency) => currency.code)),
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

  const { data: supervisors = [], isLoading: loadingSupervisors } = useInternalUsers(
    { role: "supervisor", company_id: companyId ?? undefined },
  );
  const { data: zones = [], isLoading: loadingZones } = useCompanyZones(companyId ?? undefined);

  const handleFillForAgentToggle = () => {
    if (role !== "agent") {
      return;
    }

    const next = !fillForAgent;
    setFillForAgent(next);
    setAgentDetailsModalOpen(next);
  };

  const toggleWorkDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setErrors((prev) => ({ ...prev, workDays: undefined }));
  };

  const toggleZone = (zoneId: number) => {
    setAssignedZoneIds((prev) => (
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    ));
    setErrors((prev) => ({ ...prev, assignedZoneIds: undefined }));
  };

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    const normalizedCurrency = selectedCurrencyCode;
    const currencyIsSupported = supportedCurrencyCodes.size > 0
      ? supportedCurrencyCodes.has(normalizedCurrency)
      : /^[A-Z]{3}$/.test(normalizedCurrency);

    if (!name.trim()) e.name = "Full name is required.";
    if (!email.trim()) {
      e.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = "Enter a valid email address.";
    }
    if (!role) e.role = "Role is required.";
    if (!salaryType) e.salaryType = "Salary type is required.";
    if (!currencyCode.trim()) {
      e.currency = "Currency is required.";
    } else if (!currencyIsSupported) {
      e.currency = "Select a supported currency.";
    }
    if (salary) {
      const numeric = salary.replace(/,/g, "");
      if (isNaN(Number(numeric)) || Number(numeric) < 0)
        e.salary = "Enter a valid salary amount.";
    } else {
      e.salary = "Base salary is required.";
    }
    if (workDays.length === 0) e.workDays = "Select at least one work day.";
    if (assignedZoneIds.length === 0) e.assignedZoneIds = "Select at least one zone.";
    if (role === "agent" && !supervisorId) e.supervisorId = "Supervisor is required for agents.";
    if (fillForAgent && role === "agent") {
      if (!agentDetails.phone.trim()) e.phone = "Phone number is required.";
      if (!agentDetails.gender) e.gender = "Gender is required.";
      if (!agentDetails.avatarKey) e.avatarKey = "Select an avatar.";
    }
    return e;
  };

  const handleError = (err: unknown) => {
    const apiErr = err as ApiRequestError;
    const msg = apiErr.message ?? "Something went wrong. Please try again.";
    const emailError = apiErr.errors?.email?.[0] ?? "";
    const isSeatError =
      /upgrade|plan allows|seat|subscription plan is not configured/i.test(
        `${msg} ${emailError}`,
      );

    if (isSeatError) {
      toast.error(emailError || msg, {
        action: {
          label: "Upgrade plan",
          onClick: () => {
            window.location.href = "/billing/change-plan";
          },
        },
      });
    } else {
      toast.error(msg);
    }

    if (apiErr.errors) {
      const fe: FormErrors = {};
      if (apiErr.errors.full_name) fe.name = apiErr.errors.full_name[0];
      if (apiErr.errors.email) fe.email = apiErr.errors.email[0];
      if (apiErr.errors.role) fe.role = apiErr.errors.role[0];
      if (apiErr.errors.salary_type) fe.salaryType = apiErr.errors.salary_type[0];
      if (apiErr.errors.base_salary) fe.salary = apiErr.errors.base_salary[0];
      if (apiErr.errors.currency_code) fe.currency = apiErr.errors.currency_code[0];
      if (apiErr.errors.work_days) fe.workDays = apiErr.errors.work_days[0];
      if (apiErr.errors.assigned_zone_ids) fe.assignedZoneIds = apiErr.errors.assigned_zone_ids[0];
      if (apiErr.errors.supervisor_user_id) fe.supervisorId = apiErr.errors.supervisor_user_id[0];
      if (apiErr.errors.phone_number) fe.phone = apiErr.errors.phone_number[0];
      if (apiErr.errors.gender) fe.gender = apiErr.errors.gender[0];
      if (apiErr.errors.avatar_key) fe.avatarKey = apiErr.errors.avatar_key[0];
      if (apiErr.errors.authorization) toast.error(apiErr.errors.authorization[0]);
      setErrors(fe);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (seatsAtCap) {
      toast.error("Your plan is at its seat limit. Upgrade to add more users.", {
        action: {
          label: "Upgrade plan",
          onClick: () => {
            window.location.href = "/billing/change-plan";
          },
        },
      });
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if ((errs.phone || errs.gender) && !agentDetailsModalOpen) {
        setAgentDetailsModalOpen(true);
      }
      return;
    }

    if (!companyId) {
      toast.error("No active company found. Please refresh and try again.");
      return;
    }

    const baseSalaryNum = Number(salary.replace(/,/g, ""));

    const payload = {
      company_id: companyId,
      full_name: name.trim(),
      email: email.trim(),
      role: role as "admin" | "supervisor" | "agent",
      assigned_zone: "",
      assigned_zone_ids: assignedZoneIds,
      work_days: workDays,
      base_salary: baseSalaryNum,
      salary_type: salaryType,
      currency_code: selectedCurrencyCode,
      commission_enabled: commissionEnabled,
      ...(role === "agent" && supervisorId
        ? { supervisor_user_id: Number(supervisorId) }
        : {}),
      ...(fillForAgent && role === "agent" && agentDetails.phone.trim()
        ? { phone_number: agentDetails.phone.trim() }
        : {}),
      ...(fillForAgent && role === "agent" && agentDetails.gender
        ? { gender: agentDetails.gender as "male" | "female" }
        : {}),
      ...(fillForAgent && role === "agent" && agentDetails.avatarKey
        ? { avatar_key: agentDetails.avatarKey }
        : {}),
    };

    createMutation.mutate(payload, {
      onSuccess: (res) => {
        toast.success(res.message);
        onClose();
      },
      onError: handleError,
    });
  };

  const isPending = createMutation.isPending;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-end justify-center sm:justify-end p-0 sm:p-6">
        <div
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 cursor-pointer"
          onClick={onClose}
        />

        <div className="relative bg-white rounded-t-[28px] sm:rounded-[28px] w-full sm:w-[440px] shadow-[0px_8px_32px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[calc(100vh-80px)] transition-all duration-300 ease-out">
          <div className="bg-transparent h-18 relative overflow-hidden flex items-center px-7 shrink-0">
            <div className="absolute top-0 right-0 w-[50%] h-full pointer-events-none">
              <svg
                viewBox="0 0 200 72"
                fill="none"
                className="w-full h-full"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 0 C60 24, 20 48, 190 72 L200 92 L200 0 Z"
                  fill="#09232D"
                />
              </svg>
            </div>
            <h2 className="text-[18px] font-bold text-dash-dark relative z-10 leading-tight">
              Enter Appropriate
              <br />
              Agent Details
            </h2>
            <button
              onClick={onClose}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <form
            id="add-agent-form"
            onSubmit={handleSubmit}
            className="flex-1 min-h-0 overflow-y-auto px-7 pb-6"
          >
            {/* ── Profile Section ─────────────────────────────── */}
            <div className="space-y-4 mb-5">
              <SectionDivider label="Add New Agent" />

              {seatUsage && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 flex items-center justify-between gap-3">
                  <p className="text-[12px] text-gray-600">
                    Seats used{" "}
                    <span className="font-semibold text-dash-dark">
                      {seatUsage.used}
                      {seatUsage.limit != null ? ` / ${seatUsage.limit}` : ""}
                    </span>
                  </p>
                  {seatsAtCap && (
                    <Link
                      href="/billing/change-plan"
                      className="text-[12px] font-semibold text-dash-dark underline underline-offset-2"
                      onClick={onClose}
                    >
                      Upgrade plan
                    </Link>
                  )}
                </div>
              )}

              {seatsAtCap && (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  Your plan is at capacity. Upgrade to add more team members.
                </p>
              )}

              <div>
                <FormRow label="Fullname" labelClassName="w-28">
                  <InlineInput
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearError("name"); }}
                    placeholder="E.g Alison Thomson"
                    className="col-span-2"
                    disabled={seatsAtCap}
                  />
                </FormRow>
                <FieldError message={errors.name} />
              </div>

              <div>
                <FormRow label="Email" labelClassName="w-28">
                  <InlineInput
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                    placeholder="E.g alison@company.com"
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.email} />
              </div>

              <div>
                <FormRow label="Role" labelClassName="w-28">
                  <InlineSelect
                    value={role}
                    onChange={(v) => {
                      const nextRole = v as "supervisor" | "agent" | "";
                      setRole(nextRole);
                      setSupervisorId("");
                      if (nextRole !== "agent") {
                        setFillForAgent(false);
                        setAgentDetailsModalOpen(false);
                        setAgentDetails((prev) => ({ ...prev, phone: "", gender: "", avatarKey: "" }));
                      }
                      clearError("role");
                      clearError("supervisorId");
                    }}
                    options={[...ROLE_OPTIONS]}
                    placeholder="Select role"
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.role} />
              </div>

              <div>
                <FormRow label="Salary Type" labelClassName="w-28">
                  <InlineSelect
                    value={salaryType}
                    onChange={(v) => { setSalaryType(v as "daily" | "weekly" | "monthly"); clearError("salaryType"); }}
                    options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]}
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.salaryType} />
              </div>

              <div>
                <FormRow label="Currency" labelClassName="w-28">
                  <InlineSelect
                    value={selectedCurrencyCode}
                    onChange={(v) => { setCurrencyCode(v); clearError("currency"); }}
                    options={currencyOptionList.length === 0
                      ? [{ value: PAYROLL_DEFAULT_CURRENCY, label: loadingCurrencies ? "Loading currencies..." : "No currencies available" }]
                      : currencyOptionList.map((c) => ({ value: c.code, label: c.label }))}
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.currency} />
              </div>

              {role === "agent" && (
                <div>
                  <FormRow label="Supervisor" labelClassName="w-28">
                    <InlineSelect
                      value={supervisorId}
                      onChange={(v) => { setSupervisorId(v); clearError("supervisorId"); }}
                      options={supervisors.map((s) => ({ value: String(s.id), label: s.name }))}
                      placeholder={loadingSupervisors ? "Loading…" : "Select supervisor"}
                      className="col-span-2"
                    />
                  </FormRow>
                  <FieldError message={errors.supervisorId} />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[11px] text-gray-500">Assigned Zones</p>
                  <button
                    type="button"
                    onClick={() => setShowCreateZoneModal(true)}
                    className="text-[11px] font-semibold text-dash-dark hover:underline"
                  >
                    Create zone
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {zones.map((zone) => {
                    const selected = assignedZoneIds.includes(zone.id);
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        onClick={() => toggleZone(zone.id)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border text-left ${selected
                          ? "bg-dash-dark text-white border-dash-dark"
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                          }`}
                      >
                        <span className="block">{zone.name}</span>
                        <span className={`block text-[10px] ${selected ? "text-white/70" : "text-gray-400"}`}>
                          {zone.state_name} · {zone.lga_name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {zones.length === 0 && (
                  <div className="mt-2 rounded-xl border border-dashed border-gray-200 p-3">
                    <p className="text-[11px] text-gray-500">
                      {loadingZones
                        ? "Loading zones..."
                        : "No zones yet. Create one in Settings > Zones or use the quick action above."}
                    </p>
                  </div>
                )}
                <FieldError message={errors.assignedZoneIds} />
              </div>


              <div>
                <FormRow label="Salary" labelClassName="w-28">
                  <InlineInput
                    value={salary}
                    onChange={(e) => {
                      setSalary(e.target.value.replace(/[^0-9,]/g, "").slice(0, 60));
                      clearError("salary");
                    }}
                    placeholder="E.g 120000"
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.salary} />
              </div>

              <FormRow label="Commission Enable" labelClassName="w-28">
                <Toggle
                  enabled={commissionEnabled}
                  onToggle={() => setCommissionEnabled(!commissionEnabled)}
                />
              </FormRow>
            </div>

            {/* ── Work Schedule ───────────────────────────────── */}
            <div className="space-y-3 mb-5">
              <SectionDivider label="Work Schedule" />
              <div>
                <p className="text-[11px] text-gray-500 mb-2">Work Days</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const selected = workDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWorkDay(day.value)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${selected
                          ? "bg-dash-dark text-white border-dash-dark"
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                          }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <FieldError message={errors.workDays} />
              </div>

              <FormRow label="Fill for Agent" labelClassName="w-28">
                <Toggle
                  enabled={role === "agent" && fillForAgent}
                  onToggle={handleFillForAgentToggle}
                />
              </FormRow>
              {role !== "agent" && (
                <p className="text-[11px] text-gray-400">Agent only profile fields are available when role is Agent.</p>
              )}
            </div>

            {!fillForAgent && (
              <div className="flex items-center justify-start">
                <button
                  type="submit"
                  disabled={isPending || seatsAtCap}
                  className="w-full sm:w-auto px-9.25 py-3 sm:py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPending ? "Saving…" : seatsAtCap ? "Seats full" : "Done"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      <AgentDetailsModal
        isOpen={agentDetailsModalOpen}
        details={agentDetails}
        onDetailsChange={setAgentDetails}
        errors={{ phone: errors.phone, gender: errors.gender, avatarKey: errors.avatarKey }}
        onClearError={(field) => clearError(field as keyof FormErrors)}
      />

      {companyId ? (
        <CreateZoneModal
          isOpen={showCreateZoneModal}
          onClose={() => setShowCreateZoneModal(false)}
          companyId={companyId}
          defaultCountry={profileData?.organization.company.country ?? "NG"}
        />
      ) : null}
    </>
  );
}
