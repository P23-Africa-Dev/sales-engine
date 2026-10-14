"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  Filter,
  Layers3,
  Search,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  CRM_BUSINESSES,
  CRM_INITIAL_AUDIT,
  CRM_RECORDS,
  CRM_SNAPSHOT,
  CRM_SOURCES,
  CRM_STAGES,
  dateLabel,
  isOpen,
  isOverdue,
  isStale,
  issuesFor,
  money,
  type CrmAudit,
  type CrmBusiness,
  type CrmIssue,
  type CrmRecord,
} from "@/lib/admin-crm";
import { CrmCharts } from "./crm-charts";
import { CrmRecordDrawer } from "./crm-record-drawer";
type View =
  "Overview" | "Client pipelines" | "Records" | "Data quality" | "Activity log";
const tabs = [
  { name: "Overview", icon: TrendingUp },
  { name: "Client pipelines", icon: Layers3 },
  { name: "Records", icon: Database },
  { name: "Data quality", icon: ShieldCheck },
  { name: "Activity log", icon: Activity },
] as const;
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`sl-badge sl-${tone}`}>{children}</span>;
}
export function AdminCrmView() {
  const [records, setRecords] = useState(CRM_RECORDS);
  const [businesses, setBusinesses] = useState(CRM_BUSINESSES);
  const [audit, setAudit] = useState(CRM_INITIAL_AUDIT);
  const [view, setView] = useState<View>("Overview");
  const [scope, setScope] = useState("all");
  const [selectedBusiness, setSelectedBusiness] = useState(
    CRM_BUSINESSES[0].id,
  );
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [source, setSource] = useState("all");
  const [visibility, setVisibility] = useState("active");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [issueFilter, setIssueFilter] = useState<CrmIssue | "all">("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const scopedBusinesses = businesses.filter(
    (b) => scope === "all" || b.id === scope,
  );
  const scoped = records.filter(
    (r) => scope === "all" || r.businessId === scope,
  );
  const active = scoped.filter((r) => !r.archived);
  const open = active.filter(isOpen);
  const won = active.filter((r) => r.stage === "Won");
  const lost = active.filter((r) => r.stage === "Lost");
  const flagged = active.filter((r) => issuesFor(r).length > 0);
  const overdue = active.filter(isOverdue);
  const name = (id: string) => businesses.find((b) => b.id === id)?.name ?? id;
  const business =
    businesses.find((b) => b.id === selectedBusiness) ?? businesses[0];
  const businessRecords = records.filter(
    (r) => r.businessId === business.id && !r.archived,
  );
  const detail = records.find((r) => r.id === detailId);
  const policy = businesses.find((b) => b.id === policyId);
  function log(
    businessId: string,
    action: string,
    text: string,
    recordId?: string,
  ) {
    setAudit((entries) => [
      {
        id: crypto.randomUUID(),
        businessId,
        recordId,
        action,
        detail: text,
        actor: "Kwame Smith",
        date:
          new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Africa/Lagos",
          }).format(new Date()) + " WAT",
      },
      ...entries,
    ]);
  }
  function setTab(next: View) {
    setView(next);
    setQuery("");
    setStage("all");
    setSource("all");
    setSelected([]);
    setBulkReason("");
    setPage(1);
    setIssueFilter("all");
  }
  function changeScope(id: string) {
    setScope(id);
    if (id !== "all") setSelectedBusiness(id);
    setSelected([]);
    setPage(1);
    setDetailId(null);
  }
  function inspectBusiness(id: string) {
    changeScope(id);
    setSelectedBusiness(id);
    setTab("Client pipelines");
  }
  function inspectStage(next: string) {
    setTab("Records");
    setVisibility("active");
    setStage(next);
  }
  function filterChanged() {
    setPage(1);
    setSelected([]);
  }
  const filtered = scoped
    .filter(
      (r) =>
        r.archived === (visibility === "archived") &&
        (stage === "all" || r.stage === stage) &&
        (source === "all" || r.source === source) &&
        `${r.company} ${r.contact} ${r.owner} ${r.id} ${name(r.businessId)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "value" ? b.value - a.value : b.created.localeCompare(a.created),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const safePage = Math.min(page, pages);
  const pageRecords = filtered.slice((safePage - 1) * 6, safePage * 6);
  function archiveRecords(ids: string[], reason: string) {
    if (!reason.trim()) return;
    setRecords((items) =>
      items.map((r) =>
        ids.includes(r.id) ? { ...r, archived: visibility !== "archived" } : r,
      ),
    );
    records
      .filter((r) => ids.includes(r.id))
      .forEach((r) =>
        log(
          r.businessId,
          visibility === "archived" ? "Record restored" : "Record archived",
          reason,
          r.id,
        ),
      );
    setSelected([]);
    setBulkReason("");
    setNotice(
      `${ids.length} records ${visibility === "archived" ? "restored" : "archived"} in this demo.`,
    );
  }
  function saveRecord(draft: CrmRecord, reason: string) {
    setRecords((items) =>
      items.map((r) =>
        r.id === draft.id
          ? {
              ...r,
              owner: draft.owner,
              stage: draft.stage,
              email: draft.email,
              updated: CRM_SNAPSHOT,
              due:
                draft.stage === "Won" || draft.stage === "Lost"
                  ? null
                  : draft.due,
            }
          : r,
      ),
    );
    log(
      draft.businessId,
      "Record corrected",
      `Owner: ${draft.owner || "Unassigned"} · Stage: ${draft.stage} · Email: ${draft.email || "Missing"}. ${reason}`,
      draft.id,
    );
    setNotice(`${draft.id} updated. Demo changes saved to the activity log.`);
    setDetailId(null);
  }
  function updateRecord(
    id: string,
    change: Partial<CrmRecord>,
    action: string,
    reason: string,
  ) {
    const record = records.find((r) => r.id === id);
    if (!record) return;
    setRecords((items) =>
      items.map((r) =>
        r.id === id ? { ...r, ...change, updated: CRM_SNAPSHOT } : r,
      ),
    );
    log(record.businessId, action, reason, id);
    setNotice(`${action} for ${id}. Demo change only.`);
  }
  function exportRecords() {
    const rows = [
      [
        "ID",
        "Client business",
        "Company",
        "Contact",
        "Email",
        "Owner",
        "Stage",
        "Source",
        "Estimated value EUR",
        "Archived",
      ],
      ...filtered.map((r) => [
        r.id,
        name(r.businessId),
        r.company,
        r.contact,
        r.email,
        r.owner,
        r.stage,
        r.source,
        String(r.value),
        String(r.archived),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "admin-crm-demo-records.csv";
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${filtered.length} records from the current filters.`);
  }
  return (
    <div className="sl-root crm-root">
      <header className="sl-page-head">
        <div>
          <h1>
            CRM<span>.</span>
          </h1>
          <p>
            A clearer view of every client’s pipeline. A stronger grip on the
            details.
          </p>
        </div>
        <div className="sl-head-note">
          <span className="sl-demo">Demo data</span> Admin workspace
          <small>Snapshot · 13 Oct 2026</small>
        </div>
      </header>
      <div className="sl-context">
        <div>
          <Building2 size={17} />
          <label htmlFor="crm-scope">Business scope</label>
          <select
            id="crm-scope"
            value={scope}
            onChange={(e) => changeScope(e.target.value)}
          >
            <option value="all">All client businesses</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <span>Local demo changes · refresh resets the workspace</span>
      </div>
      <nav className="sl-tabs" aria-label="Admin CRM views">
        {tabs.map(({ name: tab, icon: Icon }) => (
          <button
            key={tab}
            aria-current={view === tab ? "page" : undefined}
            className={view === tab ? "active" : ""}
            onClick={() => setTab(tab)}
          >
            <Icon size={16} />
            {tab}
            {tab === "Data quality" && <span>{flagged.length}</span>}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="sl-notice" role="status">
          <Check size={16} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {view === "Overview" && (
        <>
          <div className="sl-metrics">
            {[
              {
                label: "CLIENT WORKSPACES",
                value: String(scopedBusinesses.length),
                note: `${active.length} active CRM records`,
                icon: Building2,
              },
              {
                label: "OPEN PIPELINE",
                value: money(
                  open.reduce((sum, r) => sum + r.value, 0),
                  true,
                ),
                note: `${open.length} deals · illustrative EUR value`,
                icon: TrendingUp,
              },
              {
                label: "CLOSED WIN RATE",
                value: `${won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0}%`,
                note: `${won.length} won / ${won.length + lost.length} closed deals`,
                icon: Check,
              },
              {
                label: "RECORDS TO REVIEW",
                value: String(flagged.length),
                note: `${overdue.length} overdue client follow-ups`,
                icon: CircleAlert,
              },
            ].map(({ label, value, note, icon: Icon }) => (
              <div className="sl-metric" key={label}>
                <div>
                  {label}
                  <Icon size={18} />
                </div>
                <strong>{value}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <CrmCharts
            key={scope}
            records={active}
            businesses={scopedBusinesses}
            onBusiness={inspectBusiness}
            onStage={inspectStage}
          />
          <section className="sl-panel">
            <div className="sl-panel-head">
              <div>
                <h2>Client portfolio health</h2>
                <p>
                  Pipeline exposure, ownership gaps, and follow-ups at a glance.
                </p>
              </div>
              <button
                className="sl-text-button"
                onClick={() => setTab("Data quality")}
              >
                Review data quality <ArrowRight size={15} />
              </button>
            </div>
            <div className="sl-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client business</th>
                    <th>Open value</th>
                    <th>Open records</th>
                    <th>Data quality</th>
                    <th>Overdue</th>
                    <th>Workspace</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedBusinesses.map((b) => {
                    const items = active.filter((r) => r.businessId === b.id);
                    const count = items.filter(
                      (r) => issuesFor(r).length > 0,
                    ).length;
                    return (
                      <tr key={b.id}>
                        <td>
                          <div className="sl-client-identity">
                            <span className="sl-monogram">
                              {b.name
                                .split(" ")
                                .map((w) => w[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <div>
                              <strong>{b.name}</strong>
                              <small>{b.owner}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {money(
                            items
                              .filter(isOpen)
                              .reduce((sum, r) => sum + r.value, 0),
                          )}
                        </td>
                        <td>{items.filter(isOpen).length}</td>
                        <td>
                          <Pill tone={count ? "amber" : "mint"}>
                            {count ? `${count} flagged` : "Healthy"}
                          </Pill>
                        </td>
                        <td>{items.filter(isOverdue).length}</td>
                        <td>
                          <button onClick={() => inspectBusiness(b.id)}>
                            Inspect <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="sl-footnote">
              Open value excludes won, lost, and archived records. Win rate is
              won / (won + lost). Data quality counts flagged records once, even
              when they have several issues.
            </p>
          </section>
        </>
      )}
      {view === "Client pipelines" && (
        <div className="sl-business-workspace">
          <aside className="sl-panel sl-business-list">
            <div className="sl-panel-head">
              <h2>Client pipelines</h2>
              <Pill>{businesses.length}</Pill>
            </div>
            <div className="sl-search">
              <Search size={16} />
              <input
                aria-label="Search client pipelines"
                placeholder="Find a client or owner…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {businesses
              .filter((b) =>
                `${b.name} ${b.owner}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((b) => (
                <button
                  key={b.id}
                  className={`sl-business-item ${business.id === b.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedBusiness(b.id);
                    changeScope(b.id);
                  }}
                >
                  <span className="sl-monogram">
                    {b.name
                      .split(" ")
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <strong>{b.name}</strong>
                    <small>{b.owner}</small>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))}
            {!businesses.some((b) =>
              `${b.name} ${b.owner}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && <p className="sl-empty">No clients match this search.</p>}
          </aside>
          <section className="sl-panel">
            <div className="sl-panel-head">
              <div>
                <h2>{business.name}</h2>
                <p>
                  {business.pipeline} · {business.industry}
                </p>
              </div>
              <button onClick={() => setPolicyId(business.id)}>
                <Settings2 size={15} /> Review policy
              </button>
            </div>
            <div className="crm-client-stats">
              <div>
                <small>OPEN VALUE</small>
                <strong>
                  {money(
                    businessRecords
                      .filter(isOpen)
                      .reduce((sum, r) => sum + r.value, 0),
                  )}
                </strong>
              </div>
              <div>
                <small>ASSIGNED RECORDS</small>
                <strong>
                  {businessRecords.filter((r) => r.owner).length}/
                  {businessRecords.length}
                </strong>
              </div>
              <div>
                <small>STALE DEALS</small>
                <strong>
                  {businessRecords.filter((r) => isStale(r, business)).length}
                  <small>After {business.staleDays} days</small>
                </strong>
              </div>
            </div>
            <div className="crm-pipeline-strip">
              {CRM_STAGES.map((stageName) => {
                const items = businessRecords.filter(
                  (r) => r.stage === stageName,
                );
                return (
                  <button
                    key={stageName}
                    onClick={() => {
                      changeScope(business.id);
                      inspectStage(stageName);
                    }}
                  >
                    <span>{stageName}</span>
                    <strong>{items.length}</strong>
                    <small>
                      {money(
                        items.reduce((sum, r) => sum + r.value, 0),
                        true,
                      )}
                    </small>
                  </button>
                );
              })}
            </div>
            <div className="sl-subhead">
              <h3>Client team</h3>
              <Pill>{business.team.length} members</Pill>
            </div>
            <div className="crm-team">
              {business.team.map((owner) => (
                <div key={owner}>
                  <Users size={16} />
                  <strong>{owner}</strong>
                  <span>
                    {businessRecords.filter((r) => r.owner === owner).length}{" "}
                    records
                  </span>
                </div>
              ))}
            </div>
            <div className="sl-subhead">
              <h3>Records needing attention</h3>
            </div>
            {businessRecords
              .filter(
                (r) =>
                  isOverdue(r) || isStale(r, business) || issuesFor(r).length,
              )
              .map((r) => (
                <button
                  key={r.id}
                  className="sl-mini-signal"
                  onClick={() => setDetailId(r.id)}
                >
                  <div>
                    <strong>{r.company}</strong>
                    <small>
                      {r.contact} · {r.owner || "Unassigned"}
                    </small>
                  </div>
                  <Pill tone="amber">
                    {issuesFor(r)[0] ?? (isOverdue(r) ? "Overdue" : "Stale")}
                  </Pill>
                  <ChevronRight size={15} />
                </button>
              ))}
            {!businessRecords.some(
              (r) =>
                isOverdue(r) || isStale(r, business) || issuesFor(r).length,
            ) && (
              <div className="sl-empty">
                No attention items for this client.
              </div>
            )}
            <p className="sl-footnote">
              Stages are snapshots, not a funnel conversion rate. Review policy
              determines stale-deal flags; it does not contact clients or change
              their automations.
            </p>
          </section>
        </div>
      )}
      {view === "Records" && (
        <section className="sl-panel">
          <div className="sl-panel-head">
            <div>
              <h2>CRM record registry</h2>
              <p>
                Inspect client-owned records, assignments, and pipeline stages.
              </p>
            </div>
            <button onClick={exportRecords}>
              <ArrowDownToLine size={16} /> Export filtered records
            </button>
          </div>
          <div className="sl-filters">
            <div className="sl-search">
              <Search size={16} />
              <input
                aria-label="Search CRM records"
                placeholder="Search company, contact, owner, or ID…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  filterChanged();
                }}
              />
            </div>
            <select
              aria-label="Filter CRM stage"
              value={stage}
              onChange={(e) => {
                setStage(e.target.value);
                filterChanged();
              }}
            >
              <option value="all">All stages</option>
              {CRM_STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter CRM source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                filterChanged();
              }}
            >
              <option value="all">All sources</option>
              {CRM_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Record visibility"
              value={visibility}
              onChange={(e) => {
                setVisibility(e.target.value);
                filterChanged();
              }}
            >
              <option value="active">Active records</option>
              <option value="archived">Archived records</option>
            </select>
            <select
              aria-label="Sort CRM records"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                filterChanged();
              }}
            >
              <option value="newest">Newest first</option>
              <option value="value">Highest value</option>
            </select>
          </div>
          {selected.length > 0 && (
            <div className="sl-bulk">
              <strong>{selected.length} selected</strong>
              <input
                aria-label="Bulk archive reason"
                placeholder="Reason for this management action…"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
              />
              <button
                disabled={!bulkReason.trim()}
                onClick={() => archiveRecords(selected, bulkReason)}
              >
                <Archive size={15} />
                {visibility === "archived"
                  ? "Restore selected"
                  : "Archive selected"}
              </button>
              <button onClick={() => setSelected([])}>Clear</button>
            </div>
          )}
          <div className="sl-table-wrap">
            <table className="crm-record-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all filtered CRM records"
                      checked={
                        filtered.length > 0 &&
                        filtered.every((r) => selected.includes(r.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? filtered.map((r) => r.id) : [],
                        )
                      }
                    />
                  </th>
                  <th>Record / client</th>
                  <th>Owner</th>
                  <th>Stage</th>
                  <th>Estimated value</th>
                  <th>Quality</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.id}`}
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, r.id]
                              : ids.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{r.company}</strong>
                      <small>{r.contact}</small>
                      <span className="sl-client-label">
                        {name(r.businessId)} · {r.id}
                      </span>
                    </td>
                    <td>
                      {r.owner || "Unassigned"}
                      <small>{r.source}</small>
                    </td>
                    <td>
                      <Pill tone={r.stage === "Won" ? "mint" : "neutral"}>
                        {r.stage}
                      </Pill>
                      <small>
                        {r.archived
                          ? "Archived"
                          : r.due
                            ? `Due ${dateLabel(r.due)}`
                            : "No follow-up due"}
                      </small>
                    </td>
                    <td>{money(r.value)}</td>
                    <td>
                      {issuesFor(r).length ? (
                        <Pill tone="amber">{issuesFor(r).length} issues</Pill>
                      ) : (
                        <Pill tone="mint">
                          {r.archived ? "Archived" : "Clear"}
                        </Pill>
                      )}
                    </td>
                    <td>
                      <button onClick={() => setDetailId(r.id)}>
                        Inspect <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <div className="sl-empty">
              <Database size={30} />
              <h3>No records match these filters</h3>
              <p>Choose another stage, source, or search term.</p>
              <button
                onClick={() => {
                  setQuery("");
                  setStage("all");
                  setSource("all");
                  setVisibility("active");
                  filterChanged();
                }}
              >
                Reset filters
              </button>
            </div>
          )}
          <div className="sl-pagination">
            <span>
              {filtered.length
                ? `${(safePage - 1) * 6 + 1}–${Math.min(safePage * 6, filtered.length)}`
                : "0"}{" "}
              of {filtered.length} records
            </span>
            <div>
              <button
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </button>
              <span>
                {safePage} / {pages}
              </span>
              <button
                disabled={safePage === pages}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
      {view === "Data quality" && (
        <section className="sl-panel">
          <div className="sl-panel-head">
            <div>
              <h2>Data quality review</h2>
              <p>
                Resolve gaps within each client workspace. Records can have more
                than one issue.
              </p>
            </div>
            <Pill tone="amber">{flagged.length} flagged records</Pill>
          </div>
          <div className="crm-quality-filters">
            {(
              [
                "all",
                "Unassigned",
                "Missing email",
                "Possible duplicate",
              ] as const
            ).map((issue) => (
              <button
                key={issue}
                aria-pressed={issueFilter === issue}
                onClick={() => setIssueFilter(issue)}
              >
                <Filter size={14} />
                {issue === "all" ? "All issues" : issue}
                <strong>
                  {issue === "all"
                    ? flagged.length
                    : active.filter((r) => issuesFor(r).includes(issue)).length}
                </strong>
              </button>
            ))}
          </div>
          <div className="sl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Client business</th>
                  <th>Issues</th>
                  <th>Recommended review</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {flagged
                  .filter(
                    (r) =>
                      issueFilter === "all" ||
                      issuesFor(r).includes(issueFilter),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.company}</strong>
                        <small>
                          {r.id} · {r.contact}
                        </small>
                      </td>
                      <td>{name(r.businessId)}</td>
                      <td>
                        <div className="crm-issue-tags">
                          {issuesFor(r).map((issue) => (
                            <Pill key={issue} tone="amber">
                              {issue}
                            </Pill>
                          ))}
                        </div>
                      </td>
                      <td>
                        {r.duplicateOf
                          ? "Compare records within this client"
                          : !r.owner
                            ? "Assign a client team member"
                            : "Validate contact details"}
                      </td>
                      <td>
                        <button onClick={() => setDetailId(r.id)}>
                          Review <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!flagged.some(
            (r) => issueFilter === "all" || issuesFor(r).includes(issueFilter),
          ) && (
            <div className="sl-empty">
              <ShieldCheck size={32} />
              <h3>No issues in this view</h3>
              <p>Quality corrections appear in the activity log.</p>
            </div>
          )}
          <p className="sl-footnote">
            Duplicate candidates are compared only within the same client.
            Dismissing a flag keeps both records separate. This prototype does
            not merge or permanently delete records.
          </p>
        </section>
      )}
      {view === "Activity log" && (
        <>
          <section className="sl-panel">
            <div className="sl-panel-head">
              <div>
                <h2>Client follow-up oversight</h2>
                <p>
                  Inspect outstanding follow-ups without sending a message on
                  the client’s behalf.
                </p>
              </div>
              <select
                aria-label="Follow-up urgency"
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
              >
                <option value="all">All scheduled</option>
                <option value="overdue">Overdue only</option>
              </select>
            </div>
            {active
              .filter(
                (r) =>
                  isOpen(r) &&
                  r.due &&
                  (activityFilter === "all" || isOverdue(r)),
              )
              .map((r) => (
                <button
                  key={r.id}
                  className="sl-mini-signal"
                  onClick={() => setDetailId(r.id)}
                >
                  <Clock3 size={17} />
                  <div>
                    <strong>{r.nextAction}</strong>
                    <small>
                      {r.company} · {name(r.businessId)} ·{" "}
                      {r.owner || "Unassigned"}
                    </small>
                  </div>
                  <Pill tone={isOverdue(r) ? "amber" : "neutral"}>
                    Due {dateLabel(r.due!)}
                  </Pill>
                  <ChevronRight size={15} />
                </button>
              ))}
            {!active.some(
              (r) =>
                isOpen(r) &&
                r.due &&
                (activityFilter === "all" || isOverdue(r)),
            ) && <div className="sl-empty">No follow-ups match this view.</div>}
          </section>
          <section className="sl-panel">
            <div className="sl-panel-head">
              <div>
                <h2>Admin audit trail</h2>
                <p>Management decisions, reasons, and record ownership.</p>
              </div>
              <Pill>
                {
                  audit.filter((a) => scope === "all" || a.businessId === scope)
                    .length
                }{" "}
                events
              </Pill>
            </div>
            <div className="sl-audit">
              {audit
                .filter((a) => scope === "all" || a.businessId === scope)
                .map((a) => (
                  <article key={a.id}>
                    <span className="sl-icon-box">
                      <Activity size={16} />
                    </span>
                    <div>
                      <strong>
                        {a.action}
                        {a.recordId ? ` · ${a.recordId}` : ""}
                      </strong>
                      <p>{a.detail}</p>
                      <small>
                        {name(a.businessId)} · {a.actor}
                      </small>
                    </div>
                    <time>{a.date}</time>
                  </article>
                ))}
              {!audit.some(
                (a) => scope === "all" || a.businessId === scope,
              ) && (
                <div className="sl-empty">
                  No admin actions recorded for this client yet.
                </div>
              )}
            </div>
          </section>
        </>
      )}
      {detail && (
        <CrmRecordDrawer
          key={detail.id}
          record={detail}
          business={businesses.find((b) => b.id === detail.businessId)!}
          duplicate={records.find(
            (r) =>
              r.id === detail.duplicateOf && r.businessId === detail.businessId,
          )}
          onClose={() => setDetailId(null)}
          onSave={saveRecord}
          onArchive={(reason) => {
            updateRecord(
              detail.id,
              { archived: !detail.archived },
              detail.archived ? "Record restored" : "Record archived",
              reason,
            );
            setDetailId(null);
          }}
          onNote={(note) =>
            updateRecord(
              detail.id,
              {
                notes: [
                  ...detail.notes,
                  { text: note, date: CRM_SNAPSHOT, actor: "Kwame Smith" },
                ],
              },
              "Admin note added",
              note,
            )
          }
          onDuplicate={(reason) => {
            updateRecord(
              detail.id,
              { duplicateReviewed: true },
              "Duplicate flag dismissed",
              reason,
            );
            setDetailId(null);
          }}
          onFollowup={(reason) => {
            updateRecord(
              detail.id,
              { due: null },
              "Follow-up completed",
              reason,
            );
            setDetailId(null);
          }}
        />
      )}
      {policy && (
        <PolicyDialog
          business={policy}
          onClose={() => setPolicyId(null)}
          onSave={(days, reason) => {
            setBusinesses((items) =>
              items.map((b) =>
                b.id === policy.id ? { ...b, staleDays: days } : b,
              ),
            );
            log(
              policy.id,
              "Review policy updated",
              `Stale deal threshold: ${days} days. ${reason}`,
            );
            setPolicyId(null);
            setNotice(`Review policy updated for ${policy.name}. Demo only.`);
          }}
        />
      )}
    </div>
  );
}
function PolicyDialog({
  business,
  onClose,
  onSave,
}: {
  business: CrmBusiness;
  onClose: () => void;
  onSave: (days: number, reason: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [days, setDays] = useState(business.staleDays);
  const [reason, setReason] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sl-dialog"
      aria-labelledby="crm-policy-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sl-dialog-head">
        <h2 id="crm-policy-title">{business.name} · Review policy</h2>
        <button aria-label="Close review policy" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <form
        className="sl-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(days, reason.trim());
        }}
      >
        <p>
          Flag open records when their last update is older than this threshold.
        </p>
        <label className="sl-field">
          Stale-deal threshold
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[3, 7, 14, 30].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
        <label className="sl-field">
          Reason for policy change
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain the reason for this review policy…"
          />
        </label>
        <div className="sl-dialog-actions">
          <button
            className="sl-primary"
            type="submit"
            disabled={!reason.trim()}
          >
            Save review policy
          </button>
        </div>
        <p className="sl-footnote">
          This changes admin stale-deal indicators. No client automation or
          notification is triggered.
        </p>
      </form>
    </dialog>
  );
}
