"use client";

import React, { useState, useEffect } from "react";
import { X, CheckCircle, Calendar, Target, FileText, User } from "lucide-react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useUpdateKpi } from "@/hooks/use-kpi";
import { useInternalUsers } from "@/hooks/use-projects";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { KpiCategory, KpiItem, KpiPriority } from "@/lib/api/kpi";

interface EditKpiModalProps {
  kpi: KpiItem | null;
  onClose: () => void;
}

const KPI_CATEGORIES: { value: KpiCategory; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "customer_visits", label: "Customer Visits" },
  { value: "lead_generation", label: "Lead Generation" },
  { value: "collection", label: "Collection" },
  { value: "survey", label: "Survey" },
  { value: "merchandising", label: "Merchandising" },
];


const PRIORITY_OPTIONS: { value: KpiPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#10B981" },
  { value: "medium", label: "Medium", color: "#F59E0B" },
  { value: "high", label: "High", color: "#EF4444" },
  { value: "critical", label: "Critical", color: "#7C3AED" },
];

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

const BASE_INPUT =
  "w-full bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border transition-colors placeholder:text-gray-300";
const INPUT_CLS = (err?: string) =>
  `${BASE_INPUT} py-2.5 px-4 ${err ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`;

type FormState = {
  name: string;
  category: string;
  objective: string;
  targetValue: string;
  startDate: string;
  endDate: string;
  assignedTo: string;
  priority: string;
  expectedOutcome: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  category: "",
  objective: "",
  targetValue: "",
  startDate: "",
  endDate: "",
  assignedTo: "",
  priority: "",
  expectedOutcome: "",
};

