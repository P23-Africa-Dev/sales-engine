"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Pause,
  Play,
  Radar,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  INITIAL_AUDIT,
  INITIAL_BUSINESSES,
  INITIAL_SCANS,
  INITIAL_SIGNALS,
  SOURCES,
  type AuditEntry,
  type ListeningBusiness,
  type ReviewStatus,
  type Scan,
  type Signal,
} from "@/lib/social-listening";

import { ListeningAnalytics } from "./listening-analytics";

type View =
  | "Overview"
  | "Businesses"
  | "Signal review"
  | "Scan operations"
  | "Activity log";
const views: { name: View; icon: typeof Activity }[] = [
  { name: "Overview", icon: Radar },
  { name: "Businesses", icon: Building2 },
  { name: "Signal review", icon: ShieldCheck },
  { name: "Scan operations", icon: Activity },
  { name: "Activity log", icon: Clock3 },
];
const reviewStates: ReviewStatus[] = ["Needs review", "Approved", "Suppressed"];
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`sl-badge sl-${tone}`}>{children}</span>;
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sl-dialog"
      aria-labelledby="sl-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sl-dialog-head">
        <div>
          <h2 id="sl-dialog-title">{title}</h2>
        </div>
        <button aria-label="Close details" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function SocialListeningView() {
  const [view, setView] = useState<View>("Overview");
  const [businesses, setBusinesses] = useState(INITIAL_BUSINESSES);
  const [signals, setSignals] = useState(INITIAL_SIGNALS);
  const [scans, setScans] = useState(INITIAL_SCANS);
  const [audit, setAudit] = useState(INITIAL_AUDIT);
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const businessName = (id: string) =>
    businesses.find((b) => b.id === id)?.name ?? id;
  const scopedBusinesses = businesses.filter(
    (b) => scope === "all" || b.id === scope,
  );
  const scopedSignals = signals.filter(
    (s) => scope === "all" || s.businessId === scope,
  );
  const scopedScans = scans.filter(
    (s) => scope === "all" || s.businessId === scope,
  );
  const pending = scopedSignals.filter((s) => s.status === "Needs review");
  const failures = scopedScans.filter((s) => s.status === "Failed");
  const filteredSignals = scopedSignals.filter(
    (s) =>
      (source === "all" || s.source === source) &&
      (status === "all" || s.status === status) &&
      `${s.title} ${s.company} ${s.author} ${businessName(s.businessId)} ${s.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredSignals.length / 6));
  const safePage = Math.min(page, totalPages);
  const pageSignals = filteredSignals.slice((safePage - 1) * 6, safePage * 6);
  const detail = signals.find((s) => s.id === detailId);
  const scanDetail = scans.find((s) => s.id === scanId);
  const settings = businesses.find((b) => b.id === settingsId);
  const selectedBusiness = businesses.find((b) => b.id === scope);
  const addAudit = (businessId: string, action: string, detail: string) => {
    setAudit((entries) => [
      {
        id: `audit-${Date.now()}-${Math.random()}`,
        businessId,
        action,
        detail,
        time: new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Africa/Lagos",
        }).format(new Date()),
        actor: "Kwame Smith",
      },
      ...entries,
    ]);
  };
  const changeView = (next: View) => {
    setView(next);
    setSearch("");
    setSelected([]);
    setStatus("all");
    setSource("all");
    setPage(1);
  };
  const changeScope = (id: string) => {
    setScope(id);
    setSelected([]);
    setPage(1);
  };
  const openBusiness = (id: string) => {
    changeScope(id);
    changeView("Businesses");
  };
  const review = (ids: string[], next: ReviewStatus, note: string) => {
    if (!note.trim()) {
      setNotice("Add a review reason before updating signals.");
      return;
    }
    setSignals((items) =>
      items.map((s) => (ids.includes(s.id) ? { ...s, status: next } : s)),
    );
    signals
      .filter((s) => ids.includes(s.id))
      .forEach((s) =>
        addAudit(
          s.businessId,
          `Signal ${next.toLowerCase()}`,
          `${s.id} · ${note.trim()}`,
        ),
      );
    setSelected([]);
    setReason("");
    setNotice(
      `${ids.length} signal${ids.length === 1 ? "" : "s"} updated to ${next.toLowerCase()}. Demo change only.`,
    );
  };
  const toggleMonitoring = (b: ListeningBusiness) => {
    setBusinesses((items) =>
      items.map((item) =>
        item.id === b.id ? { ...item, paused: !item.paused } : item,
      ),
    );
    addAudit(
      b.id,
      b.paused ? "Monitoring resumed" : "Monitoring paused",
      "Admin changed monitoring status. Existing signals retained.",
    );
    setNotice(
      `${b.name}: monitoring ${b.paused ? "resumed" : "paused"} in this demo.`,
    );
  };
  const queueScan = (b: ListeningBusiness, scan?: Scan) => {
    if (
      b.paused ||
      scans.some((s) => s.businessId === b.id && s.status === "Queued")
    )
      return;
    const id = `RUN-${Date.now().toString().slice(-6)}`;
    setScans((items) => [
      {
        id,
        businessId: b.id,
        status: "Queued",
        source: scan?.source ?? b.sources[0],
        found: 0,
        date: "Just now · demo",
      },
      ...items,
    ]);
    addAudit(
      b.id,
      scan ? "Scan retry queued" : "Manual scan queued",
      `${id} · ${scan ? `Retry of ${scan.id}` : "Admin requested a scan"}`,
    );
    setNotice(
      `Scan queued for ${b.name}. Demo runs stay queued; no provider is contacted.`,
    );
  };
  const exportSignals = () => {
    const rows = [
      [
        "ID",
        "Business",
        "Company",
        "Source",
        "Score",
        "Stage",
        "Review status",
      ],
      ...filteredSignals.map((s) => [
        s.id,
        businessName(s.businessId),
        s.company,
        s.source,
        String(s.score),
        s.stage,
        s.status,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "social-listening-signals-demo.csv";
    a.click();
    URL.revokeObjectURL(url);
    setNotice(
      `Exported ${filteredSignals.length} signals from the current filters.`,
    );
  };
  return (
    <div className="sl-root">
      <header className="sl-page-head">
        <div>
          <h1>
            Social Listening<span>.</span>
          </h1>
          <p>Every client. Every buying signal. One place to oversee it all.</p>
        </div>
        <div className="sl-head-note">
          <span className="sl-demo">Demo data</span> Admin workspace
          <small>Snapshot · 09 Oct 2026</small>
        </div>
      </header>
      <div className="sl-context">
        <div>
          <Building2 size={17} />
          <label htmlFor="sl-scope">Business scope</label>
          <select
            id="sl-scope"
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
        <span>Changes are local to this session · refresh resets the demo</span>
      </div>
      <nav className="sl-tabs" aria-label="Social listening views">
        {views.map(({ name, icon: Icon }) => (
          <button
            key={name}
            aria-current={view === name ? "page" : undefined}
            className={view === name ? "active" : ""}
            onClick={() => changeView(name)}
          >
            <Icon size={16} />
            {name}
            {name === "Signal review" && <span>{pending.length}</span>}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="sl-notice" role="status">
          <Check size={17} />
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
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
                label: "BUSINESSES MONITORED",
                value: scopedBusinesses.filter((b) => !b.paused).length,
                note: `${scopedBusinesses.filter((b) => b.paused).length} paused · ${scopedBusinesses.length} total`,
                icon: Building2,
              },
              {
                label: "SIGNALS CAPTURED",
                value: scopedSignals.length,
                note: "Across all sources in this snapshot",
                icon: Radar,
              },
              {
                label: "AWAITING REVIEW",
                value: pending.length,
                note: `${pending.filter((s) => s.issue).length} quality flags to inspect`,
                icon: ShieldCheck,
              },
              {
                label: "SCANS NEED ATTENTION",
                value: failures.length,
                note: `${scopedScans.filter((s) => s.status === "Queued").length} queued · provider operations`,
                icon: CircleAlert,
              },
            ].map(({ label, value, note, icon: Icon }) => (
              <div key={label} className="sl-metric">
                <div>
                  {label}
                  <Icon size={18} />
                </div>
                <strong>{value.toString().padStart(2, "0")}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
          <ListeningAnalytics
            key={scope}
            signals={scopedSignals}
            businesses={scopedBusinesses}
            onBusiness={openBusiness}
          />
          <section className="sl-panel sl-portfolio-panel">
            <div className="sl-panel-head">
              <div>
                <h2>Monitoring at a glance</h2>
              </div>
              <button
                className="sl-text-button"
                onClick={() => changeView("Businesses")}
              >
                Manage businesses <ArrowRight size={16} />
              </button>
            </div>
            <div className="sl-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client business</th>
                    <th>Monitoring</th>
                    <th>Sources enabled</th>
                    <th>Signals</th>
                    <th>To review</th>
                    <th>Workspace</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedBusinesses.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div className="sl-client-identity">
                          <span className="sl-monogram">
                            {b.name
                              .split(" ")
                              .map((word) => word[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <div>
                            <strong>{b.name}</strong>
                            <small>{b.industry}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={b.paused ? "amber" : "mint"}>
                          {b.paused ? "Paused" : "Active"}
                        </Badge>
                      </td>
                      <td>{b.sources.join(" · ")}</td>
                      <td>
                        {signals.filter((s) => s.businessId === b.id).length}
                      </td>
                      <td>
                        {
                          signals.filter(
                            (s) =>
                              s.businessId === b.id &&
                              s.status === "Needs review",
                          ).length
                        }
                      </td>
                      <td>
                        <button
                          className="sl-text-button"
                          onClick={() => openBusiness(b.id)}
                        >
                          Inspect <ChevronRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {view === "Businesses" && (
        <div className="sl-business-workspace">
          <aside className="sl-panel sl-business-list">
            <div className="sl-panel-head">
              <h2>Client businesses</h2>
              <Badge>{businesses.length}</Badge>
            </div>
            <div className="sl-search">
              <Search size={16} />
              <input
                aria-label="Search businesses"
                placeholder="Find a business or owner…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {businesses
              .filter((b) =>
                `${b.name} ${b.owner}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((b) => (
                <button
                  key={b.id}
                  className={`sl-business-item ${scope === b.id ? "active" : ""}`}
                  onClick={() => changeScope(b.id)}
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
                  <span className={`sl-dot ${b.paused ? "paused" : ""}`} />
                </button>
              ))}
            {!businesses.some((b) =>
              `${b.name} ${b.owner}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && <p className="sl-empty">No businesses match this search.</p>}
            <button
              className="sl-text-button"
              onClick={() => {
                changeScope("all");
                setSearch("");
              }}
            >
              Show all businesses
            </button>
          </aside>
          <section className="sl-panel">
            {selectedBusiness ? (
              <>
                <div className="sl-panel-head">
                  <div>
                    <h2>{selectedBusiness.name}</h2>
                    <p>
                      {selectedBusiness.owner} · {selectedBusiness.industry}
                    </p>
                  </div>
                  <Badge tone={selectedBusiness.paused ? "amber" : "mint"}>
                    {selectedBusiness.paused ? "Paused" : "Monitoring active"}
                  </Badge>
                </div>
                <div className="sl-business-actions">
                  <button onClick={() => setSettingsId(selectedBusiness.id)}>
                    <Settings2 size={16} /> Edit configuration
                  </button>
                  <button onClick={() => toggleMonitoring(selectedBusiness)}>
                    {selectedBusiness.paused ? (
                      <Play size={16} />
                    ) : (
                      <Pause size={16} />
                    )}{" "}
                    {selectedBusiness.paused
                      ? "Resume monitoring"
                      : "Pause monitoring"}
                  </button>
                  <button
                    className="sl-primary"
                    disabled={
                      selectedBusiness.paused ||
                      scans.some(
                        (s) =>
                          s.businessId === selectedBusiness.id &&
                          s.status === "Queued",
                      )
                    }
                    onClick={() => queueScan(selectedBusiness)}
                  >
                    <Radar size={16} /> Queue scan
                  </button>
                </div>
                <div className="sl-config-grid">
                  <div>
                    <small>IDEAL CUSTOMER PROFILE</small>
                    <strong>{selectedBusiness.icp}</strong>
                  </div>
                  <div>
                    <small>KEYWORDS & TOPICS</small>
                    <strong>{selectedBusiness.keywords}</strong>
                  </div>
                  <div>
                    <small>SCAN CADENCE</small>
                    <strong>Every {selectedBusiness.cadence} days</strong>
                  </div>
                  <div>
                    <small>QUALITY RULES</small>
                    <strong>
                      Score ≥ {selectedBusiness.minScore} · Last{" "}
                      {selectedBusiness.freshness} days
                    </strong>
                  </div>
                  <div>
                    <small>ENABLED SOURCES</small>
                    <strong>{selectedBusiness.sources.join(" · ")}</strong>
                  </div>
                  <div>
                    <small>CLIENT CRM DESTINATION</small>
                    <strong>
                      {selectedBusiness.destination === "human_review"
                        ? "Human review"
                        : "Qualified pipeline"}
                    </strong>
                  </div>
                </div>
                <div className="sl-subhead">
                  <h3>Recent signals</h3>
                  <button
                    className="sl-text-button"
                    onClick={() => changeView("Signal review")}
                  >
                    Review all <ArrowRight size={15} />
                  </button>
                </div>
                {scopedSignals.slice(0, 4).map((s) => (
                  <button
                    key={s.id}
                    className="sl-mini-signal"
                    onClick={() => {
                      setReason("");
                      setDetailId(s.id);
                    }}
                  >
                    <div>
                      <strong>{s.title}</strong>
                      <small>
                        {s.company} · {s.source}
                      </small>
                    </div>
                    <Badge
                      tone={s.status === "Needs review" ? "amber" : "neutral"}
                    >
                      {s.status}
                    </Badge>
                    <ChevronRight size={16} />
                  </button>
                ))}
                <p className="sl-footnote">
                  Admin approval records a quality decision. CRM activity
                  reflects the client’s existing workflow; no message or CRM
                  record is created here.
                </p>
              </>
            ) : (
              <div className="sl-workspace-empty">
                <Building2 size={40} />
                <h2>Select a business to inspect its workspace</h2>
                <p>
                  Review monitoring rules, captured signals, and operational
                  controls for each client.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {view === "Signal review" && (
        <section className="sl-panel">
          <div className="sl-panel-head">
            <div>
              <h2>Signal review queue</h2>
              <p>
                Inspect source evidence and relevance across client businesses.
              </p>
            </div>
            <button onClick={exportSignals}>
              <ArrowDownToLine size={16} /> Export filtered signals
            </button>
          </div>
          <div className="sl-filters">
            <div className="sl-search">
              <Search size={16} />
              <input
                aria-label="Search signals"
                placeholder="Search signal, company, or ID…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  setSelected([]);
                }}
              />
            </div>
            <select
              aria-label="Filter signal source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
                setSelected([]);
              }}
            >
              <option value="all">All sources</option>
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter review status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
                setSelected([]);
              }}
            >
              <option value="all">All review statuses</option>
              {reviewStates.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {selected.length > 0 && (
            <div className="sl-bulk">
              <strong>{selected.length} selected</strong>
              <input
                aria-label="Bulk review reason"
                placeholder="Reason for this review decision (required)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                disabled={!reason.trim()}
                onClick={() => review(selected, "Approved", reason)}
              >
                Approve
              </button>
              <button
                disabled={!reason.trim()}
                onClick={() => review(selected, "Suppressed", reason)}
              >
                Suppress
              </button>
              <button onClick={() => setSelected([])}>Clear</button>
            </div>
          )}
          <div className="sl-table-wrap">
            <table className="sl-signals-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all filtered signals"
                      checked={
                        filteredSignals.length > 0 &&
                        filteredSignals.every((s) => selected.includes(s.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? filteredSignals.map((s) => s.id)
                            : [],
                        )
                      }
                    />
                  </th>
                  <th>Signal / client business</th>
                  <th>Source</th>
                  <th>Intent score</th>
                  <th>Buying stage</th>
                  <th>Review status</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {pageSignals.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.id}`}
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, s.id]
                              : ids.filter((id) => id !== s.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{s.title}</strong>
                      <small>{s.company}</small>
                      <span className="sl-client-label">
                        {businessName(s.businessId)} · {s.id}
                      </span>
                      {s.issue && (
                        <span className="sl-quality-flag">
                          <CircleAlert size={12} />
                          {s.issue}
                        </span>
                      )}
                    </td>
                    <td>
                      {s.source}
                      <small>{s.date}</small>
                    </td>
                    <td>
                      <span className={`sl-score ${s.score < 65 ? "low" : ""}`}>
                        {s.score}
                        <small>/100</small>
                      </span>
                    </td>
                    <td>{s.stage}</td>
                    <td>
                      <Badge
                        tone={
                          s.status === "Approved"
                            ? "mint"
                            : s.status === "Needs review"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {s.status}
                      </Badge>
                      <small>
                        {s.crm ? "Saved to client CRM" : "No CRM record"}
                      </small>
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          setReason("");
                          setDetailId(s.id);
                        }}
                      >
                        Inspect <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredSignals.length && (
            <div className="sl-empty">
              <Radar size={30} />
              <h3>No signals match these filters</h3>
              <p>Try another source, review status, or search term.</p>
              <button
                onClick={() => {
                  setSource("all");
                  setStatus("all");
                  setSearch("");
                }}
              >
                Reset filters
              </button>
            </div>
          )}
          <div className="sl-pagination">
            <span>
              {filteredSignals.length
                ? `${(safePage - 1) * 6 + 1}–${Math.min(safePage * 6, filteredSignals.length)}`
                : "0"}{" "}
              of {filteredSignals.length} signals
            </span>
            <div>
              <button
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </button>
              <span>
                {safePage} / {totalPages}
              </span>
              <button
                disabled={safePage === totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
      {view === "Scan operations" && (
        <section className="sl-panel">
          <div className="sl-panel-head">
            <div>
              <h2>Scan runs & source health</h2>
              <p>
                Find interruptions, inspect diagnostics, and queue retries per
                business.
              </p>
            </div>
            <Badge tone={failures.length ? "amber" : "mint"}>
              {failures.length} failed runs
            </Badge>
          </div>
          <div className="sl-health-grid">
            {SOURCES.map((s) => {
              const runs = scopedScans.filter((r) => r.source === s);
              const failed = runs.filter((r) => r.status === "Failed").length;
              return (
                <div key={s}>
                  <strong>{s}</strong>
                  <Badge
                    tone={failed ? "amber" : runs.length ? "mint" : "neutral"}
                  >
                    {failed
                      ? "Attention needed"
                      : runs.length
                        ? "Healthy"
                        : "No runs"}
                  </Badge>
                  <small>
                    {runs.length} runs ·{" "}
                    {
                      scopedBusinesses.filter((b) => b.sources.includes(s))
                        .length
                    }{" "}
                    businesses enabled
                  </small>
                </div>
              );
            })}
          </div>
          <div className="sl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run / business</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Signals found</th>
                  <th>Started</th>
                  <th>Diagnostics</th>
                </tr>
              </thead>
              <tbody>
                {scopedScans.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.id}</strong>
                      <small>{businessName(r.businessId)}</small>
                    </td>
                    <td>{r.source}</td>
                    <td>
                      <Badge
                        tone={
                          r.status === "Failed"
                            ? "amber"
                            : r.status === "Completed"
                              ? "mint"
                              : "neutral"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td>{r.status === "Queued" ? "—" : r.found}</td>
                    <td>{r.date}</td>
                    <td>
                      <button onClick={() => setScanId(r.id)}>
                        Inspect <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sl-footnote">
            Run counts include raw candidates before quality filtering and
            deduplication. Queued demo scans remain queued until the page is
            refreshed.
          </p>
        </section>
      )}
      {view === "Activity log" && (
        <section className="sl-panel">
          <div className="sl-panel-head">
            <div>
              <h2>Activity log</h2>
              <p>
                Review who changed monitoring, configuration, or signal
                decisions.
              </p>
            </div>
            <Badge>
              {
                audit.filter((a) => scope === "all" || a.businessId === scope)
                  .length
              }{" "}
              events
            </Badge>
          </div>
          <div className="sl-audit">
            {audit
              .filter((a) => scope === "all" || a.businessId === scope)
              .map((a) => (
                <article key={a.id}>
                  <span className="sl-icon-box">
                    <Clock3 size={17} />
                  </span>
                  <div>
                    <strong>{a.action}</strong>
                    <p>{a.detail}</p>
                    <small>
                      {businessName(a.businessId)} · {a.actor}
                    </small>
                  </div>
                  <time>{a.time}</time>
                </article>
              ))}
            {!audit.some((a) => scope === "all" || a.businessId === scope) && (
              <div className="sl-empty">
                No admin activity for this business yet. Demo management actions
                will appear here.
              </div>
            )}
          </div>
        </section>
      )}
      {detail && (
        <Dialog
          title="Signal evidence & review"
          onClose={() => setDetailId(null)}
        >
          <div className="sl-dialog-body">
            <div className="sl-evidence-meta">
              <Badge>{detail.id}</Badge>
              <Badge tone="mint">{detail.score}/100 intent</Badge>
              <Badge
                tone={detail.status === "Needs review" ? "amber" : "neutral"}
              >
                {detail.status}
              </Badge>
            </div>
            <h3>{detail.title}</h3>
            <p>{detail.company}</p>
            <div className="sl-evidence-context">
              <strong>Belongs to {businessName(detail.businessId)}</strong>
              <small>
                {detail.source} · {detail.author} · {detail.date}
              </small>
            </div>
            <blockquote>“{detail.quote}”</blockquote>
            <h4>Why this signal was matched</h4>
            <p>{detail.reason}</p>
            <div className="sl-config-grid">
              <div>
                <small>BUYING STAGE</small>
                <strong>{detail.stage}</strong>
              </div>
              <div>
                <small>CLIENT CRM</small>
                <strong>
                  {detail.crm ? "Already saved by client" : "Not saved"}
                </strong>
              </div>
            </div>
            {detail.issue && (
              <div className="sl-warning">
                <CircleAlert size={18} />
                <div>
                  <strong>{detail.issue}</strong>
                  <p>
                    {detail.issue === "Possible duplicate"
                      ? "Compare the company and source evidence with existing signals before approving."
                      : "The intent score is below the default quality threshold. Validate fit and buying authority."}
                  </p>
                </div>
              </div>
            )}
            <label className="sl-field">
              Review reason
              <textarea
                placeholder="Explain your decision for the activity log…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="sl-dialog-actions">
              <button
                disabled={!reason.trim() || detail.status === "Suppressed"}
                onClick={() => review([detail.id], "Suppressed", reason)}
              >
                Suppress signal
              </button>
              <button
                disabled={!reason.trim() || detail.status === "Needs review"}
                onClick={() => review([detail.id], "Needs review", reason)}
              >
                Return to review
              </button>
              <button
                className="sl-primary"
                disabled={!reason.trim() || detail.status === "Approved"}
                onClick={() => review([detail.id], "Approved", reason)}
              >
                <Check size={16} /> Approve
              </button>
            </div>
            <p className="sl-footnote">
              Sample evidence has no live source link. Decisions change demo
              review status only and do not trigger client outreach.
            </p>
          </div>
        </Dialog>
      )}
      {settings && (
        <Dialog
          title={`${settings.name} · Configuration`}
          onClose={() => setSettingsId(null)}
        >
          <Configuration
            key={settings.id}
            business={settings}
            onSave={(updated) => {
              setBusinesses((items) =>
                items.map((b) => (b.id === updated.id ? updated : b)),
              );
              addAudit(
                updated.id,
                "Configuration updated",
                `Sources: ${updated.sources.join(", ")} · Cadence: ${updated.cadence} days · Minimum score: ${updated.minScore} · Freshness: ${updated.freshness} days · CRM: ${updated.destination} · Keywords: ${updated.keywords}`,
              );
              setSettingsId(null);
              setNotice(
                `Configuration saved for ${updated.name}. Demo change only.`,
              );
            }}
          />
        </Dialog>
      )}
      {scanDetail && (
        <Dialog title="Scan diagnostics" onClose={() => setScanId(null)}>
          <div className="sl-dialog-body">
            <Badge tone={scanDetail.status === "Failed" ? "amber" : "mint"}>
              {scanDetail.status}
            </Badge>
            <h3>{scanDetail.id}</h3>
            <p>
              {businessName(scanDetail.businessId)} · {scanDetail.source} ·{" "}
              {scanDetail.date}
            </p>
            <div className="sl-warning">
              <Activity size={20} />
              <p>
                {scanDetail.error ??
                  (scanDetail.status === "Queued"
                    ? "Awaiting a worker. This demo has no scan worker; the run will remain queued."
                    : `Source collection completed. ${scanDetail.found} raw candidate signals collected before deduplication and filtering.`)}
              </p>
            </div>
            {scanDetail.status === "Failed" && (
              <button
                className="sl-primary"
                disabled={
                  businesses.find((b) => b.id === scanDetail.businessId)
                    ?.paused ||
                  scans.some(
                    (s) =>
                      s.businessId === scanDetail.businessId &&
                      s.status === "Queued",
                  )
                }
                onClick={() => {
                  const b = businesses.find(
                    (b) => b.id === scanDetail.businessId,
                  );
                  if (b) queueScan(b, scanDetail);
                }}
              >
                Queue retry
              </button>
            )}
            <p className="sl-footnote">
              Retries create a separate run, preserving the original failure for
              inspection. Paused businesses cannot queue scans.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function Configuration({
  business,
  onSave,
}: {
  business: ListeningBusiness;
  onSave: (b: ListeningBusiness) => void;
}) {
  const [draft, setDraft] = useState(business);
  return (
    <form
      className="sl-dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...draft, keywords: draft.keywords.trim() });
      }}
    >
      <p>
        Control what this client monitors and how qualifying signals are routed.
      </p>
      <fieldset className="sl-source-options">
        <legend>Enabled sources · select at least one</legend>
        {SOURCES.map((s) => (
          <label key={s}>
            <input
              type="checkbox"
              checked={draft.sources.includes(s)}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  sources: e.target.checked
                    ? [...d.sources, s]
                    : d.sources.filter((item) => item !== s),
                }))
              }
            />
            {s}
          </label>
        ))}
      </fieldset>
      <label className="sl-field">
        Keywords & topics
        <textarea
          required
          value={draft.keywords}
          onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
        />
      </label>
      <div className="sl-form-grid">
        <label className="sl-field">
          Scan cadence
          <select
            value={draft.cadence}
            onChange={(e) =>
              setDraft({ ...draft, cadence: Number(e.target.value) as 14 | 30 })
            }
          >
            <option value="14">Every 14 days</option>
            <option value="30">Every 30 days</option>
          </select>
        </label>
        <label className="sl-field">
          Freshness window
          <select
            value={draft.freshness}
            onChange={(e) =>
              setDraft({ ...draft, freshness: Number(e.target.value) })
            }
          >
            {[7, 14, 30, 90].map((n) => (
              <option key={n} value={n}>
                Last {n} days
              </option>
            ))}
          </select>
        </label>
        <label className="sl-field">
          Minimum intent score
          <input
            required
            type="number"
            min="0"
            max="100"
            value={draft.minScore}
            onChange={(e) =>
              setDraft({ ...draft, minScore: Number(e.target.value) })
            }
          />
        </label>
        <label className="sl-field">
          Client CRM destination
          <select
            value={draft.destination}
            onChange={(e) =>
              setDraft({
                ...draft,
                destination: e.target.value as ListeningBusiness["destination"],
              })
            }
          >
            <option value="human_review">Human review</option>
            <option value="qualified_pipeline">Qualified pipeline</option>
          </select>
        </label>
      </div>
      <p className="sl-footnote">
        These rules apply to future scans. Existing signals remain available for
        inspection. Meta page authorization will be handled during API
        integration.
      </p>
      <div className="sl-dialog-actions">
        <button
          type="submit"
          className="sl-primary"
          disabled={!draft.sources.length || !draft.keywords.trim()}
        >
          <Check size={16} /> Save configuration
        </button>
      </div>
    </form>
  );
}
