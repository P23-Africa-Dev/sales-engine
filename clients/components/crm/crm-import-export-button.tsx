"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Import } from "lucide-react";
import { ImportLeadsWizard } from "@/components/crm/import-leads-wizard";
import { ExportLeadsDialog, type ExportLeadsFilters } from "@/components/crm/export-leads-dialog";
import type { ApiRoleBasePath, CrmLabel, CrmPipeline } from "@/lib/api/crm";

/**
 * Shared Import / Export toolbar entry point used by all CRM pages
 * (admin + agent, kanban + list).
 */
export function CrmImportExportButton({
    companyId,
    apiBasePath,
    pipelines,
    labels,
    defaultPipelineId,
    activeFilters,
    selectedLeadIds,
    onViewImportedPipeline,
    onViewAllLeads,
}: {
    companyId: number | string | null | undefined;
    apiBasePath: ApiRoleBasePath;
    pipelines: CrmPipeline[];
    labels: CrmLabel[];
    defaultPipelineId?: number | null;
    activeFilters?: ExportLeadsFilters;
    selectedLeadIds?: Array<number | string>;
    onViewImportedPipeline?: (pipelineId: number) => void;
    onViewAllLeads?: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [menuOpen]);

    return (
        <>
            <div className="relative" ref={containerRef}>
                <button
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm"
                >
                    <Import size={13} />
                    Import / Export
                    <ChevronDown size={12} />
                </button>

                {menuOpen && (
                    <div className="absolute z-50 top-full mt-1 right-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-40">
                        <button
                            onClick={() => {
                                setMenuOpen(false);
                                setShowImport(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-gray-600 hover:bg-gray-50"
                        >
                            <Import size={13} />
                            Import leads
                        </button>
                        <button
                            onClick={() => {
                                setMenuOpen(false);
                                setShowExport(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-gray-600 hover:bg-gray-50"
                        >
                            <Download size={13} />
                            Export leads
                        </button>
                    </div>
                )}
            </div>

            {showImport && companyId && (
                <ImportLeadsWizard
                    companyId={companyId}
                    apiBasePath={apiBasePath}
                    pipelines={pipelines}
                    labels={labels}
                    defaultPipelineId={defaultPipelineId}
                    onClose={() => setShowImport(false)}
                    onViewImportedPipeline={(pipelineId) => {
                        setShowImport(false);
                        onViewImportedPipeline?.(pipelineId);
                    }}
                    onViewAllLeads={() => {
                        setShowImport(false);
                        onViewAllLeads?.();
                    }}
                />
            )}

            {showExport && companyId && (
                <ExportLeadsDialog
                    companyId={companyId}
                    apiBasePath={apiBasePath}
                    activeFilters={activeFilters}
                    selectedLeadIds={selectedLeadIds}
                    onClose={() => setShowExport(false)}
                />
            )}
        </>
    );
}
