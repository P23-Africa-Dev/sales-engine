"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Building, Building2, Factory, House, Store, User, UserRound, UserRoundCheck, UserRoundPen, ContactRound } from "lucide-react";
import { PAGE_SIZE, ProspectPagination } from "@/components/ui/prospect-pagination";
import type { OutreachDashboardData, OutreachBusiness } from "@/lib/outreach-dashboard";
import { OutreachActivityHistory } from "./outreach-activity-history";
import { IcpBuilderModal } from "@/components/sales-engine/icp-builder-modal";

const asset = (name: string) => `/dashboard-design/${name}`;
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-US");

function MetricProgress({ label, percent, title, secondary = false }: { label: string; percent: number | null; title: string; secondary?: boolean }) {
  return <div>
    <span>{label}</span>
    <div className="progress-track" role="progressbar" aria-label={`${label} ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent == null ? "Unavailable" : undefined}>
      <div className={secondary ? "progress-purple" : "progress-mint"} style={{ width: `${Math.max(0, Math.min(100, percent ?? 0))}%` }} />
    </div>
  </div>;
}

function Avatar({ color, leadType = "business", identity = "" }: { color: string; leadType?: "business" | "individual"; identity?: string }) {
  const variation = Array.from(identity).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
  const icons = leadType === "individual" ? [User, UserRound, UserRoundCheck, UserRoundPen, ContactRound] : [House, Building, Building2, Store, Factory];
  const Icon = icons[variation % icons.length];
  const colors = leadType === "individual" ? ["#f0bbf7", "#e3c6f5", "#f5d7c5", "#cce6fa", "#f6d8e7"] : ["#bce9df", "#d5e6f0", "#e7d9bd", "#d5e6cc", "#dbd0ed"];
  return <span className="outreach-avatar" style={{ backgroundColor: identity ? colors[variation % colors.length] : color, color: "#09232d" }} role="img" aria-label={`${leadType === "individual" ? "Individual" : "Business"} icon`}>
    <Icon size={21} strokeWidth={1.8} />
  </span>;
}

function EmptyIllustration() {
  const layers = [
    ["08585.svg", 0, 0, 150, 150], ["65360.svg", 0, 0, 150, 150],
    ["6beb2.svg", 37, 53, 32, 6], ["6beb2.svg", 37, 95, 32, 6],
    ["46f5d.svg", 37, 67, 76, 20], ["e86a6.svg", 37, 109, 76, 18],
    ["fa249.svg", 49, 24, 52, 8], ["56b7c.svg", 78.64, 78, 20.09, 26.871],
  ] as const;
  return <div className="prospect-illustration" aria-hidden="true">{layers.map(([file, left, top, width, height], index) =>
    <Image key={index} src={asset(file)} alt="" width={width} height={height} style={{ position: "absolute", left, top }} />
  )}</div>;
}

function LeadSearchDropdown({
  leads,
  selectedLeadId,
  onSelectLead,
}: {
  leads: OutreachBusiness[];
  selectedLeadId: string | null;
  onSelectLead: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const selectedLead = leads.find(l => l.id === selectedLeadId);
  const filtered = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.owner.toLowerCase().includes(search.toLowerCase()) ||
    (l.email && l.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={dropdownRef} style={{ position: "relative", minWidth: "150px" }}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        style={{
          width: "100%",
          padding: "6px 10px",
          borderRadius: "8px",
          border: selectedLead ? "1px solid #2ae9c9" : "1px solid #cbd5e1",
          background: selectedLead ? "#f0fdf4" : "#ffffff",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          gap: "6px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#0f172a"
        }}
        aria-label="Filter by specific lead"
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {selectedLead ? selectedLead.name : "All Leads"}
        </span>
        <span style={{ fontSize: "9px", color: "#64748b" }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            width: "240px",
            maxHeight: "220px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          <div style={{ padding: "6px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter leads list…"
              autoFocus
              style={{
                width: "100%",
                padding: "4px 8px",
                fontSize: "11px",
                border: "1px solid #cbd5e1",
                borderRadius: "4px",
                outline: "none"
              }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: "4px" }}>
            <button
              type="button"
              onClick={() => { onSelectLead(null); setOpen(false); }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                fontSize: "11px",
                fontWeight: !selectedLeadId ? 600 : 400,
                color: !selectedLeadId ? "#022228" : "#475569",
                background: !selectedLeadId ? "#f1f5f9" : "transparent",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              All Leads (Clear filter)
            </button>
            {filtered.map(lead => (
              <button
                key={lead.id}
                type="button"
                onClick={() => { onSelectLead(lead.id); setOpen(false); }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: selectedLeadId === lead.id ? "#022228" : "#1e293b",
                  background: selectedLeadId === lead.id ? "#f1f5f9" : "transparent",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: lead.avatarColor,
                    flexShrink: 0
                  }}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {lead.name}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "8px", fontSize: "11px", color: "#94a3b8", textAlign: "center" }}>
                No matching leads
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineSearchDropdown({
  selectedPipeline,
  onSelectPipeline,
  options = [],
}: {
  selectedPipeline: string;
  onSelectPipeline: (pipeline: string) => void;
  options?: Array<{ id: number; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const pipelines = [{ id: "all", label: "All Pipelines" }, ...options.map(pipeline => ({ id: String(pipeline.id), label: pipeline.name }))];

  const current = pipelines.find(p => p.id === selectedPipeline) || pipelines[0];

  return (
    <div ref={dropdownRef} style={{ position: "relative", minWidth: "150px" }}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        style={{
          width: "100%",
          padding: "6px 10px",
          borderRadius: "8px",
          border: selectedPipeline !== "all" ? "1px solid #2ae9c9" : "1px solid #cbd5e1",
          background: selectedPipeline !== "all" ? "#f0fdf4" : "#ffffff",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          gap: "6px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#0f172a"
        }}
        aria-label="Filter by pipeline"
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {current.label}
        </span>
        <span style={{ fontSize: "9px", color: "#64748b" }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            width: "190px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            padding: "4px"
          }}
        >
          {pipelines.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectPipeline(item.id);
                setOpen(false);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                fontSize: "11px",
                fontWeight: selectedPipeline === item.id ? 600 : 400,
                color: selectedPipeline === item.id ? "#022228" : "#1e293b",
                background: selectedPipeline === item.id ? "#f1f5f9" : "transparent",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OutreachDashboardView({
  data,
  loading = false,
  error = false,
}: {
  data: OutreachDashboardData;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const [view, setView] = useState<"businesses" | "outreach">("outreach");
  const [selectedOutreachId, setSelectedOutreachId] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState(data.defaultBusinessId);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedPipeline, setSelectedPipeline] = useState<string>("all");
  const [selectedLeadFilterId, setSelectedLeadFilterId] = useState<string | null>(null);
  const [icpOpen, setIcpOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [fullActivityOpen, setFullActivityOpen] = useState(false);
  const itemsPerPage = PAGE_SIZE;

  const selectedOutreach = view === "outreach" ? data.outreach.find(item => item.id === selectedOutreachId) ?? data.outreach[0] : undefined;
  const selectedBusiness = view === "outreach"
    ? data.businesses.find(item => item.id === selectedOutreach?.businessId)
    : data.businesses.find(item => item.id === selectedBusinessId)
      ?? data.businesses.find(item => item.id === data.defaultBusinessId)
      ?? data.businesses[0];

  const matches = (values: string[]) => values.some(value => value && value.toLowerCase().includes(query.trim().toLowerCase()));

  const getPipeline = (item: OutreachBusiness) => item.pipeline || "—";
  const getEmail = (item: OutreachBusiness) => item.email || "—";

  const businesses = data.businesses.filter(item => {
    if (selectedLeadFilterId && item.id !== selectedLeadFilterId) return false;
    if (selectedPipeline !== "all" && !item.pipelineIds?.includes(selectedPipeline)) return false;
    if (query.trim()) {
      const email = getEmail(item);
      const pipe = getPipeline(item);
      return matches([item.name, item.industry, item.country, item.website, item.owner, email, pipe]);
    }
    return true;
  });

  const outreach = data.outreach.filter(item => {
    if (selectedLeadFilterId && item.businessId !== selectedLeadFilterId) return false;
    if (selectedPipeline !== "all" && !data.businesses.find(b => b.id === item.businessId)?.pipelineIds?.includes(selectedPipeline)) return false;
    if (query.trim()) {
      return matches([item.name, item.channel, item.status, item.owner]);
    }
    return true;
  });

  const currentList = view === "businesses" ? businesses : outreach;
  const empty = currentList.length === 0;

  const totalPages = Math.max(1, Math.ceil(currentList.length / itemsPerPage));
  const validPage = Math.min(Math.max(1, page), totalPages);
  const paginatedList = currentList.slice((validPage - 1) * itemsPerPage, validPage * itemsPerPage);

  function selectBusiness(id: string | null) {
    if (id) setSelectedBusinessId(id);
  }

  function businessCells(item: OutreachBusiness) {
    return [
      ["Prospects", item.name], ["Industry", item.industry], ["Country", item.country],
      ["Website", item.website], ["Account Owner", item.owner], ["Created", item.created],
    ];
  }

  return (
    <div className="outreach-dashboard" data-source={data.source}>
      <style dangerouslySetInnerHTML={{__html: `
        .business-table tr {
          transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease, background-color 0.15s ease, color 0.15s ease;
        }
        .business-table tr:not(.is-selected):hover {
          background: #f8f8f8 !important;
          color: #070b16 !important;
          transform: translateY(-3px);
          box-shadow: 0 6px 16px rgba(12, 12, 13, 0.15);
        }
        .business-table tr:not(.is-selected):hover td {
          border-color: #b0b0b0 !important;
        }
        .business-table tr:not(.is-selected):hover td > span:not(.outreach-avatar) {
          color: #3d565b !important;
        }
        .business-table tr.is-selected {
          background: #022228 !important;
          color: white !important;
        }
        .business-table tr.is-selected td {
          border-color: #e8e5e5 !important;
        }
        .business-table tr.is-selected td > span:not(.outreach-avatar) {
          color: #d9d9d9 !important;
        }
      `}} />
      <h1>Outreach</h1>
      <div className="outreach-metrics">
        {data.metrics.map(card => <article className="outreach-metric" key={card.id}>
          <h2>{card.title}</h2>
          <p className="metric-number">{number(card.total)}</p>
          <div className="outreach-progress">
            <MetricProgress label={card.primaryCount !== undefined ? `${card.primaryLabel} · ${number(card.primaryCount)}` : card.primaryLabel} percent={card.primaryPercent} title={card.title} />
            <MetricProgress label={card.secondaryCount !== undefined ? `${card.secondaryLabel} · ${number(card.secondaryCount)}` : card.secondaryLabel} percent={card.secondaryPercent} title={card.title} secondary />
          </div>
          <div className="outreach-avatars">{Array.from({ length: card.avatars }, (_, index) => <Avatar key={index} color={["#dc9c56", "#f5fdfa", "#b190b6"][index % 3]} />)}</div>
        </article>)}
      </div>
      <section className="prospects-panel" aria-label="Businesses and outreach activity">
        <div className="prospects-panel-surface" aria-hidden="true" />
        <div className="prospects-toolbar">
          <button className={view === "outreach" ? "selected" : ""} onClick={() => { setView("outreach"); setPage(1); }} aria-pressed={view === "outreach"}>All Outreach <span>{data.counts.outreach}</span></button>
          <button className={view === "businesses" ? "selected" : ""} onClick={() => { setView("businesses"); setPage(1); }} aria-pressed={view === "businesses"}>All Prospects <span>{data.counts.businesses}</span></button>
          <button onClick={() => setFilterOpen(value => !value)} aria-expanded={filterOpen} aria-controls="outreach-filter"><Image src={asset("6e7f3.svg")} alt="" width={18} height={18} />Filter</button>
        </div>
        <h2 className="prospects-title">{view === "businesses" ? "Number of Prospects" : "All Outreach"}</h2>
        <div className="prospects-content">
          <div className="prospect-list">
            <div className="prospect-list-scroll">
            {filterOpen && (
              <div
                id="outreach-filter"
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 20,
                  background: "#ffffff",
                  padding: "8px 0",
                  marginBottom: "8px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px",
                  borderBottom: "1px solid #e2e8f0"
                }}
              >
                <div style={{ flex: "1 1 200px", minWidth: "180px", position: "relative" }}>
                  <input
                    value={query}
                    onChange={event => { setQuery(event.target.value); setPage(1); }}
                    placeholder="Search businesses, owners or activity…"
                    aria-label="Search businesses, owners or activity"
                    style={{
                      width: "100%",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      color: "#0f172a"
                    }}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => { setQuery(""); setPage(1); }}
                      style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#94a3b8",
                        fontSize: "12px"
                      }}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {view === "businesses" && (
                  <>
                    <LeadSearchDropdown
                      leads={data.businesses}
                      selectedLeadId={selectedLeadFilterId}
                      onSelectLead={id => {
                        setSelectedLeadFilterId(id);
                        if (id) selectBusiness(id);
                        setPage(1);
                      }}
                    />

                    <PipelineSearchDropdown
                      selectedPipeline={selectedPipeline}
                      options={data.pipelines} onSelectPipeline={pipe => {
                        setSelectedPipeline(pipe);
                        setPage(1);
                      }}
                    />

                    {(selectedLeadFilterId || selectedPipeline !== "all" || query) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLeadFilterId(null);
                          setSelectedPipeline("all");
                          setQuery("");
                          setPage(1);
                        }}
                        style={{
                          fontSize: "11px",
                          color: "#ef4444",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textDecoration: "underline",
                          padding: "4px"
                        }}
                      >
                        Reset filters
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {loading ? (
              <p className="dashboard-state" role="status">Loading activity…</p>
            ) : error || empty ? (
              <div className="prospects-empty">
                <EmptyIllustration />
                <p>{query.trim() || selectedLeadFilterId || selectedPipeline !== "all" ? "No matching results" : "No Available Prospects"}</p>
                {query.trim() || selectedLeadFilterId || selectedPipeline !== "all" ? (
                  <button type="button" onClick={() => {
                    setQuery("");
                    setSelectedLeadFilterId(null);
                    setSelectedPipeline("all");
                    setPage(1);
                  }}>Clear filter</button>
                ) : <button onClick={() => setIcpOpen(true)}>Click to create your ICP</button>}
              </div>
            ) : (
              <>
                <table className="business-table" role="grid" aria-label={view === "businesses" ? "Businesses" : "Outreach"}>
                  <tbody>
                    {paginatedList.map(item => {
                      const isSelected = "industry" in item ? selectedBusiness?.id === item.id : selectedOutreach?.id === item.id;
                      const selectRow = () => { if ("industry" in item) selectBusiness(item.id); else setSelectedOutreachId(item.id); };
                      const cells = "industry" in item ? businessCells(item) : [
                        [item.leadType === "individual" ? "Individual" : "Business", item.name], ["Channel", item.channel], ["Status", item.status],
                        ["Account Owner", item.owner], ["Created", item.created],
                      ];
                      return (
                        <tr
                          key={item.id}
                          className={isSelected ? "is-selected" : ""}
                          tabIndex={0}
                          aria-label={`View activity for ${item.name}`}
                          aria-selected={isSelected}
                          onClick={selectRow}
                          onKeyDown={event => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectRow();
                            }
                          }}
                        >
                          <td className="business-avatar-cell"><Avatar color={item.avatarColor} leadType={item.leadType} identity={item.name + item.id} /></td>
                          {cells.map(([label, value]) => (
                            <td key={label}>
                              <strong>{label}</strong>
                              <span title={value}>{value || "—"}</span>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

              </>
            )}
            </div>
            {!loading && !error && !empty && (
              <ProspectPagination alwaysShow page={page} totalItems={currentList.length} entityLabel={view === "businesses" ? "prospects" : "outreach"} setPage={setPage} />
            )}
          </div>
          <aside className="activity-overview" aria-label="Activity Overview" aria-live="polite">
            <h2 title={selectedOutreach?.name || selectedBusiness?.name}>Activity Overview</h2>
            <div className="activity-summary">
              <div><h3>No of Emails</h3><div className="activity-email"><strong>{number(selectedBusiness ? selectedBusiness.emailsSent : selectedOutreach ? (selectedOutreach.channel === "email" && ["sent", "delivered", "opened", "clicked"].includes(selectedOutreach.status.toLowerCase()) ? 1 : 0) : 0)}</strong><span>Sent</span></div></div>
              <div><h3>Company</h3><strong className="activity-company" title={selectedBusiness?.company}>{selectedBusiness?.company || "—"}</strong></div>
            </div>
            <div className="activity-stats">
              <div><Image src={asset("fa628.svg")} alt="" width={18} height={18} /><strong>{number(selectedBusiness ? selectedBusiness.prospects : selectedOutreach ? null : 0)}</strong><span>No of Prospects</span></div>
              <div><Image src={asset("fa628.svg")} alt="" width={18} height={18} /><strong>{number(selectedBusiness ? selectedBusiness.followUpsCompleted : selectedOutreach ? null : 0)}</strong><span>Follow-ups Completed</span></div>
            </div>
            <button type="button" disabled={!selectedBusiness && !selectedOutreach} className="open-accounts" onClick={() => setFullActivityOpen(true)}>View Full Activity</button>
          </aside>
        </div>
      </section>

      <IcpBuilderModal isOpen={icpOpen} onClose={() => setIcpOpen(false)} />
      {fullActivityOpen && (selectedBusiness || selectedOutreach) && (
        <div
          className="activity-history-overlay"
          onClick={() => setFullActivityOpen(false)}
        >
          <div
            className="activity-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-history-title"
            onKeyDown={e => { if (e.key === "Escape") setFullActivityOpen(false); }}
            onClick={e => e.stopPropagation()}
          >
            <div className="activity-history-header">
              <div><p className="activity-history-eyebrow">Outreach</p><h2 id="activity-history-title">Activity History</h2><p className="activity-history-company">{selectedOutreach?.name || selectedBusiness?.name}</p></div>
              <button
                type="button"
                onClick={() => setFullActivityOpen(false)}
                className="activity-history-close"
                aria-label="Close activity history"
                autoFocus
              >
                &times;
              </button>
            </div>

            <div className="activity-history-list">
              <OutreachActivityHistory key={`${selectedBusiness?.id}-${selectedOutreach?.id}`} businessId={selectedBusiness?.id} activity={selectedOutreach} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
