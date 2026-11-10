"use client";

import { Plus, X } from "lucide-react";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { isValidUrl } from "@/lib/crm/lead-fields";

type ProfileUrlInputsProps = {
  values: string[];
  onChange: (values: string[]) => void;
  errors?: string[];
  labelClassName?: string;
  variant?: "default" | "compact";
};

export function ProfileUrlInputs({
  values,
  onChange,
  errors = [],
  labelClassName = "w-28",
  variant = "default",
}: ProfileUrlInputsProps) {
  const rows = values.length > 0 ? values : [""];
  const hasAnyValue = rows.some((url) => url.trim() !== "");
  const showAddMore = hasAnyValue;

  const updateRow = (index: number, next: string) => {
    const nextRows = [...rows];
    nextRows[index] = next;
    onChange(nextRows);
  };

  const addRow = () => {
    onChange([...rows, ""]);
  };

  const removeRow = (index: number) => {
    const nextRows = rows.filter((_, i) => i !== index);
    onChange(nextRows.length > 0 ? nextRows : [""]);
  };

  return (
    <div className="space-y-2">
      {rows.map((url, index) => (
        <div key={index}>
          <FormRow
            label={index === 0 ? "Profile URL" : ""}
            labelClassName={labelClassName}
          >
            <div className="col-span-2 flex w-full items-center gap-2">
              <InlineInput
                value={url}
                onChange={(e) => updateRow(index, e.target.value)}
                placeholder="https://linkedin.com/in/username"
                className="w-full min-w-0 flex-1"
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Remove profile URL"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </FormRow>
          {url.trim() && !isValidUrl(url) && (
            <p className="text-[11px] text-red-500 mt-0.5 text-right">Enter a valid URL.</p>
          )}
        </div>
      ))}

      {showAddMore && (
        <button
          type="button"
          onClick={addRow}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-dash-dark/70 hover:text-dash-dark transition-colors ${
            variant === "compact" ? "px-1" : "px-1 ml-[7.5rem]"
          }`}
        >
          <Plus size={12} />
          Add another URL
        </button>
      )}

      {errors.map((message) => (
        <p key={message} className="text-[11px] text-red-500 mt-0.5 text-right">
          {message}
        </p>
      ))}
    </div>
  );
}
