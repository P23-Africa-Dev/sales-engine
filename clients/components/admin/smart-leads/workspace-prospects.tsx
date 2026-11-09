"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { OnboardedBusiness, ProspectTier, SmartLead } from "@/lib/admin/smart-leads";
import { downloadCsvFile, toCsvContent } from "@/lib/crm/csv";

const TIERS = [
  { tier: "high", style: "high", title: "🔥 High-Level Priority", description: "Strong buying signals. Prioritize personalized outreach." },
  { tier: "middle", style: "mid", title: "⚡ Middle-Level Priority", description: "Good prospect fit and moderate buying signals. Nurture these accounts." },
  { tier: "low", style: "low", title: "💤 Low-Level Priority", description: "Baseline industry fit. Monitor for new buying signals." },
] as const;

const TRIGGERS = [
  { id: "hiring", label: "📈 Active Hiring Surges" },
  { id: "funding", label: "💰 Growth & Funding Rounds" },
  { id: "expansion", label: "🏢 Facility & Regional Expansion" },
  { id: "tenders", label: "📑 Public Procurement & Tenders" },
] as const;

interface WorkspaceProspectsProps {
  business: OnboardedBusiness;
  onOpenDossier: (prospect: SmartLead) => void;
  onEnroll: (prospects: SmartLead[]) => void;
}

