"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useLeads, useUpdateLead } from "@/hooks/use-crm";
import type { ApiLeadStatus, ApiRoleBasePath, LeadApiItem } from "@/lib/api/crm";
import { Search, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";

const STATUSES: Array<{ value: ApiLeadStatus; label: string }> = [
    { value: "new", label: "New" },
    { value: "contacted", label: "Contacted" },
    { value: "qualified", label: "Qualified" },
    { value: "proposal_sent", label: "Proposal Sent" },
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
];

const statusLabelMap = new Map(STATUSES.map((entry) => [entry.value, entry.label]));

function LeadStatusCell({
    lead,
    readOnly,
    onUpdate,
}: {
    lead: LeadApiItem;
    readOnly: boolean;
    onUpdate: (lead: LeadApiItem, status: ApiLeadStatus) => Promise<void>;
}) {
    const value = (lead.status ?? "new") as ApiLeadStatus;

    if (readOnly) {
        return <span className="text-[12px] text-[#475467]">{statusLabelMap.get(value) ?? "New"}</span>;
    }

    return (
        <SearchableSelect
            value={value}
            onChange={(v) => onUpdate(lead, v as ApiLeadStatus)}
            options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-[#344054]"
        />
    );
}

export function CrmLeadsListPage({
    apiBasePath,
    readOnly,
}: {
    apiBasePath: ApiRoleBasePath;
    readOnly: boolean;
}) {
    const user = useAuthStore((s) => s.user);
    const { apiCompanyId: companyId } = getActiveCompanyContext(user);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
        }, 350);

        return () => clearTimeout(timeout);
    }, [search]);

    const { data, isLoading } = useLeads(
        {
            company_id: companyId ?? undefined,
            search: debouncedSearch || undefined,
            page,
        },
        apiBasePath
    );

    const updateLeadMutation = useUpdateLead(undefined, apiBasePath);

    const leads = data?.leads ?? [];
    const pagination = data?.pagination;

    async function handleStatusUpdate(lead: LeadApiItem, status: ApiLeadStatus) {
        try {
            await updateLeadMutation.mutateAsync({
                leadId: lead.id,
                payload: {
                    company_id: companyId ?? undefined,
                    status,
                },
            });
            toast.success("Lead status updated");
        } catch {
            toast.error("Unable to update lead status");
        }
    }

    if (!companyId) {
        return (
            <div className="bg-white rounded-3xl p-8 text-center text-gray-500 border border-gray-100">
                No active company context was found for this account.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
                <div className="relative w-full max-w-110">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by name......"
                        className="w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
                    />
                </div>

                {!readOnly && (
                    <button className="flex items-center gap-2 px-6 py-3 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-black hover:opacity-90 transition-all shadow-lg">
                        Add New Leads
                        <Plus size={15} />
                    </button>
                )}
            </div>

            <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] p-4 overflow-x-auto">
                {isLoading ? (
                    <div className="p-6 text-[13px] text-gray-400">Loading leads...</div>
                ) : (
                    <table className="w-full min-w-[850px] border-separate border-spacing-y-2">
                        <thead>
                            <tr className="text-left text-[12px] text-[#667085]">
                                <th className="font-medium px-4">Lead Name</th>
                                <th className="font-medium px-4">Email</th>
                                <th className="font-medium px-4">Phone</th>
                                <th className="font-medium px-4">Status</th>
                                <th className="font-medium px-4">Assigned To</th>
                                <th className="font-medium px-4">Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leads.map((lead) => (
                                <tr key={lead.id} className="bg-[#F9FAFB] border border-gray-100">
                                    <td className="px-4 py-3 text-[13px] text-[#101828] font-semibold">{lead.name}</td>
                                    <td className="px-4 py-3 text-[12px] text-[#475467] max-w-[220px] truncate" title={lead.email ?? undefined}>{lead.email ?? "-"}</td>
                                    <td className="px-4 py-3 text-[12px] text-[#475467]">{lead.phone ?? "-"}</td>
                                    <td className="px-4 py-3">
                                        <LeadStatusCell lead={lead} readOnly={readOnly} onUpdate={handleStatusUpdate} />
                                    </td>
                                    <td className="px-4 py-3 text-[12px] text-[#475467]">{lead.assignee?.name ?? "Unassigned"}</td>
                                    <td className="px-4 py-3 text-[12px] text-[#475467]">{lead.source ?? "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {!isLoading && !leads.length && (
                    <div className="p-6 text-[13px] text-gray-400">No leads found for the current filters.</div>
                )}

                <div className="flex items-center justify-between mt-4 border-t border-gray-100 pt-4">
                    <p className="text-[12px] text-gray-400">
                        Page {pagination?.current_page ?? page} of {pagination?.last_page ?? page}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            className="h-9 w-9 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40"
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            disabled={page <= 1}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            className="h-9 w-9 rounded-lg border border-gray-200 flex items-center justify-center disabled:opacity-40"
                            onClick={() => setPage((current) => current + 1)}
                            disabled={!pagination?.next_page_url}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
