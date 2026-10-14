"use client";
import { useRef, useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Filter,
  Mail,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Users,
  X,
} from "lucide-react";
import {
  ONBOARDED_BUSINESSES_DATA,
  type ProspectTier,
  type SmartLead,
} from "@/lib/smart-leads";
import { ProspectDrawer } from "./prospect-drawer";
import { SmartLeadsAnalytics, TIER_LABELS } from "./smart-leads-analytics";
export function SmartLeadsView() {
  const businesses = ONBOARDED_BUSINESSES_DATA;
  const [businessId, setBusinessId] = useState(businesses[0].id);
  const [showMobileClients, setShowMobileClients] = useState(false);
  const [businessQuery, setBusinessQuery] = useState("");
  const [industry, setIndustry] = useState("all");
  const [sort, setSort] = useState("prospects");
  const [tier, setTier] = useState<"all" | ProspectTier>("all");
  const [query, setQuery] = useState("");
  const [signal, setSignal] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [selected, setSelected] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<SmartLead | null>(null);
  const [enrollIds, setEnrollIds] = useState<string[]>([]);
  const [enrolled, setEnrolled] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const business = businesses.find((b) => b.id === businessId)!;
  const prospects = business.prospects;
  const industries = Array.from(new Set(businesses.map((b) => b.industry)));
  const clients = businesses
    .filter(
      (b) =>
        (industry === "all" || b.industry === industry) &&
        `${b.company} ${b.owner} ${b.country} ${b.industry}`
          .toLowerCase()
          .includes(businessQuery.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "fit"
        ? b.analytics.avgFitScore - a.analytics.avgFitScore
        : sort === "emails"
          ? b.emailsSent - a.emailsSent
          : b.prospects.length - a.prospects.length,
    );
  const filtered = prospects.filter(
    (p) =>
      (tier === "all" || p.tier === tier) &&
      (signal === "all" || p.matchedPresets.includes(signal)) &&
      `${p.company} ${p.primaryContact.name} ${p.industry} ${p.location} ${p.intentTrigger} ${p.techStack.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  function changeBusiness(id: string) {
    setBusinessId(id);
    setSelected([]);
    setTier("all");
    setQuery("");
    setSignal("all");
    setPage(1);
    setDrawer(null);
    setEnrollIds([]);
  }
  function resetPage() {
    setPage(1);
    setSelected([]);
  }
  function resetFilters() {
    setTier("all");
    setQuery("");
    setSignal("all");
    resetPage();
  }
  async function copyEmail(email: string, id: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(id);
      setNotice("Contact email copied.");
    } catch {
      setNotice(
        "Clipboard access is unavailable. Copy the email from the prospect details.",
      );
    }
  }
  const metrics = [
    {
      label: "SAMPLE PROSPECTS",
      value: String(prospects.length),
      note: "Records available to inspect",
      icon: Users,
    },
    {
      label: "HIGH INTENT",
      value: String(prospects.filter((p) => p.tier === "high").length),
      note: "Highest-priority sample matches",
      icon: Target,
    },
    {
      label: "AVERAGE FIT",
      value: `${Math.round(prospects.reduce((sum, p) => sum + p.fitScore, 0) / Math.max(1, prospects.length))}%`,
      note: "Across this client’s sample pool",
      icon: SlidersHorizontal,
    },
    {
      label: "VERIFIED CONTACTS",
      value: String(prospects.filter((p) => p.primaryContact.verified).length),
      note: `Of ${prospects.length} displayed prospects`,
      icon: ShieldCheck,
    },
  ];
  return (
    <div className="sl-root sp-root">
      <header className="sl-page-head">
        <div>
          <h1>
            Smart Leads<span>.</span>
          </h1>
          <p>
            Every client’s prospect pool, in focus. Inspect fit, intent, and the
            evidence behind each match.
          </p>
        </div>
        <div className="sl-head-note">
          <span className="sl-demo">Demo data</span> Admin workspace
          <small>Local changes reset on refresh</small>
        </div>
      </header>
      {notice && (
        <div className="sl-notice" role="status">
          <Check size={16} />
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="sp-mobile-controls">
        <label>
          Client workspace
          <select
            aria-label="Choose client workspace"
            value={businessId}
            onChange={(e) => changeBusiness(e.target.value)}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.company}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-expanded={showMobileClients}
          aria-controls="sp-client-selector"
          onClick={() => setShowMobileClients((value) => !value)}
        >
          <Filter size={15} /> Business filters
        </button>
      </div>
      <div className="sp-workspace sl-business-workspace">
        <aside
          id="sp-client-selector"
          className={`sl-panel sl-business-list sp-client-list ${showMobileClients ? "sp-mobile-open" : ""}`}
          aria-label="Client business selector"
        >
          <div className="sl-panel-head">
            <div>
              <h2>Client businesses</h2>
              <p>{businesses.length} onboarded workspaces</p>
            </div>
            <Building2 size={20} />
          </div>
          <div className="sl-search">
            <Search size={16} />
            <input
              aria-label="Search client businesses"
              placeholder="Find a business or owner…"
              value={businessQuery}
              onChange={(e) => setBusinessQuery(e.target.value)}
            />
          </div>
          <div className="sp-client-filters">
            <label>
              Industry
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="all">All industries</option>
                {industries.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </label>
            <label>
              Sort clients
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="prospects">Sample pool size</option>
                <option value="fit">Portfolio fit score</option>
                <option value="emails">Outreach volume</option>
              </select>
            </label>
          </div>
          {clients.map((b) => (
            <button
              key={b.id}
              className={`sl-business-item sp-business-item ${b.id === businessId ? "active" : ""}`}
              aria-pressed={b.id === businessId}
              onClick={() => changeBusiness(b.id)}
            >
              <span className="sl-monogram">
                {b.company
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{b.company}</strong>
                <small>{b.owner}</small>
                <span>
                  {b.prospects.length} sample prospects · {b.country}
                </span>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
          {!clients.length && (
            <div className="sl-empty">
              <h3>No matching clients</h3>
              <p>Try a different search or industry.</p>
            </div>
          )}
          <button
            className="sl-text-button"
            onClick={() => {
              setBusinessQuery("");
              setIndustry("all");
            }}
          >
            Reset client filters
          </button>
          <p className="sp-client-footnote">
            Selected workspace: <strong>{business.company}</strong>
          </p>
        </aside>
        <div className="sp-detail">
          <section className="sl-panel sp-business-summary">
            <div className="sl-panel-head">
              <div className="sl-client-identity">
                <span className="sl-monogram">
                  {business.company
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <h2>{business.company}</h2>
                  <p>
                    {business.industry} · {business.country}
                  </p>
                </div>
              </div>
              <span className="sl-badge">{business.owner}</span>
            </div>
            <div className="sp-metrics">
              {metrics.map(({ label, value, note, icon: Icon }) => (
                <div key={label}>
                  <span>
                    {label}
                    <Icon size={16} />
                  </span>
                  <strong>{value}</strong>
                  <small>{note}</small>
                </div>
              ))}
            </div>
          </section>
          <SmartLeadsAnalytics
            key={businessId}
            business={business}
            onTier={(next) => {
              setTier(tier === next ? "all" : next);
              resetPage();
            }}
            onSignal={(next) => {
              setSignal(next);
              resetPage();
            }}
            selectedSignal={signal}
          />
          <section className="sl-panel sp-directory">
            <div className="sl-panel-head">
              <div>
                <h2>Prospect directory</h2>
                <p>
                  Matched accounts for {business.company}. Inspect evidence
                  before preparing a cadence.
                </p>
              </div>
              <span className="sl-badge">{filtered.length} matches</span>
            </div>
            <div
              className="sp-tier-filters"
              aria-label="Prospect intent filters"
            >
              {(["all", "high", "middle", "low"] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={tier === t}
                  onClick={() => {
                    setTier(t);
                    resetPage();
                  }}
                >
                  {t === "all" ? "All prospects" : TIER_LABELS[t]}
                  <span>
                    {t === "all"
                      ? prospects.length
                      : prospects.filter((p) => p.tier === t).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="sl-filters">
              <div className="sl-search">
                <Search size={16} />
                <input
                  aria-label="Search prospects"
                  placeholder="Search company, contact, or buying signal…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    resetPage();
                  }}
                />
              </div>
              <select
                aria-label="Filter buying signal"
                value={signal}
                onChange={(e) => {
                  setSignal(e.target.value);
                  resetPage();
                }}
              >
                <option value="all">All buying signals</option>
                <option value="hiring">Hiring</option>
                <option value="funding">Funding</option>
                <option value="expansion">Expansion</option>
                <option value="tenders">Tenders</option>
              </select>
            </div>
            {selected.length > 0 && (
              <div className="sl-bulk">
                <strong>
                  {selected.length} selected across the filtered results
                </strong>
                <button
                  onClick={() => setEnrollIds(selected)}
                  className="sl-primary"
                >
                  <Mail size={15} /> Prepare demo enrollment
                </button>
                <button onClick={() => setSelected([])}>Clear selection</button>
              </div>
            )}
            <div className="sl-table-wrap">
              <table className="sp-prospect-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all filtered prospects"
                        checked={
                          filtered.length > 0 &&
                          filtered.every((p) => selected.includes(p.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? filtered.map((p) => p.id) : [],
                          )
                        }
                      />
                    </th>
                    <th>Account / signal</th>
                    <th>Decision maker</th>
                    <th>Fit & intent</th>
                    <th>Activity</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.company}`}
                          checked={selected.includes(p.id)}
                          onChange={(e) =>
                            setSelected((ids) =>
                              e.target.checked
                                ? [...ids, p.id]
                                : ids.filter((id) => id !== p.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>{p.company}</strong>
                        <small>
                          {p.industry} · {p.location}
                        </small>
                        <span className="sp-table-signal">
                          <Target size={12} />
                          {p.intentTrigger}
                        </span>
                      </td>
                      <td>
                        <strong>{p.primaryContact.name}</strong>
                        <small>{p.primaryContact.title}</small>
                        <button
                          className="sl-text-button sp-copy"
                          onClick={() =>
                            copyEmail(p.primaryContact.email, p.id)
                          }
                        >
                          <Copy size={12} />
                          {copied === p.id ? "Copied" : "Copy email"}
                        </button>
                      </td>
                      <td>
                        <strong className="sp-fit-score">{p.fitScore}%</strong>
                        <span className={`sl-badge sp-tier-${p.tier}`}>
                          {TIER_LABELS[p.tier]}
                        </span>
                      </td>
                      <td>
                        <span className="sp-status">
                          {enrolled.includes(p.id)
                            ? "Demo cadence prepared"
                            : p.status}
                        </span>
                        <small>{p.lastActive}</small>
                        <small>
                          {p.primaryContact.verified
                            ? "Contact verified"
                            : "Contact unverified"}
                        </small>
                      </td>
                      <td>
                        <button onClick={() => setDrawer(p)}>
                          Inspect <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <div className="sl-empty">
                <Filter size={30} />
                <h3>No prospects match these filters</h3>
                <p>Broaden the intent tier, buying signal, or search.</p>
                <button onClick={resetFilters}>Reset prospect filters</button>
              </div>
            )}
            <div className="sl-pagination">
              <span>
                {filtered.length
                  ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)}`
                  : "0"}{" "}
                of {filtered.length} prospects
              </span>
              <div>
                <label className="sp-page-size">
                  Rows
                  <select
                    aria-label="Prospects per page"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      resetPage();
                    }}
                  >
                    {[4, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
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
            <p className="sl-footnote">
              Fit, tiers, and coverage use the displayed sample prospects.
              Outreach activity is a separate illustrative history. Demo
              enrollment does not send messages or call an API.
            </p>
          </section>
        </div>
      </div>
      <ProspectDrawer
        isOpen={!!drawer}
        prospect={drawer}
        businessName={business.company}
        notes={drawer ? (notes[drawer.id] ?? []) : []}
        onAddNote={(text) => {
          if (drawer)
            setNotes((all) => ({
              ...all,
              [drawer.id]: [...(all[drawer.id] ?? []), text],
            }));
        }}
        onClose={() => setDrawer(null)}
        onEnroll={(p) => {
          setDrawer(null);
          setEnrollIds([p.id]);
        }}
      />
      {enrollIds.length > 0 && (
        <EnrollmentDialog
          count={enrollIds.length}
          business={business.company}
          onClose={() => setEnrollIds([])}
          onConfirm={(sequence) => {
            setEnrolled((ids) => Array.from(new Set([...ids, ...enrollIds])));
            setNotice(
              `Demo enrollment prepared for ${enrollIds.length} ${enrollIds.length === 1 ? "prospect" : "prospects"} in ${business.company} · ${sequence}. No messages sent.`,
            );
            setEnrollIds([]);
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}
function EnrollmentDialog({
  count,
  business,
  onClose,
  onConfirm,
}: {
  count: number;
  business: string;
  onClose: () => void;
  onConfirm: (sequence: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sequence, setSequence] = useState("Enterprise discovery");
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sl-dialog sp-enrollment-dialog"
      aria-labelledby="sp-enroll-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sl-dialog-head">
        <h2 id="sp-enroll-title">Prepare demo enrollment</h2>
        <button aria-label="Close demo enrollment" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="sl-dialog-body">
        <p>
          {count} {count === 1 ? "prospect" : "prospects"} from {business}.
          Choose the cadence to simulate.
        </p>
        <label className="sl-field">
          Outreach cadence
          <select
            value={sequence}
            onChange={(e) => setSequence(e.target.value)}
          >
            <option>Enterprise discovery</option>
            <option>Funding follow-up</option>
            <option>Expansion introduction</option>
          </select>
        </label>
        <p className="sl-footnote">
          This is a local review workflow. No outreach is launched and no client
          records are modified.
        </p>
        <div className="sl-dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="sl-primary" onClick={() => onConfirm(sequence)}>
            <Check size={16} /> Confirm demo enrollment
          </button>
        </div>
      </div>
    </dialog>
  );
}
