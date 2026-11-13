"use client";

import { SafeItem } from "@/components/ui/safe-boundary";
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, ExternalLink } from "lucide-react";
import {
  dismissSignal,
  downloadOpportunitiesCsv,
  fetchOpportunities,
  syncSignalToCrm,
  type OpportunityApi,
  type OpportunityFilters,
} from "@/lib/api/sales-engine";

const ICP_LABEL: Record<string, string> = {
  qualified: "Qualified",
  partial: "Partly verified",
};

const CONTACT_LABEL: Record<string, string> = {
  enriched: "Enriched",
  company_only: "Company contact only",
  no_contact_found: "No contact found",
  searching: "Looking up…",
};

const EMAIL_LABEL: Record<string, string> = {
  verified: "Verified",
  likely: "Likely",
  found_on_website: "On company website",
  search_result: "From search results",
  unconfirmed: "Unconfirmed (from a contact-data site)",
};

const CHECK_LABEL: Record<string, string> = {
  industry: "Industry",
  company_size: "Company size",
  revenue: "Revenue",
  territory: "Territory",
  company_location: "Based in",
};

function Badge({ tone, children }: { tone: "green" | "amber" | "gray" | "blue"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    gray: "bg-gray-100 text-gray-600",
    blue: "bg-sky-50 text-sky-700",
  };

  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function contactTone(status: string): "green" | "amber" | "gray" | "blue" {
  if (status === "enriched") return "green";
  if (status === "company_only") return "blue";
  if (status === "searching") return "amber";
  return "gray";
}

/**
 * The product overview's deliverable: verified company events whose company fits the ICP,
 * each with the person to contact. Company · Signal · Territory · ICP status · Contact · Contact status.
 */
export function OpportunitiesView() {
  const [filters, setFilters] = useState<OpportunityFilters>({ page: 1 });
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sales-engine", "opportunities", filters],
    queryFn: () => fetchOpportunities(filters),
    // Contact lookups finish in the background; keep "Looking up…" rows fresh.
    refetchInterval: (query) => (query.state.data?.items.some((item) => item.contactStatus === "searching") ? 8000 : false),
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  const act = async (item: OpportunityApi, action: "save" | "dismiss") => {
    setBusyId(item.id);
    setNotice("");
    try {
      if (action === "save") {
        await syncSignalToCrm(item.id);
        setNotice(`${item.company ?? "Opportunity"} saved to your leads.`);
      } else {
        await dismissSignal(item.id);
      }
      await queryClient.invalidateQueries({ queryKey: ["sales-engine", "opportunities"] });
    } catch {
      setNotice("That didn't work. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = async () => {
    try {
      const { blob, filename } = await downloadOpportunitiesCsv(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice("Export failed. Please try again.");
    }
  };

  const setFilter = (key: keyof OpportunityFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }));

  return (
    <section className="flex flex-col gap-4 rounded-[20px] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#09232d]">Opportunities</h2>
          <p className="max-w-2xl text-[13px] text-gray-500">
            Recent, dated company events (market entry, distributor appointments, leadership hires, exports, hiring) from
            companies that fit your ICP, with the person to contact.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="ICP status"
            value={filters.icp_status ?? ""}
            onChange={(e) => setFilter("icp_status", e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-[12px]"
          >
            <option value="">All ICP statuses</option>
            <option value="qualified">Qualified</option>
            <option value="partial">Partly verified</option>
          </select>
          <select
            aria-label="Contact status"
            value={filters.contact_status ?? ""}
            onChange={(e) => setFilter("contact_status", e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-[12px]"
          >
            <option value="">All contacts</option>
            <option value="enriched">Enriched</option>
            <option value="company_only">Company contact only</option>
            <option value="no_contact_found">No contact found</option>
            <option value="searching">Still looking up</option>
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={items.length === 0}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-[12px] font-medium text-[#09232d] hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {notice && <p className="text-[12px] font-medium text-[#09232d]">{notice}</p>}

      {isLoading ? (
        <p className="py-10 text-center text-[13px] text-gray-500">Loading opportunities…</p>
      ) : isError ? (
        <p className="py-10 text-center text-[13px] text-red-600">Opportunities could not be loaded. Please refresh.</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-gray-500">
          No opportunities yet. Run a Social Listening scan: verified company events that fit your ICP appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                <th className="w-6 py-2" />
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Signal</th>
                <th className="py-2 pr-3 font-medium">Territory</th>
                <th className="py-2 pr-3 font-medium">ICP status</th>
                <th className="py-2 pr-3 font-medium">Contact</th>
                <th className="py-2 pr-3 font-medium">Contact status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (<SafeItem key={item.id} name="opportunity">{() => {
                const isOpen = openId === item.id;

                return (
                  <Fragment key={item.id}>
                    <tr
                      className="cursor-pointer border-b border-gray-50 hover:bg-gray-50/60"
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                    >
                      <td className="py-3 text-gray-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="py-3 pr-3 font-semibold text-[#09232d]">{item.company ?? "—"}</td>
                      <td className="py-3 pr-3">
                        <span className="block">{item.signal ?? "—"}</span>
                        <span className="text-[11px] text-gray-400">{item.signalDate ?? ""}</span>
                      </td>
                      <td className="py-3 pr-3">{item.territory ?? "—"}</td>
                      <td className="py-3 pr-3">
                        <Badge tone={item.icpStatus === "qualified" ? "green" : "amber"}>
                          {ICP_LABEL[item.icpStatus ?? ""] ?? "—"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3">
                        {item.contact.name ? (
                          <>
                            <span className="block">{item.contact.name}</span>
                            <span className="text-[11px] text-gray-400">{item.contact.role ?? ""}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">Not identified</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={contactTone(item.contactStatus)}>{CONTACT_LABEL[item.contactStatus] ?? item.contactStatus}</Badge>
                      </td>
                      <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {item.savedAsLead ? (
                          <span className="text-[11px] text-gray-400">Saved</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => act(item, "save")}
                            className="rounded-lg bg-[#09232d] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40 cursor-pointer"
                          >
                            Save to leads
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-gray-100 bg-[#fafafa]">
                        <td />
                        <td colSpan={7} className="py-4 pr-3">
                          <div className="grid gap-5 md:grid-cols-3">
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold uppercase text-gray-400">What happened</p>
                              <p className="text-[13px] text-[#09232d]">{item.detail ?? "—"}</p>
                              {item.sourceUrl && (
                                <a
                                  href={item.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[12px] text-sky-700 hover:underline"
                                >
                                  {item.source ?? "Source"} · {item.signalDate ?? "undated"} <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold uppercase text-gray-400">Company</p>
                              <p className="text-[12px] text-gray-600">
                                {[item.companyProfile.industry, item.companyProfile.size && `${item.companyProfile.size} employees`, item.companyProfile.headquarters]
                                  .filter(Boolean)
                                  .join(" · ") || "No public profile found"}
                              </p>
                              <ul className="space-y-0.5">
                                {Object.entries(item.icpChecks).map(([check, verdict]) => (
                                  <li key={check} className="text-[12px] text-gray-600">
                                    {verdict === "verified" ? "✓" : verdict === "unknown" ? "?" : "✗"} {CHECK_LABEL[check] ?? check}
                                    {verdict === "unknown" && <span className="text-gray-400"> (not public)</span>}
                                  </li>
                                ))}
                              </ul>
                              {item.companyProfile.linkedinUrl && (
                                <a href={item.companyProfile.linkedinUrl} target="_blank" rel="noreferrer" className="text-[12px] text-sky-700 hover:underline">
                                  Company page
                                </a>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold uppercase text-gray-400">Contact</p>
                              {item.contact.email && (
                                <p className="text-[12px] text-[#09232d]">
                                  {item.contact.email}{" "}
                                  {item.contact.emailStatus && (
                                    <Badge tone={item.contact.emailStatus === "verified" ? "green" : "gray"}>
                                      {EMAIL_LABEL[item.contact.emailStatus] ?? item.contact.emailStatus}
                                    </Badge>
                                  )}
                                </p>
                              )}
                              {item.contact.phone && <p className="text-[12px] text-[#09232d]">{item.contact.phone}</p>}
                              {item.contact.linkedinUrl && (
                                <a href={item.contact.linkedinUrl} target="_blank" rel="noreferrer" className="text-[12px] text-sky-700 hover:underline">
                                  LinkedIn profile
                                </a>
                              )}
                              {!item.contact.email && !item.contact.phone && !item.contact.linkedinUrl && (
                                <p className="text-[12px] text-gray-400">{CONTACT_LABEL[item.contactStatus] ?? "No contact found"}</p>
                              )}
                              <button
                                type="button"
                                disabled={busyId === item.id}
                                onClick={() => act(item, "dismiss")}
                                className="mt-2 text-[12px] text-gray-500 hover:text-gray-800 cursor-pointer"
                              >
                                Not relevant — dismiss
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }}</SafeItem>))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-end gap-2 text-[12px]">
          <button
            type="button"
            disabled={meta.current_page <= 1}
            onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
            className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40 cursor-pointer"
          >
            Previous
          </button>
          <span className="text-gray-500">
            Page {meta.current_page} of {meta.last_page}
          </span>
          <button
            type="button"
            disabled={meta.current_page >= meta.last_page}
            onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
            className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
