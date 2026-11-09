"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { toast } from "sonner";
import type { KeyBusinessAccount } from "@/lib/admin/key-business-accounts";
import type { OnboardedBusiness, SmartLead } from "@/lib/admin/smart-leads";
import { ProspectDrawer, type ProspectNote } from "./prospect-drawer";
import { WorkspaceProspects } from "./workspace-prospects";

const ACCOUNT_LIMIT = 15;

const SORT_OPTIONS = {
  relevance: "Relevance",
  fit: "Fit score",
  value: "Opportunity value",
  signals: "Buyer signals",
} as const;

const TOUCH_METRICS = {
  touches: "All touch points",
  opens: "Email opens",
  meetings: "Meetings",
} as const;

const SEQUENCES = [
  { id: "enterprise-cadence", title: "Enterprise Multi-Touch Cadence", description: "Email, phone, and social outreach over 12 days." },
  { id: "in-person-intro", title: "In-Person Executive Sync Sequence", description: "Face-to-face meetings and commercial demos." },
  { id: "fast-track", title: "High-Intent Fast-Track Cadence", description: "A three-day outreach sequence for urgent signals." },
];

function signalCount(account: KeyBusinessAccount) {
  return account.onlineEvidence.length + account.offlineEvidence.length;
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

export function SmartLeadsView({ accounts, businesses }: {
  accounts: KeyBusinessAccount[];
  businesses: OnboardedBusiness[];
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [client, setClient] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<keyof typeof SORT_OPTIONS>("relevance");
  const [metric, setMetric] = useState<keyof typeof TOUCH_METRICS>("touches");
  const [drawer, setDrawer] = useState<SmartLead | null>(null);
  const [enrollment, setEnrollment] = useState<SmartLead[]>([]);
  const [enrollmentCount, setEnrollmentCount] = useState(0);
  const [notes, setNotes] = useState<Record<string, ProspectNote[]>>({});
  const [sequence, setSequence] = useState(SEQUENCES[0].id);
  const detailPane = useRef<HTMLElement>(null);

  const clients = [...new Map(accounts.map((account) => [account.businessId, account.client]))];
  const sources = [...new Set(accounts.flatMap((account) => account.sources))].sort();
  const search = query.trim().toLowerCase();
  const matching = accounts.filter((account) =>
    (client === "all" || account.businessId === client) &&
    (source === "all" || account.sources.some((entry) => entry === source)) &&
    [account.company, account.lead?.industry, account.lead?.location, account.contactName, account.client]
      .some((value) => value?.toLowerCase().includes(search)),
  );
  if (sort === "fit") matching.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));
  if (sort === "value") matching.sort((a, b) => b.opportunityValue - a.opportunityValue);
  if (sort === "signals") matching.sort((a, b) => signalCount(b) - signalCount(a));

  const shortlist = matching.slice(0, ACCOUNT_LIMIT);
  const selected = shortlist.find((account) => account.id === selectedId) ?? shortlist[0];
  const activeAccountId = selected?.id;
  const workspace = businesses.find((business) => business.id === selected?.businessId);
  const lead = selected?.lead;
  const meetingsBooked = lead?.activities.filter(
    (activity) => activity.type === "meeting" && ["Confirmed", "Completed"].includes(activity.status),
  ).length;

  useEffect(() => {
    if (detailPane.current) detailPane.current.scrollTop = 0;
  }, [activeAccountId]);

  function resetFilters() {
    setQuery("");
    setClient("all");
    setSource("all");
    setSort("relevance");
  }

  return (
    <div className="smart-leads-container key-accounts">
      <header className="smart-leads-header">
        {/* <div className="smart-leads-badge"><span className="pulsing-dot" /> Sample data</div> */}
        <h1>Smart Leads Engine</h1>
        <p>Prioritize business prospects using CRM opportunities, lead fit, and buying signals from Social Listening.</p>
      </header>
      {enrollmentCount > 0 && (
        <div className="enrollment-success-banner" role="status">
          <div className="success-icon" aria-hidden="true">✓</div>
          <div className="success-text">
            <strong>Simulated enrollment for {enrollmentCount} {enrollmentCount === 1 ? "prospect" : "prospects"}</strong>
            <p>Review sample outreach activity on the dashboard.</p>
          </div>
          <Link href="/admin" className="view-in-dashboard-btn">Open Outreach Dashboard ➜</Link>
        </div>
      )}

      <div className="smart-leads-workspace">
        <aside className="smart-leads-master-pane" aria-labelledby="key-accounts-heading">
          <div className="pane-header-box">
            <div className="pane-title-row">
              <h2 id="key-accounts-heading">Key Business Accounts</h2>
              <span className="count-badge">{shortlist.length} of {matching.length}</span>
            </div>
            <p className="pane-subtitle">Explore up to {ACCOUNT_LIMIT} ranked prospects across your client workspaces.</p>
            <div className="master-search-wrap">
              <Search size={14} className="search-icon" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search key business accounts"
                placeholder="Search company, industry, or contact…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="master-filters-row account-filters">
              <select aria-label="Client workspace" className="master-filter-select" value={client} onChange={(event) => setClient(event.target.value)}>
                <option value="all">All clients</option>
                {clients.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <select aria-label="Account source" className="master-filter-select" value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="all">All sources</option>
                {sources.map((item) => <option key={item}>{item}</option>)}
              </select>
              <select aria-label="Sort accounts" className="master-filter-select" value={sort} onChange={(event) => setSort(event.target.value as keyof typeof SORT_OPTIONS)}>
                {Object.entries(SORT_OPTIONS).map(([value, label]) => <option key={value} value={value}>Sort: {label}</option>)}
              </select>
            </div>
          </div>
          {shortlist.length ? (
            <ul className="business-cards-list">
              {shortlist.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    aria-pressed={selected.id === account.id}
                    className={`business-selector-card ${selected.id === account.id ? "is-selected" : ""}`}
                    onClick={() => {
                      setSelectedId(account.id);
                      setDrawer(null);
                      setEnrollment([]);
                      setEnrollmentCount(0);
                    }}
                  >
                    <span className="card-top-row">
                      <span className="biz-avatar" aria-hidden="true" style={{ backgroundColor: account.lead?.primaryContact.avatarColor ?? "#2ae9c9" }}>
                        {account.company.charAt(0)}
                      </span>
                      <span className="biz-info">
                        <strong className="biz-company-name">{account.company}</strong>
                        <span className="biz-legal-name">{account.lead?.industry ?? account.client}</span>
                      </span>
                      {selected.id === account.id && <span className="active-dot-indicator" aria-hidden="true" />}
                    </span>
                    <span className="account-card-meta">
                      <span>{account.client} · {account.sources.join(" · ")}</span>
                      <strong>{account.fitScore === null ? "Fit unavailable" : `${account.fitScore}% fit`} · {signalCount(account)} signals{account.opportunityLabel && ` · ${account.opportunityLabel} opportunity`}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-master-state">
              <p>No key accounts match your filters.</p>
              <button type="button" className="reset-master-filter-btn" onClick={resetFilters}>Reset filters</button>
            </div>
          )}
        </aside>

        {selected ? (
          <section ref={detailPane} className="smart-leads-detail-pane" aria-label="Selected business account" tabIndex={0}>
            <div className="business-profile-header">
              <div className="profile-main-info">
                <div className="profile-avatar" aria-hidden="true" style={{ backgroundColor: selected.lead?.primaryContact.avatarColor ?? "#2ae9c9" }}>
                  {selected.company.charAt(0)}
                </div>
                <div>
                  <div className="profile-title-row">
                    <h2>{selected.company}</h2>
                    {selected.lead && <span className="industry-badge">{selected.lead.industry}</span>}
                    {selected.stage && <span className="country-badge">{selected.stage}</span>}
                  </div>
                  <p className="profile-meta">{selected.description ?? "Business description unavailable."}</p>
                  <p className="profile-meta">
                    Client: <strong>{selected.client}</strong>
                    {selected.lead?.website && <> · <a className="website-link" href={`https://${selected.lead.website}`} target="_blank" rel="noreferrer">{selected.lead.website} ↗</a></>}
                  </p>
                </div>
              </div>
              <dl className="clean-telemetry-strip">
                <div className="telemetry-pill telemetry-emails">
                  <dt className="telemetry-label">Emails Sent</dt>
                  <dd className="telemetry-val">{selected.emailsSent ?? "—"}</dd>
                  <dd className="telemetry-sub">Recorded email touches</dd>
                </div>
                <div className="telemetry-pill telemetry-prospects">
                  <dt className="telemetry-label">Prospects Pool</dt>
                  <dd className="telemetry-val">{workspace?.prospects.length ?? "—"}</dd>
                  <dd className="telemetry-sub">Prospects in the {selected.client} directory</dd>
                </div>
                <div className="telemetry-pill telemetry-fit">
                  <dt className="telemetry-label">Average Fit Score</dt>
                  <dd className="telemetry-val">{formatPercent(selected.fitScore)}</dd>
                  <dd className="telemetry-sub">Recorded prospect fit</dd>
                </div>
                <div className="telemetry-pill telemetry-meetings">
                  <dt className="telemetry-label">Meetings Booked</dt>
                  <dd className="telemetry-val">{meetingsBooked ?? "—"}</dd>
                  <dd className="telemetry-sub">Confirmed or completed meetings for this account</dd>
                </div>
              </dl>
              <dl className="account-engagement-rates">
                <div title="Share of tracked emails opened or acted on">
                  <dt>Average Open Rate</dt>
                  <dd>{formatPercent(selected.averageOpenRate)}</dd>
                </div>
                <div title="Share of email touches with clicks, replies, acceptances, or signatures">
                  <dt>Engagement Rate</dt>
                  <dd>{formatPercent(selected.engagementRate)}</dd>
                </div>
              </dl>
            </div>

            <div className="analytics-grid">
              <section className="chart-card donut-chart-card" aria-labelledby="buyer-signal-heading">
                <div className="card-header">
                  <div>
                    <h3 id="buyer-signal-heading">Buyer Signal</h3>
                    <span className="card-subtitle-small">Share of classified buying signals</span>
                  </div>
                  <span className="card-badge">{signalCount(selected)} signals</span>
                </div>
                <div className="donut-and-legend">
                  <div className="svg-donut-wrap" aria-hidden="true">
                    <svg viewBox="0 0 120 120" className="donut-svg animated-donut">
                      <circle cx="60" cy="60" r="45" fill="none" stroke="#294650" strokeWidth="14" />
                      {selected.onlinePercent !== null && <>
                        <circle cx="60" cy="60" r="45" fill="none" stroke="#f59e0b" strokeWidth="14" />
                        <circle cx="60" cy="60" r="45" fill="none" stroke="#c974f4" strokeWidth="14" pathLength="100"
                          strokeDasharray={`${selected.onlinePercent} 100`} transform="rotate(-90 60 60)" />
                      </>}
                    </svg>
                    <div className="donut-center-stat"><strong>{signalCount(selected)}</strong><span>Signals</span></div>
                  </div>
                  <div className="donut-legend-list">
                    {[
                      { label: "Online Signals", percent: selected.onlinePercent, count: selected.onlineEvidence.length, color: "dot-high" },
                      { label: "Offline Signals", percent: selected.offlinePercent, count: selected.offlineEvidence.length, color: "dot-mid" },
                    ].map((signal) => (
                      <div className="legend-item-btn account-signal-legend" key={signal.label}>
                        <span className={`legend-color-dot ${signal.color}`} aria-hidden="true" />
                        <div className="legend-text">
                          <strong>{signal.label} ({formatPercent(signal.percent)})</strong>
                          <span>{signal.count} recorded</span>
                        </div>
                      </div>
                    ))}
                    {selected.onlinePercent === null && <p className="card-subtitle-small">No classified signals for this account yet.</p>}
                  </div>
                </div>
                <div className="dual-radial-gauges">
                  <AccountGauge label="Average Fit Score" value={selected.fitScore} color="#2ae9c9" detail="Selected prospect fit" />
                  <AccountGauge label="Verified Contacts"
                    value={selected.lead ? Number(selected.lead.primaryContact.verified) * 100 : null}
                    color="#c974f4" detail="Selected prospect's primary contact" />
                </div>
              </section>

              <section className="chart-card velocity-chart-card" aria-labelledby="touch-points-heading">
                <div className="card-header account-touch-header">
                  <div>
                    <h3 id="touch-points-heading">Touch Points</h3>
                    <span className="card-subtitle-small">14-day activity in the sample snapshot</span>
                  </div>
                  <div className="velocity-metric-tabs" role="group" aria-label="Touch point metric">
                    {Object.entries(TOUCH_METRICS).map(([key, label]) => (
                      <button type="button" key={key} aria-pressed={metric === key}
                        className={`velocity-tab-btn ${metric === key ? "is-active" : ""}`}
                        onClick={() => setMetric(key as keyof typeof TOUCH_METRICS)}>{label}</button>
                    ))}
                  </div>
                </div>
                <TouchPoints account={selected} metric={metric} />
              </section>
            </div>

            {workspace && (
              <WorkspaceProspects key={workspace.id} business={workspace} onOpenDossier={setDrawer} onEnroll={setEnrollment} />
            )}
          </section>
        ) : <section className="smart-leads-detail-pane account-empty" aria-label="Selected business account">Adjust your filters to find an account.</section>}
      </div>

      {drawer && (
        <ProspectDrawer key={drawer.id} prospect={drawer}
          onClose={() => setDrawer(null)}
          notes={notes[drawer.id] ?? []}
          onAddNote={(note) => setNotes((previous) => ({ ...previous, [drawer.id]: [note, ...(previous[drawer.id] ?? [])] }))}
          onEnroll={(prospect) => setEnrollment([prospect])}
        />
      )}

      {enrollment.length > 0 && (
        <div className="modal-overlay" onClick={() => setEnrollment([])}>
          <div className="modal-content cadence-modal-content" role="dialog" aria-modal="true" aria-labelledby="cadence-modal-title"
            onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") setEnrollment([]); }}>
            <h3 id="cadence-modal-title">Preview enrollment</h3>
            <p className="cadence-modal-desc">Select an outreach cadence for <strong>{enrollment.length === 1 ? enrollment[0].company : `${enrollment.length} prospects`}</strong>.</p>
            <div className="sequence-selector-list">
              {SEQUENCES.map((item) => (
                <label key={item.id} className={`sequence-option ${sequence === item.id ? "is-selected" : ""}`}>
                  <input type="radio" name="cadence-sequence" value={item.id} checked={sequence === item.id} onChange={() => setSequence(item.id)} />
                  <span className="seq-content"><strong>{item.title}</strong><span>{item.description}</span></span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="modal-cancel-btn" onClick={() => setEnrollment([])}>Cancel</button>
              <button type="button" className="modal-confirm-btn" onClick={() => {
                const scope = enrollment.length === 1 ? enrollment[0].company : `${enrollment.length} prospects`;
                toast.success(`Simulated enrollment for ${scope}`, {
                  description: SEQUENCES.find((item) => item.id === sequence)?.title,
                });
                setEnrollmentCount(enrollment.length);
                setEnrollment([]);
              }}>Simulate Enrollment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountGauge({ label, value, detail, color }: {
  label: string;
  value: number | null;
  detail: string;
  color: string;
}) {
  return (
    <div className="radial-gauge-item">
      <div className="gauge-svg-wrap">
        <svg viewBox="0 0 64 64" className="gauge-svg" aria-hidden="true">
          <circle cx="32" cy="32" r="26" fill="none" stroke="#294650" strokeWidth="6" />
          <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6" pathLength="100"
            strokeDasharray={`${value ?? 0} 100`} transform="rotate(-90 32 32)" />
        </svg>
        <span className="gauge-center-text">{formatPercent(value)}</span>
      </div>
      <div className="gauge-label-col"><strong>{label}</strong><span>{detail}</span></div>
    </div>
  );
}

function TouchPoints({ account, metric }: { account: KeyBusinessAccount; metric: keyof typeof TOUCH_METRICS }) {
  const max = Math.max(1, ...account.daily.map((day) => day[metric]));
  const total = account.daily.reduce((sum, day) => sum + day[metric], 0);
  return (
    <>
      <div className="velocity-bars-container">
        <div className="velocity-bars-row" role="list" aria-label={TOUCH_METRICS[metric]}>
          {account.daily.map((point) => (
            <div className="velocity-bar-col" key={point.day} role="listitem"
              aria-label={`${point.day === 0 ? "Today" : `${point.day} days ago`}: ${point[metric]}`} title={String(point[metric])}>
              <div className="bar-track-wrap" aria-hidden="true">
                <div className={`velocity-bar-fill fill-${metric}`} style={{ height: `${point[metric] / max * 100}%` }} />
              </div>
              <span className="bar-day-label" aria-hidden="true">{point.day === 0 ? "Now" : `−${point.day}`}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="velocity-footer-strip">
        <div className="velocity-mini-stat">
          <span className="stat-label">14-day total</span>
          <strong className="stat-num">{total}</strong>
        </div>
        <div className="velocity-mini-stat">
          <span className="stat-label">Daily average</span>
          <strong className="stat-num">{(total / account.daily.length).toFixed(1)}</strong>
        </div>
        <div className="velocity-mini-stat">
          <span className="stat-label">Average Open Rate</span>
          <strong className="stat-num">{formatPercent(account.averageOpenRate)}</strong>
        </div>
        <div className="velocity-mini-stat">
          <span className="stat-label">Direct Meetings</span>
          <strong className="stat-num">{account.daily.reduce((sum, day) => sum + day.meetings, 0)}</strong>
        </div>
      </div>
    </>
  );
}