export function EditKpiModal({ kpi, onClose }: EditKpiModalProps) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const { data: agents = [], isLoading: loadingAgents } = useInternalUsers({ role: "agent" });

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const { mutate, isPending } = useUpdateKpi({
    onSuccess: () => {
      toast.success("KPI updated successfully.");
      handleClose();
    },
  });

  useEffect(() => {
    if (!kpi) return;

    const timer = window.setTimeout(() => {
      setForm({
        name: kpi.name,
        category: kpi.category,
        objective: kpi.objective,
        targetValue: kpi.target_value,
        startDate: kpi.start_date,
        endDate: kpi.end_date,
        assignedTo: kpi.assigned_to_user_id ? String(kpi.assigned_to_user_id) : "",
        priority: kpi.priority,
        expectedOutcome: kpi.expected_outcome,
      });
      setErrors({});
    }, 0);

    return () => window.clearTimeout(timer);
  }, [kpi]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errs.name = "KPI name is required";
    if (!form.category) errs.category = "Category is required";
    if (!form.objective.trim()) errs.objective = "Objective is required";
    if (!form.targetValue.trim()) errs.targetValue = "Target value is required";
    if (!form.startDate) errs.startDate = "Start date is required";
    if (!form.endDate) errs.endDate = "End date is required";
    if (!form.priority) errs.priority = "Priority is required";
    if (!form.expectedOutcome.trim()) errs.expectedOutcome = "Expected outcome is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (!companyId || !kpi) {
      toast.error("Company context is required.");
      return;
    }

    mutate(
      {
        kpiId: kpi.id,
        payload: {
          company_id: companyId,
          name: form.name,
          category: form.category as KpiCategory,
          objective: form.objective,
          target_value: form.targetValue,
          start_date: form.startDate,
          end_date: form.endDate,
          assigned_to_user_id: form.assignedTo ? Number(form.assignedTo) : null,
          priority: form.priority as KpiPriority,
          expected_outcome: form.expectedOutcome,
        },
      },
      {
        onError: (err: unknown) => {
          const apiErr = err as { message?: string };
          toast.error(apiErr.message || "Failed to update KPI");
        },
      }
    );
  };

  const handleClose = () => {
    setForm(INITIAL_FORM);
    setErrors({});
    onClose();
  };

  if (!kpi) return null;

  const selectedPriority = PRIORITY_OPTIONS.find((p) => p.value === form.priority);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-white/40" onClick={handleClose} />

      <div className="absolute right-12 bottom-3.25 bg-white rounded-[28px] w-full max-w-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
        {/* Header */}
        <div className="bg-transparent h-18 relative overflow-hidden flex items-center px-7 shrink-0">
          <div className="absolute top-0 right-0 w-[50%] h-full pointer-events-none">
            <svg viewBox="0 0 200 72" fill="none" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0 0 C60 24, 20 48, 190 72 L200 92 L200 0 Z" fill="#09232D" />
            </svg>
          </div>
          <h2 className="text-[18px] font-bold text-dash-dark relative z-10 leading-tight">
            Edit
            <br />
            KPI
          </h2>
          <button
            onClick={handleClose}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Purpose banner */}
        <div className="mx-5 mt-1 mb-2 bg-[#F0F4F8] rounded-xl px-4 py-2.5">
          <p className="text-[11px] text-[#4A5568] leading-relaxed">
            <span className="font-bold text-[#09232D]">Purpose:</span> Define measurable operational outcomes for a team, region, or individual agent.
          </p>
        </div>

        {/* Body — scrollable */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* KPI Name */}
          <div>
            <FieldLabel required>KPI Name</FieldLabel>
            <div className="relative">
              <FileText size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="e.g. New Retailer Acquisition – August"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={`${BASE_INPUT} py-2.5 pl-9 pr-4 ${errors.name ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
              />
            </div>
            {errors.name && <p className="text-red-400 text-[11px] mt-1">{errors.name}</p>}
          </div>

          {/* KPI Category */}
          <div>
            <FieldLabel required>KPI Category</FieldLabel>
            <SearchableSelect
              value={form.category}
              onChange={(v) => set("category", v)}
              options={KPI_CATEGORIES}
              placeholder="Select category"
              className={`${INPUT_CLS(errors.category)} cursor-pointer`}
            />
            {errors.category && <p className="text-red-400 text-[11px] mt-1">{errors.category}</p>}
          </div>

          {/* Objective */}
          <div>
            <FieldLabel required>Objective</FieldLabel>
            <textarea
              placeholder="Brief explanation of what needs to be achieved"
              value={form.objective}
              onChange={(e) => set("objective", e.target.value)}
              rows={2}
              className={`${BASE_INPUT} py-2.5 px-4 resize-none ${errors.objective ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
            />
            {errors.objective && <p className="text-red-400 text-[11px] mt-1">{errors.objective}</p>}
          </div>

          {/* Target Value */}
          <div>
            <FieldLabel required>Target Value</FieldLabel>
            <div className="relative">
              <Target size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="e.g 50 visits, 20 leads"
                value={form.targetValue}
                onChange={(e) => set("targetValue", e.target.value)}
                className={`${BASE_INPUT} py-2.5 pl-9 pr-4 ${errors.targetValue ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
              />
            </div>
            {errors.targetValue && <p className="text-red-400 text-[11px] mt-1">{errors.targetValue}</p>}
          </div>

          {/* Start Date + End Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Start Date</FieldLabel>
              <div className="relative">
                <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  className={`${BASE_INPUT} py-2.5 pl-9 pr-2 ${errors.startDate ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
                />
              </div>
              {errors.startDate && <p className="text-red-400 text-[11px] mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <FieldLabel required>End Date</FieldLabel>
              <div className="relative">
                <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                  className={`${BASE_INPUT} py-2.5 pl-9 pr-2 ${errors.endDate ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
                />
              </div>
              {errors.endDate && <p className="text-red-400 text-[11px] mt-1">{errors.endDate}</p>}
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <FieldLabel>Assigned To</FieldLabel>
            <SearchableSelect
              value={form.assignedTo}
              onChange={(v) => set("assignedTo", v)}
              options={loadingAgents ? [] : agents.map((a) => ({ value: a.id.toString(), label: a.name }))}
              placeholder={loadingAgents ? "Loading…" : "Select agent"}
              leftIcon={<User size={13} className="text-gray-400" />}
              className={`${INPUT_CLS()} pl-9 pr-4 cursor-pointer`}
            />
          </div>

          {/* Priority Level */}
          <div>
            <FieldLabel required>Priority Level</FieldLabel>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set("priority", opt.value)}
                  className={`py-2.5 px-2 rounded-xl text-[11px] font-bold transition-all border-2 ${
                    form.priority === opt.value
                      ? "text-white shadow-md border-transparent"
                      : "text-gray-500 border-gray-200 bg-gray-50 hover:border-gray-300"
                  }`}
                  style={form.priority === opt.value ? { backgroundColor: opt.color, borderColor: opt.color } : {}}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {errors.priority && <p className="text-red-400 text-[11px] mt-1">{errors.priority}</p>}
          </div>

          {/* Expected Outcome */}
          <div>
            <FieldLabel required>Expected Outcome</FieldLabel>
            <textarea
              placeholder="Success criteria"
              value={form.expectedOutcome}
              onChange={(e) => set("expectedOutcome", e.target.value)}
              rows={2}
              className={`${BASE_INPUT} py-2.5 px-4 resize-none ${errors.expectedOutcome ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
            />
            {errors.expectedOutcome && <p className="text-red-400 text-[11px] mt-1">{errors.expectedOutcome}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-5 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-fit px-9.25 py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle size={15} />}
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
