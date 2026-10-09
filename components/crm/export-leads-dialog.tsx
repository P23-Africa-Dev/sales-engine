"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/crm/crm-toolbar-modals";
import { useCrmLeadsExport } from "@/hooks/use-crm";
import type { ApiRoleBasePath, ExportLeadsParams } from "@/lib/api/crm";

type ExportScope = "filters" | "selected" | "all";
type ExportFormat = "csv";

export type ExportLeadsFilters = Pick<
    ExportLeadsParams,
    "search" | "status" | "priority" | "pipeline_id" | "source" | "assigned_to_user_id"
>;

export function ExportLeadsDialog({
    companyId,
    apiBasePath,
    activeFilters,
    selectedLeadIds = [],
    onClose,
}: {
    companyId: number | string;
    apiBasePath: ApiRoleBasePath;
    activeFilters?: ExportLeadsFilters;
    selectedLeadIds?: Array<number | string>;
    onClose: () => void;
}) {
    const hasSelection = selectedLeadIds.length > 0;
    const hasFilters = Object.values(activeFilters ?? {}).some(
        (value) => value !== undefined && value !== null && value !== ""
    );

    const [scope, setScope] = useState<ExportScope>(hasSelection ? "selected" : hasFilters ? "filters" : "all");
    const [format, setFormat] = useState<ExportFormat>("csv");

    const exportMutation = useCrmLeadsExport(apiBasePath, {
        onSuccess: () => {
            toast.success("Export downloaded.");
            onClose();
        },
        onError: (error) => {
            toast.error(error.message || "Export failed.");
        },
    });

    const runExport = () => {
        const params: ExportLeadsParams = { company_id: companyId, format };

        if (scope === "filters" && activeFilters) {
            Object.assign(params, activeFilters);
        }
        if (scope === "selected") {
            params.lead_ids = selectedLeadIds;
        }

        exportMutation.mutate(params);
    };

    const scopeOptions: Array<{ value: ExportScope; title: string; description: string; disabled?: boolean }> = [
        {
            value: "selected",
            title: `Selected leads (${selectedLeadIds.length})`,
            description: "Only the rows you checked in the list.",
            disabled: !hasSelection,
        },
        {
            value: "filters",
            title: "Current view",
            description: hasFilters ? "Leads matching your active search and filters." : "No filters are active (this matches all leads).",
        },
        {
            value: "all",
            title: "All leads",
            description: apiBasePath === "/agent" ? "All leads you created or are assigned to." : "Every lead in your company.",
        },
    ];

    return (
        <ModalShell title="Export Leads" onClose={onClose}>
            <div className="space-y-4">
                <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-2">What to export</label>
                    <div className="space-y-2">
                        {scopeOptions.map((option) => (
                            <label
                                key={option.value}
                                className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${option.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${scope === option.value ? "border-dash-dark bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}
                            >
                                <input
                                    type="radio"
                                    name="export_scope"
                                    value={option.value}
                                    checked={scope === option.value}
                                    disabled={option.disabled}
                                    onChange={() => setScope(option.value)}
                                    className="mt-0.5"
                                />
                                <span>
                                    <span className="block text-[13px] font-semibold text-dash-dark">{option.title}</span>
                                    <span className="block text-[12px] text-gray-500">{option.description}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-2">Format</label>
                    <div className="flex gap-2">
                        {([
                            { value: "csv", label: "CSV" },
                        ] as Array<{ value: ExportFormat; label: string }>).map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setFormat(option.value)}
                                className={`px-4 py-2 rounded-lg text-[12px] font-semibold border transition-colors ${format === option.value ? "bg-dash-dark text-white border-dash-dark" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={runExport}
                        disabled={exportMutation.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-40"
                    >
                        <Download size={13} />
                        {exportMutation.isPending ? "Exporting…" : "Export"}
                    </button>
                </div>
            </div>
        </ModalShell>
    );
}
