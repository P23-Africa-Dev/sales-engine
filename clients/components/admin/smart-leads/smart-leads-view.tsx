"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ONBOARDED_BUSINESSES_DATA,
  getBusinessVelocityData,
  type SmartLead,
  type ProspectTier,
  type VelocityDayPoint,
} from "@/lib/admin/smart-leads";
import { downloadCsvFile, toCsvContent } from "@/lib/crm/csv";
import { toast } from "sonner";
import { ProspectDrawer, type ProspectNote } from "./prospect-drawer";

type BusinessSort = "prospects" | "fit" | "emails";

export function SmartLeadsView() {
  const businesses = ONBOARDED_BUSINESSES_DATA;
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>(businesses[0]?.id || "nord-tech");

  // Left-pane filters (Businesses)
  const [businessSearchQuery, setBusinessSearchQuery] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("all");
  const [businessSortBy, setBusinessSortBy] = useState<BusinessSort>("prospects");

  // Right-pane filters (Prospects under selected business)
  const [selectedTier, setTier] = useState<"all" | ProspectTier>("all");
  const [prospectSearchQuery, setProspectSearchQuery] = useState("");
  const [signalTriggerFilter, setSignalTriggerFilter] = useState<string>("all");

  // Table Pagination State
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(8);

  // Animated Charts State (Task 3)
  const [velocityMetric, setVelocityMetric] = useState<"touches" | "opens" | "meetings">("touches");
  const [hoveredVelocityPoint, setHoveredVelocityPoint] = useState<VelocityDayPoint | null>(null);
  const [hoveredDonutTier, setHoveredDonutTier] = useState<ProspectTier | null>(null);

  // Selection & bulk triage
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [drawerProspect, setDrawerProspect] = useState<SmartLead | null>(null);
  const [notesByProspect, setNotesByProspect] = useState<Record<string, ProspectNote[]>>({});
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState("enterprise-cadence");
  const [enrolledSuccess, setEnrolledSuccess] = useState<number | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  // Active business reference
  const selectedBusiness = useMemo(() => {
    return businesses.find((b) => b.id === selectedBusinessId) || businesses[0];
  }, [businesses, selectedBusinessId]);

  function selectBusiness(id: string) {
    if (id === selectedBusinessId) return;
    setSelectedBusinessId(id);
    setSelectedProspectIds([]);
    setTier("all");
    setProspectSearchQuery("");
    setSignalTriggerFilter("all");
    setPage(1);
    setHoveredVelocityPoint(null);
    setHoveredDonutTier(null);
    setDrawerProspect(null);
    setIsEnrollModalOpen(false);
    setEnrolledSuccess(null);
  }

  function setSelectedTier(tier: "all" | ProspectTier) {
    setTier(tier);
    setPage(1);
  }

  // Filtered Businesses on the Left
  const filteredBusinesses = useMemo(() => {
    const q = businessSearchQuery.trim().toLowerCase();
    return businesses
      .filter((b) => {
        const matchesQuery =
          !q ||
          b.company.toLowerCase().includes(q) ||
          b.name.toLowerCase().includes(q) ||
          b.industry.toLowerCase().includes(q) ||
          b.owner.toLowerCase().includes(q);

        const matchesIndustry =
          selectedIndustry === "all" || b.industry.toLowerCase() === selectedIndustry.toLowerCase();

        return matchesQuery && matchesIndustry;
      })
      .sort((a, b) => {
        if (businessSortBy === "prospects") return b.analytics.totalProspects - a.analytics.totalProspects;
        if (businessSortBy === "fit") return b.analytics.avgFitScore - a.analytics.avgFitScore;
        if (businessSortBy === "emails") return b.emailsSent - a.emailsSent;
        return 0;
      });
  }, [businesses, businessSearchQuery, selectedIndustry, businessSortBy]);

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

  // 14-Day Velocity data calculation for selected business
  const velocityData = useMemo(() => {
    return getBusinessVelocityData(selectedBusiness.id);
  }, [selectedBusiness.id]);

  const maxVelocityValue = useMemo(() => {
    return Math.max(...velocityData.map((d) => d[velocityMetric]), 1);
  }, [velocityData, velocityMetric]);

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

  function handleLaunchEnrollment() {
    const count = selectedProspectIds.length;
    setIsEnrollModalOpen(false);
    setEnrolledSuccess(count);
    setTimeout(() => {
      setEnrolledSuccess(null);
    }, 6000);
  }

  const distinctIndustries = useMemo(() => {
    const set = new Set<string>();
    businesses.forEach((b) => set.add(b.industry));
    return Array.from(set);
  }, [businesses]);

  return (
    <div className="smart-leads-container">
      {/* Top Banner: Engine Status & Overall Metrics */}
      <header className="smart-leads-header">
        <div>
          {/* <div className="smart-leads-badge">
            <span className="pulsing-dot" />
            Smart Leads Engine • Demo Data
          </div> */}
          <h1>Smart Leads Engine</h1>
          <p>
            Explore sample client businesses, compare their prospect pools by intent tier, and review account activity. Changes reset on refresh.
          </p>
        </div>
      </header>

      {/* Success Notification Banner */}
      {enrolledSuccess !== null && (
        <div className="enrollment-success-banner" role="status" aria-live="polite">
          <div className="success-icon">✓</div>
          <div className="success-text">
            <strong>Simulated enrollment for {enrolledSuccess} prospect accounts</strong>
            <p>
              Review sample outreach activity on the dashboard.
            </p>
          </div>
          <Link href="/admin" className="view-in-dashboard-btn">
            Open Outreach Dashboard ➜
          </Link>
        </div>
      )}

      {/* Main Left-to-Right Master-Detail Workspace */}
      <div className="smart-leads-workspace">
        {/* =========================================================================
            LEFT MASTER PANE: Onboarded Businesses Selector & Filters
           ========================================================================= */}
        <aside className="smart-leads-master-pane" aria-label="Onboarded Businesses List">
          <div className="pane-header-box">
            <div className="pane-title-row">
              <h2>Onboarded Businesses</h2>
              <span className="count-badge">{businesses.length} Active</span>
            </div>
            <p className="pane-subtitle">
              Select a business to view its tiered prospect intelligence and live account touches.
            </p>

            {/* Business Search Bar */}
            <div className="master-search-wrap">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={businessSearchQuery}
                onChange={(e) => setBusinessSearchQuery(e.target.value)}
                placeholder="Search businesses, owners, or industries…"
                aria-label="Search onboarded businesses"
              />
              {businessSearchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setBusinessSearchQuery("")}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Business Filter Controls */}
            <div className="master-filters-row">
              <div className="filter-select-wrap">
                <label htmlFor="industry-filter" className="sr-only">Industry</label>
                <select
                  id="industry-filter"
                  value={selectedIndustry}
                  onChange={(e) => setSelectedIndustry(e.target.value)}
                  className="master-filter-select"
                >
                  <option value="all">All Industries</option>
                  {distinctIndustries.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              <div className="filter-select-wrap">
                <label htmlFor="sort-filter" className="sr-only">Sort by</label>
                <select
                  id="sort-filter"
                  value={businessSortBy}
                  onChange={(e) => setBusinessSortBy(e.target.value as BusinessSort)}
                  className="master-filter-select"
                >
                  <option value="prospects">Sort: Prospects Pool</option>
                  <option value="fit">Sort: Avg Fit Score</option>
                  <option value="emails">Sort: Emails Sent</option>
                </select>
              </div>
            </div>
          </div>

          {/* Business Cards List */}
          <div className="business-cards-list" role="listbox" aria-label="Select an onboarded business">
            {filteredBusinesses.length === 0 ? (
              <div className="empty-master-state">
                <p>No onboarded businesses found matching your filter criteria.</p>
                <button
                  type="button"
                  className="reset-master-filter-btn"
                  onClick={() => {
                    setBusinessSearchQuery("");
                    setSelectedIndustry("all");
                  }}
                >
                  Reset Business Filters
                </button>
              </div>
            ) : (
              filteredBusinesses.map((b) => {
                const isSelected = b.id === selectedBusiness.id;
                const { analytics } = b;

                return (
                  <button
                    key={b.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`business-selector-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => selectBusiness(b.id)}
                  >
                    <div className="card-top-row">
                      <div className="biz-avatar" style={{ backgroundColor: b.avatarColor }}>
                        {b.company.charAt(0)}
                      </div>
                      <div className="biz-info">
                        <strong className="biz-company-name">{b.company}</strong>
                        <span className="biz-legal-name">{b.name}</span>
                        <div className="biz-meta-tags">
                          <span>{b.industry}</span>
                          <span>•</span>
                          <span>{b.country}</span>
                        </div>
                      </div>
                      {isSelected && <span className="active-dot-indicator" title="Currently selected" />}
                    </div>

                    {/* Micro-bar: High / Mid / Low Tier Distribution */}
                    <div className="biz-prospects-bar-wrap">
                      <div className="bar-labels">
                        <span className="total-pool-label">
                          <strong>{analytics.totalProspects}</strong> Prospects
                        </span>
                        <span className="tier-breakdown-mini">
                          <span className="text-high">{analytics.highTierCount} High</span>
                          {" / "}
                          <span className="text-mid">{analytics.middleTierCount} Mid</span>
                          {" / "}
                          <span className="text-low">{analytics.lowTierCount} Low</span>
                        </span>
                      </div>
                      <div className="mini-segmented-progress" aria-hidden="true">
                        <div
                          className="segment-high"
                          style={{ width: `${analytics.highTierPercent}%` }}
                          title={`High Intent: ${analytics.highTierPercent}%`}
                        />
                        <div
                          className="segment-mid"
                          style={{ width: `${analytics.middleTierPercent}%` }}
                          title={`Middle Intent: ${analytics.middleTierPercent}%`}
                        />
                        <div
                          className="segment-low"
                          style={{ width: `${analytics.lowTierPercent}%` }}
                          title={`Low Intent: ${analytics.lowTierPercent}%`}
                        />
                      </div>
                    </div>

                    {/* Email telemetry without repeating dashboard clutter */}
                    <div className="biz-card-footer">
                      <span className="biz-owner">Owner: {b.owner}</span>
                      <span className="biz-emails-count">
                        ✉ <strong>{b.emailsSent.toLocaleString()}</strong> sent
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* =========================================================================
            RIGHT DETAIL PANE: Selected Business Intelligence & Tiered Prospects
           ========================================================================= */}
        <section className="smart-leads-detail-pane" aria-label="Business Prospects and Analytics">
          {/* Selected Business Profile & Quick Telemetry Header */}
          <div className="business-profile-header">
            <div className="profile-main-info">
              <div className="profile-avatar" style={{ backgroundColor: selectedBusiness.avatarColor }}>
                {selectedBusiness.company.charAt(0)}
              </div>
              <div>
                <div className="profile-title-row">
                  <h1>{selectedBusiness.company}</h1>
                  <span className="industry-badge">{selectedBusiness.industry}</span>
                  <span className="country-badge">{selectedBusiness.country}</span>
                </div>
                <p className="profile-meta">
                  Managed by <strong>{selectedBusiness.owner}</strong> • Onboarded: {selectedBusiness.created} •{" "}
                  <a
                    href={`https://${selectedBusiness.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="website-link"
                  >
                    {selectedBusiness.website} ↗
                  </a>
                </p>
              </div>
            </div>

            {/* Clean Telemetry Cards (Keeps number of emails as is, no repetition of dashboard details) */}
            <div className="clean-telemetry-strip">
              <div className="telemetry-pill">
                <span className="telemetry-label">No of Emails</span>
                <strong className="telemetry-val">{selectedBusiness.emailsSent.toLocaleString()}</strong>
                <span className="telemetry-sub">Sent across cadences</span>
              </div>
              <div className="telemetry-pill highlight">
                <span className="telemetry-label">Prospects Pool</span>
                <strong className="telemetry-val">{selectedBusiness.analytics.totalProspects}</strong>
                <span className="telemetry-sub text-purple">Verified ICP Accounts</span>
              </div>
              <div className="telemetry-pill">
                <span className="telemetry-label">Avg AI Fit Score</span>
                <strong className="telemetry-val">{selectedBusiness.analytics.avgFitScore}%</strong>
                <span className="telemetry-sub text-mint">Buying Intent Match</span>
              </div>
              <div className="telemetry-pill">
                <span className="telemetry-label">Meetings Booked</span>
                <strong className="telemetry-val">{selectedBusiness.analytics.meetingsBooked}</strong>
                <span className="telemetry-sub">From Smart Leads</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
              ANALYTICS & CHARTS SECTION: Animated Charts & Velocity Analytics (Task 3)
             ========================================================================= */}
          <section className="prospect-analytics-section" aria-label="Prospect Analytics and Tier Distribution">
            <div className="analytics-grid">
              {/* 1. Animated Donut Chart & Dual Radial Gauges Card */}
              <div className="chart-card donut-chart-card">
                <div className="card-header">
                  <div>
                    <h3>Prospect Tier Distribution</h3>
                    <span className="card-subtitle-small">Intent Quality & Verified Contact Reach</span>
                  </div>
                  <span className="card-badge pulse-badge">Live Signals</span>
                </div>

                <div className="donut-and-legend">
                  {/* Interactive Animated SVG Donut Chart */}
                  <div className="svg-donut-wrap">
                    <svg viewBox="0 0 120 120" className="donut-svg animated-donut" aria-hidden="true">
                      {/* Base Track */}
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        fill="transparent"
                        stroke="#031f26"
                        strokeWidth="14"
                      />
                      {/* High Tier Segment (Purple) */}
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        fill="transparent"
                        stroke="#c974f4"
                        strokeWidth="14"
                        strokeDasharray={`${(selectedBusiness.analytics.highTierPercent * 282.7) / 100} 282.7`}
                        strokeDashoffset="0"
                        strokeLinecap="round"
                        transform="rotate(-90 60 60)"
                        className={`donut-anim-segment high-segment ${hoveredDonutTier === "high" ? "is-hovered" : ""}`}
                        onMouseEnter={() => setHoveredDonutTier("high")}
                        onMouseLeave={() => setHoveredDonutTier(null)}
                      />
                      {/* Middle Tier Segment (Amber) */}
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        fill="transparent"
                        stroke="#f59e0b"
                        strokeWidth="14"
                        strokeDasharray={`${(selectedBusiness.analytics.middleTierPercent * 282.7) / 100} 282.7`}
                        strokeDashoffset={`-${(selectedBusiness.analytics.highTierPercent * 282.7) / 100}`}
                        strokeLinecap="round"
                        transform="rotate(-90 60 60)"
                        className={`donut-anim-segment mid-segment ${hoveredDonutTier === "middle" ? "is-hovered" : ""}`}
                        onMouseEnter={() => setHoveredDonutTier("middle")}
                        onMouseLeave={() => setHoveredDonutTier(null)}
                      />
                      {/* Low Tier Segment (Slate) */}
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        fill="transparent"
                        stroke="#64748b"
                        strokeWidth="14"
                        strokeDasharray={`${(selectedBusiness.analytics.lowTierPercent * 282.7) / 100} 282.7`}
                        strokeDashoffset={`-${((selectedBusiness.analytics.highTierPercent + selectedBusiness.analytics.middleTierPercent) * 282.7) / 100}`}
                        strokeLinecap="round"
                        transform="rotate(-90 60 60)"
                        className={`donut-anim-segment low-segment ${hoveredDonutTier === "low" ? "is-hovered" : ""}`}
                        onMouseEnter={() => setHoveredDonutTier("low")}
                        onMouseLeave={() => setHoveredDonutTier(null)}
                      />
                    </svg>

                    {/* Donut Center Rollup Stat */}
                    <div className="donut-center-stat animated-stat">
                      <strong>
                        {hoveredDonutTier === "high"
                          ? selectedBusiness.analytics.highTierCount
                          : hoveredDonutTier === "middle"
                          ? selectedBusiness.analytics.middleTierCount
                          : hoveredDonutTier === "low"
                          ? selectedBusiness.analytics.lowTierCount
                          : selectedBusiness.analytics.totalProspects}
                      </strong>
                      <span>
                        {hoveredDonutTier === "high"
                          ? "High Intent"
                          : hoveredDonutTier === "middle"
                          ? "Mid Intent"
                          : hoveredDonutTier === "low"
                          ? "Low Intent"
                          : "Total Pool"}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Legend that filters the table below */}
                  <div className="donut-legend-list">
                    <button
                      type="button"
                      className={`legend-item-btn ${selectedTier === "high" ? "is-active" : ""}`}
                      onClick={() => setSelectedTier(selectedTier === "high" ? "all" : "high")}
                      onMouseEnter={() => setHoveredDonutTier("high")}
                      onMouseLeave={() => setHoveredDonutTier(null)}
                    >
                      <span className="legend-color-dot dot-high animated-pulse-dot" />
                      <div className="legend-text">
                        <strong>High-Level ({selectedBusiness.analytics.highTierPercent}%)</strong>
                        <span>{selectedBusiness.analytics.highTierCount} accounts • Score ≥ 90%</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`legend-item-btn ${selectedTier === "middle" ? "is-active" : ""}`}
                      onClick={() => setSelectedTier(selectedTier === "middle" ? "all" : "middle")}
                      onMouseEnter={() => setHoveredDonutTier("middle")}
                      onMouseLeave={() => setHoveredDonutTier(null)}
                    >
                      <span className="legend-color-dot dot-mid animated-pulse-dot" />
                      <div className="legend-text">
                        <strong>Middle-Level ({selectedBusiness.analytics.middleTierPercent}%)</strong>
                        <span>{selectedBusiness.analytics.middleTierCount} accounts • Score 70–89%</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`legend-item-btn ${selectedTier === "low" ? "is-active" : ""}`}
                      onClick={() => setSelectedTier(selectedTier === "low" ? "all" : "low")}
                      onMouseEnter={() => setHoveredDonutTier("low")}
                      onMouseLeave={() => setHoveredDonutTier(null)}
                    >
                      <span className="legend-color-dot dot-low" />
                      <div className="legend-text">
                        <strong>Low-Level ({selectedBusiness.analytics.lowTierPercent}%)</strong>
                        <span>{selectedBusiness.analytics.lowTierCount} accounts • Score &lt; 70%</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Micro Animated Radial Gauges */}
                <div className="dual-radial-gauges">
                  <div className="radial-gauge-item">
                    <div className="gauge-svg-wrap">
                      <svg viewBox="0 0 64 64" className="gauge-svg">
                        <circle cx="32" cy="32" r="26" fill="transparent" stroke="#042028" strokeWidth="6" />
                        <circle
                          cx="32"
                          cy="32"
                          r="26"
                          fill="transparent"
                          stroke="#2ae9c9"
                          strokeWidth="6"
                          strokeDasharray={`${(selectedBusiness.analytics.avgFitScore * 163.3) / 100} 163.3`}
                          strokeDashoffset="0"
                          strokeLinecap="round"
                          transform="rotate(-90 32 32)"
                          className="radial-gauge-anim-mint"
                        />
                      </svg>
                      <span className="gauge-center-text">{selectedBusiness.analytics.avgFitScore}%</span>
                    </div>
                    <div className="gauge-label-col">
                      <strong>AI Fit Average</strong>
                      <span>Buying signal velocity</span>
                    </div>
                  </div>

                  <div className="radial-gauge-item">
                    <div className="gauge-svg-wrap">
                      <svg viewBox="0 0 64 64" className="gauge-svg">
                        <circle cx="32" cy="32" r="26" fill="transparent" stroke="#042028" strokeWidth="6" />
                        <circle
                          cx="32"
                          cy="32"
                          r="26"
                          fill="transparent"
                          stroke="#c974f4"
                          strokeWidth="6"
                          strokeDasharray={`${(selectedBusiness.analytics.verifiedContactRate * 163.3) / 100} 163.3`}
                          strokeDashoffset="0"
                          strokeLinecap="round"
                          transform="rotate(-90 32 32)"
                          className="radial-gauge-anim-purple"
                        />
                      </svg>
                      <span className="gauge-center-text">{selectedBusiness.analytics.verifiedContactRate}%</span>
                    </div>
                    <div className="gauge-label-col">
                      <strong>Verified Contacts</strong>
                      <span>Direct email & phone</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. NEW: Animated 14-Day Outreach Touches & Cadence Velocity Chart */}
              <div className="chart-card velocity-chart-card">
                <div className="card-header">
                  <div>
                    <h3>14-Day Cadence Velocity & Touches</h3>
                    <span className="card-subtitle-small">Outreach interaction touches across automated cadences</span>
                  </div>
                  {/* Metric Switcher Tabs */}
                  <div className="velocity-metric-tabs" role="tablist" aria-label="Velocity Metric Selector">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={velocityMetric === "touches"}
                      className={`velocity-tab-btn ${velocityMetric === "touches" ? "is-active" : ""}`}
                      onClick={() => setVelocityMetric("touches")}
                    >
                      All Touches
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={velocityMetric === "opens"}
                      className={`velocity-tab-btn ${velocityMetric === "opens" ? "is-active" : ""}`}
                      onClick={() => setVelocityMetric("opens")}
                    >
                      Opens & Reads
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={velocityMetric === "meetings"}
                      className={`velocity-tab-btn ${velocityMetric === "meetings" ? "is-active" : ""}`}
                      onClick={() => setVelocityMetric("meetings")}
                    >
                      Meetings Sync
                    </button>
                  </div>
                </div>

                {/* Animated Bars Container */}
                <div className="velocity-bars-container" role="region" aria-label="Daily touch activity bars">
                  <div className="velocity-bars-row">
                    {velocityData.map((pt, idx) => {
                      const val = pt[velocityMetric];
                      const heightPercent = Math.max(14, Math.round((val / maxVelocityValue) * 100));
                      const isHovered = hoveredVelocityPoint?.day === pt.day;

                      return (
                        <div
                          key={pt.day}
                          className={`velocity-bar-col ${isHovered ? "is-hovered" : ""}`}
                          onMouseEnter={() => setHoveredVelocityPoint(pt)}
                          onMouseLeave={() => setHoveredVelocityPoint(null)}
                          style={{ "--bar-index": idx } as React.CSSProperties}
                        >
                          <div className="bar-track-wrap">
                            <div
                              className={`velocity-bar-fill fill-${velocityMetric}`}
                              style={{
                                height: `${heightPercent}%`,
                                animationDelay: `${idx * 40}ms`,
                              }}
                            >
                              {val > 0 && <span className="bar-val-bubble">{val}</span>}
                            </div>
                          </div>
                          <span className="bar-day-label">{pt.dayLabel}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Dynamic Tooltip on Hover */}
                  {hoveredVelocityPoint && (
                    <div className="velocity-floating-tooltip" role="tooltip">
                      <div className="tooltip-header">
                        <strong>{hoveredVelocityPoint.day} ({hoveredVelocityPoint.dayLabel})</strong>
                        <span className="tooltip-stat-badge">{hoveredVelocityPoint.touches} Touches</span>
                      </div>
                      <div className="tooltip-metrics-row">
                        <span>✉ Opens: <strong>{hoveredVelocityPoint.opens}</strong> ({Math.round((hoveredVelocityPoint.opens / (hoveredVelocityPoint.touches || 1)) * 100)}%)</span>
                        <span>💬 Replies: <strong>{hoveredVelocityPoint.replies}</strong></span>
                        <span>📅 Meetings: <strong>{hoveredVelocityPoint.meetings}</strong></span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Velocity Telemetry Footer */}
                <div className="velocity-footer-strip">
                  <div className="velocity-mini-stat">
                    <span className="stat-label">14-Day Volume</span>
                    <strong className="stat-num">
                      {velocityData.reduce((acc, curr) => acc + curr.touches, 0)} touches
                    </strong>
                  </div>
                  <div className="velocity-mini-stat">
                    <span className="stat-label">Daily Avg</span>
                    <strong className="stat-num text-mint">
                      {Math.round(velocityData.reduce((acc, curr) => acc + curr.touches, 0) / 14)} / day
                    </strong>
                  </div>
                  <div className="velocity-mini-stat">
                    <span className="stat-label">Avg Open Rate</span>
                    <strong className="stat-num text-purple">
                      {Math.round(
                        (velocityData.reduce((acc, curr) => acc + curr.opens, 0) /
                          Math.max(1, velocityData.reduce((acc, curr) => acc + curr.touches, 0))) *
                          100
                      )}%
                    </strong>
                  </div>
                  <div className="velocity-mini-stat">
                    <span className="stat-label">Direct Meetings</span>
                    <strong className="stat-num text-amber">
                      +{velocityData.reduce((acc, curr) => acc + curr.meetings, 0)} booked
                    </strong>
                  </div>
                </div>
              </div>

              {/* 3. Tier Action Priority Cards with Hover Glow */}
              <div className="chart-card tier-cards-card">
                <div className="card-header">
                  <div>
                    <h3>Intent Tiers & Priority</h3>
                    <span className="card-subtitle-small">Engagement recommendation</span>
                  </div>
                  <span className="card-badge">Action Cadence</span>
                </div>

                <div className="tier-cards-stack">
                  {/* High Tier Card */}
                  <div
                    className={`tier-highlight-box high-box ${selectedTier === "high" ? "is-active" : ""}`}
                    onClick={() => setSelectedTier(selectedTier === "high" ? "all" : "high")}
                    role="button"
                    tabIndex={0}
                    aria-label="Filter high intent accounts"
                  >
                    <div className="tier-box-header">
                      <span className="tier-tag high-tag">🔥 High-Level Priority</span>
                      <strong>{selectedBusiness.analytics.highTierCount} Accounts</strong>
                    </div>
                    <p className="tier-box-desc">
                      Active hiring surges, verified funding rounds, or tender publications. Prime for multi-touch cadences.
                    </p>
                    <div className="tier-box-footer">
                      <span>Avg Score: <strong>94%</strong></span>
                      <span className="click-action-hint">Click to filter ➜</span>
                    </div>
                  </div>

                  {/* Middle Tier Card */}
                  <div
                    className={`tier-highlight-box mid-box ${selectedTier === "middle" ? "is-active" : ""}`}
                    onClick={() => setSelectedTier(selectedTier === "middle" ? "all" : "middle")}
                    role="button"
                    tabIndex={0}
                    aria-label="Filter middle intent accounts"
                  >
                    <div className="tier-box-header">
                      <span className="tier-tag mid-tag">⚡ Middle-Level Priority</span>
                      <strong>{selectedBusiness.analytics.middleTierCount} Accounts</strong>
                    </div>
                    <p className="tier-box-desc">
                      Solid ICP firmographic fit with moderate triggers. Recommended for personalized nurture sequences.
                    </p>
                    <div className="tier-box-footer">
                      <span>Avg Score: <strong>81%</strong></span>
                      <span className="click-action-hint">Click to filter ➜</span>
                    </div>
                  </div>

                  {/* Low Tier Card */}
                  <div
                    className={`tier-highlight-box low-box ${selectedTier === "low" ? "is-active" : ""}`}
                    onClick={() => setSelectedTier(selectedTier === "low" ? "all" : "low")}
                    role="button"
                    tabIndex={0}
                    aria-label="Filter low intent accounts"
                  >
                    <div className="tier-box-header">
                      <span className="tier-tag low-tag">💤 Low-Level Priority</span>
                      <strong>{selectedBusiness.analytics.lowTierCount} Accounts</strong>
                    </div>
                    <p className="tier-box-desc">
                      Baseline industry match; currently dormant signals. Best suited for automated cold check-ins.
                    </p>
                    <div className="tier-box-footer">
                      <span>Avg Score: <strong>64%</strong></span>
                      <span className="click-action-hint">Click to filter ➜</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Buying Signals Breakdown with Animated Shimmer Tracks */}
              <div className="chart-card signals-breakdown-card">
                <div className="card-header">
                  <div>
                    <h3>Active Buying Signals Breakdown</h3>
                    <span className="card-subtitle-small">Market triggers detected across real-time scrapers</span>
                  </div>
                  <span className="card-badge pulse-badge">{selectedBusiness.analytics.buyingSignalsCount} Live Triggers</span>
                </div>

                <div className="signals-bars-list">
                  <div className="signal-bar-item">
                    <div className="signal-label-row">
                      <span>📈 Active Hiring Surges</span>
                      <strong>{selectedBusiness.analytics.signalBreakdown.hiring} accounts</strong>
                    </div>
                    <div className="signal-progress-track">
                      <div
                        className="signal-progress-fill hiring-fill animated-shimmer-bar"
                        style={{
                          width: `${(selectedBusiness.analytics.signalBreakdown.hiring / Math.max(1, selectedBusiness.analytics.buyingSignalsCount)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="signal-bar-item">
                    <div className="signal-label-row">
                      <span>💰 Growth & Funding Rounds</span>
                      <strong>{selectedBusiness.analytics.signalBreakdown.funding} accounts</strong>
                    </div>
                    <div className="signal-progress-track">
                      <div
                        className="signal-progress-fill funding-fill animated-shimmer-bar"
                        style={{
                          width: `${(selectedBusiness.analytics.signalBreakdown.funding / Math.max(1, selectedBusiness.analytics.buyingSignalsCount)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="signal-bar-item">
                    <div className="signal-label-row">
                      <span>🏢 Facility & Regional Expansion</span>
                      <strong>{selectedBusiness.analytics.signalBreakdown.expansion} accounts</strong>
                    </div>
                    <div className="signal-progress-track">
                      <div
                        className="signal-progress-fill expansion-fill animated-shimmer-bar"
                        style={{
                          width: `${(selectedBusiness.analytics.signalBreakdown.expansion / Math.max(1, selectedBusiness.analytics.buyingSignalsCount)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="signal-bar-item">
                    <div className="signal-label-row">
                      <span>📑 Public Procurement & Tenders</span>
                      <strong>{selectedBusiness.analytics.signalBreakdown.tenders} accounts</strong>
                    </div>
                    <div className="signal-progress-track">
                      <div
                        className="signal-progress-fill tenders-fill animated-shimmer-bar"
                        style={{
                          width: `${(selectedBusiness.analytics.signalBreakdown.tenders / Math.max(1, selectedBusiness.analytics.buyingSignalsCount)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* =========================================================================
              WHITE TABLE COMPONENT: Paginated Prospects Directory with Drawer CTAs
             ========================================================================= */}
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
                    onClick={() => setIsEnrollModalOpen(true)}
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
              <div className="prospects-table-wrapper">
                <table className="prospects-white-table" role="grid" aria-label="Prospects Table">
                  <thead>
                    <tr>
                      <th className="th-check" style={{ width: "46px" }}>
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="th-company" style={{ width: "27%" }}>
                        Company & Firmographics
                      </th>
                      <th className="th-signal" style={{ width: "25%" }}>
                        Buying Signal & Trigger
                      </th>
                      <th className="th-contact" style={{ width: "20%" }}>
                        Verified Decision Maker
                      </th>
                      <th className="th-fit" style={{ width: "13%" }}>
                        Fit & Intent
                      </th>
                      <th className="th-actions" style={{ width: "15%", textAlign: "right" }}>
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
                          onClick={() => setDrawerProspect(prospect)}
                          tabIndex={0}
                          aria-label={`View dossier for ${prospect.company}`}
                          onKeyDown={(e) => {
                            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                              e.preventDefault();
                              setDrawerProspect(prospect);
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
                                  <strong className="company-name-text">
                                    {prospect.company}
                                  </strong>
                                  <span className="company-industry-tag">
                                    {prospect.industry}
                                  </span>
                                </div>
                                <p className="company-sub-meta">
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
                                <strong className="signal-trigger-title">{prospect.intentTrigger}</strong>
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
                                <strong className="contact-name-text">{prospect.primaryContact.name}</strong>
                                {prospect.primaryContact.verified && (
                                  <span className="contact-verified-badge" title="Verified buyer contact">
                                    ✓
                                  </span>
                                )}
                              </div>
                              <span className="contact-title-text">{prospect.primaryContact.title}</span>
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
                                onClick={() => setDrawerProspect(prospect)}
                                title="Open full prospect dossier in right slide-over drawer"
                              >
                                View Dossier ➜
                              </button>
                              <button
                                type="button"
                                className="table-sequence-cta-btn"
                                onClick={() => {
                                  setSelectedProspectIds([prospect.id]);
                                  setIsEnrollModalOpen(true);
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
                    onClick={() => {
                      if (selectedProspectIds.length === 0) {
                        const defaultId = paginatedProspects[0]?.id || filteredProspects[0]?.id;
                        if (defaultId) {
                          setSelectedProspectIds([defaultId]);
                        }
                      }
                      setIsEnrollModalOpen(true);
                    }}
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
        </section>
      </div>

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
            Ready to be enrolled into automated sales cadences for {selectedBusiness.company}.
          </span>
        </div>

        <div className="sticky-bar-actions">
          <button
            type="button"
            className="sticky-btn secondary"
            onClick={() => {
              const rows = selectedBusiness.prospects
                .filter((l) => selectedProspectIds.includes(l.id))
                .map((l) => [l.company, l.primaryContact.name, l.primaryContact.email]);
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
            onClick={() => setIsEnrollModalOpen(true)}
          >
            Enroll in Outbound Sequence ({selectedProspectIds.length})
          </button>
        </div>
      </aside>

      {/* Full Dossier Activity Drawer for an Individual Prospect Account */}
      {drawerProspect && (
        <ProspectDrawer
          key={drawerProspect.id}
          onClose={() => setDrawerProspect(null)}
          prospect={drawerProspect}
          notes={notesByProspect[drawerProspect.id] ?? []}
          onAddNote={(note) => {
            setNotesByProspect((previous) => ({
              ...previous,
              [drawerProspect.id]: [note, ...(previous[drawerProspect.id] ?? [])],
            }));
          }}
          onEnroll={(p) => {
            setSelectedProspectIds([p.id]);
            setIsEnrollModalOpen(true);
          }}
        />
      )}

      {/* Cadence Enrollment Modal */}
      {isEnrollModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsEnrollModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cadence-modal-title"
        >
          <div
            className="modal-content cadence-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "540px" }}
          >
            <div className="cadence-icon-wrap">⚡</div>
            <h3 id="cadence-modal-title">Enroll {selectedProspectIds.length} Prospect{selectedProspectIds.length === 1 ? "" : "s"}</h3>
            <p className="cadence-modal-desc">
              Select an outreach cadence to preview enrollment for{" "}
              <strong>{selectedBusiness.company}</strong>.
            </p>

            <div className="sequence-selector-list">
              {[
                {
                  id: "enterprise-cadence",
                  title: "Enterprise Multi-Touch Cadence",
                  badge: "Email • Phone • Social",
                  desc: "4-step sequence over 12 days. High personalization with buying intent trigger references.",
                },
                {
                  id: "in-person-intro",
                  title: "In-Person Executive Sync Sequence",
                  badge: "Targeted Outreach",
                  desc: "Focused on securing face-to-face meetings and commercial demos for top-tier decision makers.",
                },
                {
                  id: "fast-track",
                  title: "High-Intent Fast-Track Cadence",
                  badge: "Rapid 3-Day Cycle",
                  desc: "Direct outreach for accounts with urgent hiring or funding signals within the last 14 days.",
                },
              ].map((seq) => (
                <label
                  key={seq.id}
                  className={`sequence-option ${selectedSequence === seq.id ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="cadence-sequence"
                    value={seq.id}
                    checked={selectedSequence === seq.id}
                    onChange={() => setSelectedSequence(seq.id)}
                  />
                  <div className="seq-content">
                    <div className="seq-header">
                      <strong>{seq.title}</strong>
                      <span className="seq-badge">{seq.badge}</span>
                    </div>
                    <p>{seq.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={() => setIsEnrollModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-confirm-btn"
                onClick={handleLaunchEnrollment}
              >
                Simulate Enrollment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cadence Success Toast Feedback */}
      {enrolledSuccess !== null && (
        <div className="cadence-success-toast" role="status" aria-live="polite">
          <div className="toast-icon">✓</div>
          <div className="toast-text">
            <strong>Enrollment Preview Complete</strong>
            <span>
              {enrolledSuccess} {enrolledSuccess === 1 ? "prospect" : "prospects"} selected for the{" "}
              <em>
                {selectedSequence === "enterprise-cadence"
                  ? "Enterprise Multi-Touch Cadence"
                  : selectedSequence === "in-person-intro"
                  ? "In-Person Executive Sync Sequence"
                  : "High-Intent Fast-Track Cadence"}
              </em> for {selectedBusiness.company}.
            </span>
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => setEnrolledSuccess(null)}
            aria-label="Dismiss toast"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