export function WorkspaceProspects({ business: selectedBusiness, onOpenDossier, onEnroll }: WorkspaceProspectsProps) {
  const [selectedTier, setTier] = useState<"all" | ProspectTier>("all");
  const [prospectSearchQuery, setProspectSearchQuery] = useState("");
  const [signalTriggerFilter, setSignalTriggerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const selectedProspects = selectedBusiness.prospects.filter((prospect) => selectedProspectIds.includes(prospect.id));

  function setSelectedTier(tier: "all" | ProspectTier) {
    setTier(tier);
    setPage(1);
  }

  // Filtered Prospects on the Right for the selected business
  const filteredProspects = useMemo(() => {
    if (!selectedBusiness) return [];
    const q = prospectSearchQuery.trim().toLowerCase();

    return selectedBusiness.prospects.filter((lead) => {
      const matchesTier = selectedTier === "all" || lead.tier === selectedTier;

      const matchesQuery =
        !q ||
        lead.company.toLowerCase().includes(q) ||
        lead.industry.toLowerCase().includes(q) ||
        lead.location.toLowerCase().includes(q) ||
        lead.primaryContact.name.toLowerCase().includes(q) ||
        lead.intentTrigger.toLowerCase().includes(q) ||
        lead.techStack.some((t) => t.toLowerCase().includes(q));

      const matchesSignal =
        signalTriggerFilter === "all" ||
        (signalTriggerFilter === "hiring" && lead.matchedPresets.includes("hiring")) ||
        (signalTriggerFilter === "funding" && lead.matchedPresets.includes("funding")) ||
        (signalTriggerFilter === "expansion" && lead.matchedPresets.includes("expansion")) ||
        (signalTriggerFilter === "tenders" && lead.matchedPresets.includes("tenders"));

      return matchesTier && matchesQuery && matchesSignal;
    });
  }, [selectedBusiness, selectedTier, prospectSearchQuery, signalTriggerFilter]);

  const totalFilteredCount = filteredProspects.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedProspects = useMemo(() => {
    return filteredProspects.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [filteredProspects, safePage, pageSize]);

  function getPaginationPages(current: number, total: number) {
    if (total <= 5) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 3) {
      return [1, 2, 3, 4, "...", total];
    }
    if (current >= total - 2) {
      return [1, "...", total - 3, total - 2, total - 1, total];
    }
    return [1, "...", current - 1, current, current + 1, "...", total];
  }

  const allFilteredSelected =
    filteredProspects.length > 0 && filteredProspects.every((l) => selectedProspectIds.includes(l.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedProspectIds([]);
    } else {
      setSelectedProspectIds(filteredProspects.map((l) => l.id));
    }
  }

  function toggleSelectLead(id: string) {
    if (selectedProspectIds.includes(id)) {
      setSelectedProspectIds(selectedProspectIds.filter((item) => item !== id));
    } else {
      setSelectedProspectIds([...selectedProspectIds, id]);
    }
  }

  async function handleCopyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch {
      toast.error("Clipboard access is unavailable.");
    }
  }

  return (
    <>
      <div className="analytics-grid">
        <section className="chart-card tier-cards-card" aria-labelledby="intent-priority-heading">
          <div className="card-header">
            <div>
              <h3 id="intent-priority-heading">Intent Tiers & Priority</h3>
              <span className="card-subtitle-small">Prospects in the {selectedBusiness.company} workspace</span>
            </div>
            <span className="card-badge">Action Cadence</span>
          </div>
          <div className="tier-cards-stack">
            {TIERS.map(({ tier, style, title, description }) => {
              const prospects = selectedBusiness.prospects.filter((prospect) => prospect.tier === tier);
              const average = prospects.length
                ? Math.round(prospects.reduce((sum, prospect) => sum + prospect.fitScore, 0) / prospects.length)
                : null;
              return (
                <button type="button" key={tier}
                  className={`tier-highlight-box ${style}-box ${selectedTier === tier ? "is-active" : ""}`}
                  aria-pressed={selectedTier === tier}
                  onClick={() => setSelectedTier(selectedTier === tier ? "all" : tier)}>
                  <span className="tier-box-header">
                    <span className={`tier-tag ${style}-tag`}>{title}</span>
                    <strong>{prospects.length} accounts</strong>
                  </span>
                  <span className="tier-box-desc">{description}</span>
                  <span className="tier-box-footer">
                    <span>Avg Score: <strong>{average === null ? "—" : `${average}%`}</strong></span>
                    <span className="click-action-hint">Filter directory ➜</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="chart-card signals-breakdown-card" aria-labelledby="signals-breakdown-heading">
          <div className="card-header">
            <div>
              <h3 id="signals-breakdown-heading">Active Buying Signals Breakdown</h3>
              <span className="card-subtitle-small">Recorded triggers in the {selectedBusiness.company} workspace</span>
            </div>
            <span className="card-badge">{selectedBusiness.prospects.length} accounts</span>
          </div>
          <div className="signals-bars-list">
            {TRIGGERS.map(({ id, label }) => {
              const count = selectedBusiness.prospects.filter((prospect) => prospect.matchedPresets.includes(id)).length;
              return (
                <div className="signal-bar-item" key={id}>
                  <div className="signal-label-row"><span>{label}</span><strong>{count} accounts</strong></div>
                  <div className="signal-progress-track" aria-hidden="true">
                    <div className={`signal-progress-fill ${id}-fill animated-shimmer-bar`}
                      style={{ width: `${count / Math.max(1, selectedBusiness.prospects.length) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <section className="prospects-white-card" aria-label="Verified Account Prospects Directory">
        {/* White Component Header: Directory Title, Intent Tier Tabs & Search */}
        <div className="prospects-card-header">
          <div className="prospects-header-left">
            <div className="prospects-title-group">
              <h2>Verified Account Prospects</h2>
              <span className="prospects-count-badge">
                {filteredProspects.length} {filteredProspects.length === 1 ? "Account" : "Accounts"}
              </span>
            </div>

            <p className="profile-meta">Prospect directory for {selectedBusiness.company}.</p>

            {/* Intent Tier Filter Tabs */}
            <div className="prospects-tier-tabs" role="tablist" aria-label="Filter by Intent Tier">
              <button
                type="button"
                role="tab"
                aria-selected={selectedTier === "all"}
                className={`tier-tab-pill ${selectedTier === "all" ? "is-active" : ""}`}
                onClick={() => setSelectedTier("all")}
              >
                All Prospects ({selectedBusiness.prospects.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedTier === "high"}
                className={`tier-tab-pill tier-high ${selectedTier === "high" ? "is-active" : ""}`}
                onClick={() => setSelectedTier("high")}
              >
                🔥 High-Level ({selectedBusiness.prospects.filter((p) => p.tier === "high").length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedTier === "middle"}
                className={`tier-tab-pill tier-mid ${selectedTier === "middle" ? "is-active" : ""}`}
                onClick={() => setSelectedTier("middle")}
              >
                ⚡ Middle-Level ({selectedBusiness.prospects.filter((p) => p.tier === "middle").length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedTier === "low"}
                className={`tier-tab-pill tier-low ${selectedTier === "low" ? "is-active" : ""}`}
                onClick={() => setSelectedTier("low")}
              >
                💤 Low-Level ({selectedBusiness.prospects.filter((p) => p.tier === "low").length})
              </button>
            </div>
          </div>

          {/* Header Right: Real-time Search & Intent Trigger Selector */}
          <div className="prospects-header-right">
            <div className="prospects-search-box">
              <svg
                className="search-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={prospectSearchQuery}
                onChange={(e) => {
                  setProspectSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search company, decision maker, signal…"
                aria-label="Search prospects"
              />
              {prospectSearchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => {
                    setProspectSearchQuery("");
                    setPage(1);
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={signalTriggerFilter}
              onChange={(e) => {
                setSignalTriggerFilter(e.target.value);
                setPage(1);
              }}
              className="prospects-trigger-select"
              aria-label="Filter by signal trigger"
            >
              <option value="all">All Intent Triggers</option>
              <option value="hiring">📈 Active Hiring Surge</option>
              <option value="funding">💰 Recent Funding Round</option>
              <option value="expansion">🏢 Facility Expansion</option>
              <option value="tenders">📑 Public RFP / Tenders</option>
            </select>
          </div>
        </div>

        {/* Triage Sub-Bar: Bulk selection, Quick High-Intent selector & Rows per page */}
        <div className="prospects-triage-bar">
          <div className="triage-bar-left">
            <label className="table-checkbox-wrap">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                aria-label="Select all filtered prospects"
              />
              <span className="table-checkbox-label">
                Select All Filtered ({totalFilteredCount})
              </span>
            </label>
            {selectedProspectIds.length > 0 && (
              <span className="triage-selection-badge">
                {selectedProspectIds.length} {selectedProspectIds.length === 1 ? "account" : "accounts"} selected
              </span>
            )}
            <button
              type="button"
              className="triage-quick-btn"
              onClick={() =>
                setSelectedProspectIds(
                  filteredProspects.filter((l) => l.tier === "high").map((l) => l.id)
                )
              }
              title="Select all prospects with High Intent tier"
            >
              ⚡ Select High-Intent ({filteredProspects.filter((l) => l.tier === "high").length})
            </button>
            {selectedProspectIds.length > 0 && (
              <button
                type="button"
                className="triage-clear-btn"
                onClick={() => setSelectedProspectIds([])}
              >
                Clear Selection
              </button>
            )}
          </div>

          <div className="triage-bar-right">
            <div className="page-size-selector">
              <label htmlFor="prospect-page-size-select">Rows per page:</label>
              <select
                id="prospect-page-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={5}>5</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={20}>20</option>
              </select>
            </div>

            {selectedProspectIds.length > 0 && (
              <button
                type="button"
                className="triage-enroll-cta"
                onClick={() => onEnroll(selectedProspects)}
              >
                + Enroll Selected ({selectedProspectIds.length})
              </button>
            )}
          </div>
        </div>

        {/* Table Content or Empty State */}
        {filteredProspects.length === 0 ? (
          <div className="table-empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3>No prospects match your current criteria</h3>
            <p>Try resetting the intent tier, buying triggers, or keyword search.</p>
            <button
              type="button"
              className="empty-reset-btn"
              onClick={() => {
                setSelectedTier("all");
                setProspectSearchQuery("");
                setSignalTriggerFilter("all");
              }}
            >
              Reset Prospect Filters
            </button>
          </div>
        ) : (
          <div className="prospects-table-wrapper" role="region" aria-label="Scrollable prospect table" tabIndex={0}>
            <table className="prospects-white-table" role="grid" aria-label="Prospects Table">
              <thead>
                <tr>
                  <th className="th-check">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="th-company">
                    Company & Firmographics
                  </th>
                  <th className="th-signal">
                    Buying Signal & Trigger
                  </th>
                  <th className="th-contact">
                    Verified Decision Maker
                  </th>
                  <th className="th-fit">
                    Fit & Intent
                  </th>
                  <th className="th-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedProspects.map((prospect) => {
                  const isSelected = selectedProspectIds.includes(prospect.id);
                  const isHigh = prospect.tier === "high";
                  const isMid = prospect.tier === "middle";

                  return (
                    <tr
                      key={prospect.id}
                      className={`prospect-row ${isSelected ? "is-selected" : ""}`}
                      onClick={() => onOpenDossier(prospect)}
                      tabIndex={0}
                      aria-label={`View dossier for ${prospect.company}`}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onOpenDossier(prospect);
                        }
                      }}
                    >
                      {/* Multi-select Checkbox */}
                      <td className="td-check" onClick={(e) => e.stopPropagation()}>
                        <label className="table-checkbox-wrap">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectLead(prospect.id)}
                            aria-label={`Select ${prospect.company}`}
                          />
                        </label>
                      </td>

                      {/* Company Name, Letter Avatar & Firmographics */}
                      <td className="td-company">
                        <div className="company-cell-inner">
                          <div
                            className="company-avatar-box"
                            style={{ backgroundColor: prospect.primaryContact.avatarColor }}
                            aria-hidden="true"
                          >
                            {prospect.company.charAt(0)}
                          </div>
                          <div className="company-meta-col">
                            <div className="company-headline-row">
                              <strong className="company-name-text" title={prospect.company}>
                                {prospect.company}
                              </strong>
                              <span className="company-industry-tag" title={prospect.industry}>
                                {prospect.industry}
                              </span>
                            </div>
                            <p className="company-sub-meta" title={`${prospect.location} • ${prospect.employees} employees • ${prospect.revenue}`}>
                              {prospect.location} • {prospect.employees} employees • {prospect.revenue}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Real-time Buying Signal & Trigger */}
                      <td className="td-signal">
                        <div className="signal-cell-inner">
                          <div className="signal-trigger-row">
                            <span className="signal-icon">
                              {prospect.matchedPresets.includes("hiring") ? "🔥" :
                               prospect.matchedPresets.includes("funding") ? "💰" :
                               prospect.matchedPresets.includes("expansion") ? "🏢" : "📑"}
                            </span>
                            <strong className="signal-trigger-title" title={prospect.intentTrigger}>{prospect.intentTrigger}</strong>
                          </div>
                          <p className="signal-why-now" title={prospect.whyNow}>
                            {prospect.whyNow}
                          </p>
                        </div>
                      </td>

                      {/* Verified Decision Maker & 1-Click Copy */}
                      <td className="td-contact" onClick={(e) => e.stopPropagation()}>
                        <div className="contact-cell-inner">
                          <div className="contact-name-row">
                            <strong className="contact-name-text" title={prospect.primaryContact.name}>{prospect.primaryContact.name}</strong>
                            {prospect.primaryContact.verified && (
                              <span className="contact-verified-badge" title="Verified buyer contact">
                                ✓
                              </span>
                            )}
                          </div>
                          <span className="contact-title-text" title={prospect.primaryContact.title}>{prospect.primaryContact.title}</span>
                          <div className="contact-micro-actions">
                            <button
                              type="button"
                              className="contact-copy-pill"
                              onClick={() => handleCopyEmail(prospect.primaryContact.email)}
                              title="Click to copy email address"
                            >
                              ✉ {copiedEmail === prospect.primaryContact.email ? "Copied!" : "Email"}
                            </button>
                            <a
                              href={`https://${prospect.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="contact-website-link"
                              title="Open website"
                            >
                              Website ↗
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* Fit Score & Intent Tier Pill */}
                      <td className="td-fit">
                        <div className="fit-cell-inner">
                          <span
                            className={`table-fit-pill ${
                              isHigh ? "pill-high" : isMid ? "pill-mid" : "pill-low"
                            }`}
                          >
                            ⚡ {prospect.fitScore}% {isHigh ? "High" : isMid ? "Mid" : "Low"}
                          </span>
                          <span className="touches-count-text">
                            {prospect.activities.length} {prospect.activities.length === 1 ? "touchpoint" : "touchpoints"}
                          </span>
                        </div>
                      </td>

                      {/* Actions: View Dossier Drawer CTA & Sequence CTA */}
                      <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="actions-cell-inner">
                          <button
                            type="button"
                            className="table-drawer-cta-btn"
                            onClick={() => onOpenDossier(prospect)}
                            title="Open full prospect dossier in right slide-over drawer"
                          >
                            View Dossier ➜
                          </button>
                          <button
                            type="button"
                            className="table-sequence-cta-btn"
                            onClick={() => {
                              onEnroll([prospect]);
                            }}
                            title="Enroll this prospect into automated sequence"
                          >
                            + Sequence
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Proper Pagination Footer with Bottom-Right Sequence Launch CTA */}
        {filteredProspects.length > 0 && (
          <div className="prospects-table-pagination" role="navigation" aria-label="Prospects pagination">
            <div className="pagination-info-left">
              Showing <strong>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalFilteredCount)}</strong> of{" "}
              <strong>{totalFilteredCount}</strong> prospect accounts
            </div>

            <div className="pagination-controls-center">
              <button
                type="button"
                className="page-nav-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                aria-label="Previous page"
              >
                ‹ Prev
              </button>

              <div className="page-numbers-group">
                {getPaginationPages(safePage, totalPages).map((p, idx) =>
                  typeof p === "number" ? (
                    <button
                      key={p}
                      type="button"
                      className={`page-number-btn ${p === safePage ? "is-active" : ""}`}
                      onClick={() => setPage(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === safePage ? "page" : undefined}
                    >
                      {p}
                    </button>
                  ) : (
                    <span key={`ellipsis-${idx}`} className="page-ellipsis" aria-hidden="true">
                      …
                    </span>
                  )
                )}
              </div>

              <button
                type="button"
                className="page-nav-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                aria-label="Next page"
              >
                Next ›
              </button>
            </div>

            {/* Bottom Right CTA Button on Table: Opens Cadence Modal */}
            <div className="pagination-action-right">
              <button
                type="button"
                className="table-enroll-launch-btn"
                onClick={() => onEnroll(selectedProspects.length ? selectedProspects : paginatedProspects.slice(0, 1))}
                title="Launch outreach cadence sequence for prospects"
              >
                <span className="btn-lightning-glow">⚡</span>
                <span>
                  {selectedProspectIds.length > 0
                    ? `Enroll ${selectedProspectIds.length} ${selectedProspectIds.length === 1 ? "Prospect" : "Prospects"}`
                    : "Enroll 1 Prospect"}
                </span>
                <span className="btn-arrow">➜</span>
              </button>
            </div>
          </div>
        )}
      </section>
      {/* Sticky Bottom Action Bar for Bulk Outreach */}
      <aside
        className={`smart-leads-sticky-bar ${selectedProspectIds.length > 0 ? "is-active" : ""}`}
        inert={selectedProspectIds.length === 0}
      >
        <div className="sticky-bar-left">
          <div className="sticky-selection-count">
            <strong>{selectedProspectIds.length}</strong>
            <span>{selectedProspectIds.length === 1 ? "Lead" : "Leads"} Selected</span>
          </div>
          <span className="sticky-hint">
            Preview an outreach cadence for prospects from {selectedBusiness.company}.
          </span>
        </div>

        <div className="sticky-bar-actions">
          <button
            type="button"
            className="sticky-btn secondary"
            onClick={() => {
              const rows = selectedProspects.map((l) => [l.company, l.primaryContact.name, l.primaryContact.email]);
              downloadCsvFile(
                `${selectedBusiness.id}-smart-leads.csv`,
                toCsvContent(["Company", "Contact Name", "Email"], rows),
              );
            }}
          >
            Export Selected (CSV)
          </button>
          <button
            type="button"
            className="sticky-btn primary"
            onClick={() => onEnroll(selectedProspects)}
          >
            Enroll in Outbound Sequence ({selectedProspectIds.length})
          </button>
        </div>
      </aside>

    </>
  );
}
