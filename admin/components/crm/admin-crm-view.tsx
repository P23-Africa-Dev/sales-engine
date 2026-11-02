"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  dateLabel,
  formatAuditWhen,
  isOpen,
  isOverdue,
  isStale,
  isWonStage,
  issuesFor,
  mapEntryToRecord,
  mapOrganizationToBusiness,
  mergeStageOptions,
  money,
  stageOptionsFromRecords,
  type CrmAudit,
  type CrmBusiness,
  type CrmIssue,
  type CrmRecord,
  type CrmStageOption,
} from "@/lib/admin-crm";
import {
  archiveCrmEntries,
  completeCrmFollowUp,
  createCrmEntryNote,
  dismissCrmDuplicate,
  fetchCrmActivity,
  fetchCrmEntries,
  fetchCrmOverview,
  restoreCrmEntries,
  updateCrmEntry,
  updateCrmReviewPolicy,
  type CrmOverview,
} from "@/lib/api/admin-crm";
import { listAdminOrganizations } from "@/lib/api/admin-organizations";
import { AdminApiError } from "@/lib/api/admin-client";
import { CrmCharts } from "./crm-charts";
import { CrmRecordDrawer } from "./crm-record-drawer";

type View =
  | "Overview"
  | "Client pipelines"
  | "Records"
  | "Data quality"
  | "Activity log";

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

function errMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

export function AdminCrmView() {
  const [businesses, setBusinesses] = useState<CrmBusiness[]>([]);
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [registry, setRegistry] = useState<CrmRecord[]>([]);
  const [registryMeta, setRegistryMeta] = useState({
    current_page: 1,
    last_page: 1,
    per_page: 6,
    total: 0,
  });
  const [overview, setOverview] = useState<CrmOverview | null>(null);
  const [audit, setAudit] = useState<CrmAudit[]>([]);
  const [stages, setStages] = useState<CrmStageOption[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [view, setView] = useState<View>("Overview");
  const [scope, setScope] = useState("all");
  const [selectedBusiness, setSelectedBusiness] = useState("");
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [issueFilter, setIssueFilter] = useState<CrmIssue | "all">("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  const orgId = scope === "all" ? undefined : Number(scope);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [orgs, overviewRes, entriesRes, activityRes] = await Promise.all([
        listAdminOrganizations({ per_page: 100, page: 1 }),
        fetchCrmOverview(orgId),
        fetchCrmEntries({
          organization_id: orgId,
          archived: "exclude",
          sort: "newest",
          per_page: 100,
          page: 1,
        }),
        fetchCrmActivity({
          organization_id: orgId,
          limit: 50,
        }),
      ]);

      const mappedOrgs = orgs.data.map(mapOrganizationToBusiness);
      setBusinesses(mappedOrgs);
      setSelectedBusiness((prev) => {
        if (scope !== "all") return scope;
        if (prev && mappedOrgs.some((b) => b.id === prev)) return prev;
        return mappedOrgs[0]?.id ?? "";
      });

      const mappedEntries = entriesRes.data.map(mapEntryToRecord);
      setRecords(mappedEntries);
      setStages(stageOptionsFromRecords(mappedEntries));
      setSources(
        Array.from(
          new Set(mappedEntries.map((r) => r.source).filter((s) => s && s !== "—")),
        ).sort(),
      );
      setOverview(overviewRes.data);

      const audits: CrmAudit[] = (activityRes.data.audits ?? []).map((a) => ({
        id: String(a.id),
        businessId: a.organization_id != null ? String(a.organization_id) : "all",
        action: a.action || "CRM action",
        detail: a.reason || "",
        actor: a.admin || "Platform admin",
        date: formatAuditWhen(a.created_at),
      }));
      setAudit(audits);
    } catch (err) {
      setError(errMessage(err, "Unable to load CRM workspace."));
    } finally {
      setLoading(false);
    }
  }, [orgId, scope]);

  const loadRegistry = useCallback(async () => {
    setRegistryLoading(true);
    try {
      const sortParam =
        sort === "value" ? "value_desc" : sort === "oldest" ? "oldest" : "newest";
      const result = await fetchCrmEntries({
        organization_id: orgId,
        search: query || undefined,
        stage_slug: stage === "all" ? undefined : stage,
        archived: visibility === "archived" ? "only" : "exclude",
        sort: sortParam,
        page,
        per_page: 6,
      });
      let mapped = result.data.map(mapEntryToRecord);
      if (source !== "all") {
        mapped = mapped.filter((r) => r.source === source);
      }
      setRegistry(mapped);
      setRegistryMeta(result.meta);
      setStages((prev) =>
        mergeStageOptions(prev, stageOptionsFromRecords(mapped), stageOptionsFromRecords(records)),
      );
      setSources((prev) =>
        Array.from(
          new Set([
            ...prev,
            ...mapped.map((r) => r.source).filter((s) => s && s !== "—"),
          ]),
        ).sort(),
      );
    } catch (err) {
      setError(errMessage(err, "Unable to load CRM records."));
    } finally {
      setRegistryLoading(false);
    }
  }, [orgId, query, stage, source, visibility, sort, page, records]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (view === "Records") void loadRegistry();
  }, [view, loadRegistry]);

  const scopedBusinesses = useMemo(
    () => businesses.filter((b) => scope === "all" || b.id === scope),
    [businesses, scope],
  );
  const scoped = useMemo(
    () => records.filter((r) => scope === "all" || r.businessId === scope),
    [records, scope],
  );
  const active = useMemo(() => scoped.filter((r) => !r.archived), [scoped]);
  const open = useMemo(() => active.filter(isOpen), [active]);
  const flagged = useMemo(
    () => active.filter((r) => issuesFor(r).length > 0),
    [active],
  );
  const overdue = useMemo(() => active.filter((r) => isOverdue(r)), [active]);
  const name = useCallback(
    (id: string) => businesses.find((b) => b.id === id)?.name ?? id,
    [businesses],
  );
  const business =
    businesses.find((b) => b.id === selectedBusiness) ?? businesses[0];
  const businessRecords = useMemo(
    () =>
      business
        ? records.filter((r) => r.businessId === business.id && !r.archived)
        : [],
    [records, business],
  );
  const businessStages = useMemo(() => {
    const fromRecords = stageOptionsFromRecords(businessRecords);
    return fromRecords.length ? fromRecords : stages;
  }, [businessRecords, stages]);
  const detail = [...records, ...registry].find((r) => r.id === detailId);
  const policy = businesses.find((b) => b.id === policyId);

  const openValue = useMemo(
    () => open.reduce((sum, r) => sum + r.value, 0),
    [open],
  );
  const openCurrency = open[0]?.currency || "EUR";

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
    const match = stages.find(
      (s) => s.name === next || s.slug === next || s.slug === next.toLowerCase(),
    );
    setStage(match?.slug || next);
  }

  function filterChanged() {
    setPage(1);
    setSelected([]);
  }

  async function refreshAfterMutation() {
    await loadCore();
    if (view === "Records") await loadRegistry();
  }

  async function archiveRecords(ids: string[], reason: string) {
    if (!reason.trim() || busy) return;
    setBusy(true);
    try {
      const numericIds = ids.map(Number).filter((n) => Number.isFinite(n));
      if (visibility === "archived") {
        await restoreCrmEntries(numericIds, reason.trim());
        setNotice(`${ids.length} records restored.`);
      } else {
        await archiveCrmEntries(numericIds, reason.trim());
        setNotice(`${ids.length} records archived.`);
      }
      setSelected([]);
      setBulkReason("");
      await refreshAfterMutation();
    } catch (err) {
      setError(errMessage(err, "Unable to update selected records."));
    } finally {
      setBusy(false);
    }
  }

  async function saveRecord(draft: CrmRecord, reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> & { reason: string } = {
        reason,
        email: draft.email.trim() || null,
      };
      if (draft.stageId) payload.stage_id = draft.stageId;
      if (!draft.owner) payload.assigned_to_user_id = null;
      await updateCrmEntry(draft.numericId, payload);
      setNotice(`${draft.id} updated.`);
      setDetailId(null);
      await refreshAfterMutation();
    } catch (err) {
      setError(errMessage(err, "Unable to save record corrections."));
    } finally {
      setBusy(false);
    }
  }

  async function archiveOne(record: CrmRecord, reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (record.archived) {
        await restoreCrmEntries([record.numericId], reason);
        setNotice(`Record ${record.id} restored.`);
      } else {
        await archiveCrmEntries([record.numericId], reason);
        setNotice(`Record ${record.id} archived.`);
      }
      setDetailId(null);
      await refreshAfterMutation();
    } catch (err) {
      setError(errMessage(err, "Unable to archive or restore record."));
    } finally {
      setBusy(false);
    }
  }

  async function addNote(record: CrmRecord, note: string) {
    if (busy) return;
    setBusy(true);
    try {
      await createCrmEntryNote(record.numericId, note, note);
      const stamped = {
        text: note,
        date: new Date().toISOString().slice(0, 10),
        actor: "Platform admin",
      };
      const patch = (items: CrmRecord[]) =>
        items.map((r) =>
          r.id === record.id ? { ...r, notes: [...r.notes, stamped] } : r,
        );
      setRecords(patch);
      setRegistry(patch);
      setNotice(`Note added to ${record.id}.`);
    } catch (err) {
      setError(errMessage(err, "Unable to add note."));
    } finally {
      setBusy(false);
    }
  }

  async function dismissDuplicate(record: CrmRecord, reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      await dismissCrmDuplicate(record.numericId, reason);
      setNotice(`Duplicate flag dismissed for ${record.id}.`);
      setDetailId(null);
      await refreshAfterMutation();
    } catch (err) {
      setError(errMessage(err, "Unable to dismiss duplicate flag."));
    } finally {
      setBusy(false);
    }
  }

  async function completeFollowUp(record: CrmRecord, reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      await completeCrmFollowUp(record.numericId, reason);
      setNotice(`Follow-up completed for ${record.id}.`);
      setDetailId(null);
      await refreshAfterMutation();
    } catch (err) {
      setError(errMessage(err, "Unable to complete follow-up."));
    } finally {
      setBusy(false);
    }
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
        "Estimated value",
        "Currency",
        "Archived",
      ],
      ...registry.map((r) => [
        r.id,
        name(r.businessId),
        r.company,
        r.contact,
        r.email,
        r.owner,
        r.stage,
        r.source,
        String(r.value),
        r.currency,
        String(r.archived),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "admin-crm-records.csv";
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${registry.length} records from the current page.`);
  }

  if (loading) {
    return (
      <div className="sl-root crm-root">
        <header className="sl-page-head">
          <div>
            <h1>
              CRM<span>.</span>
            </h1>
            <p>Loading client pipelines and records…</p>
          </div>
        </header>
        <div className="sl-empty">Loading CRM workspace…</div>
      </div>
    );
  }

  if (error && !businesses.length && !records.length) {
    return (
      <div className="sl-root crm-root">
        <header className="sl-page-head">
          <div>
            <h1>
              CRM<span>.</span>
            </h1>
            <p>Unable to load the CRM workspace.</p>
          </div>
        </header>
        <div className="sl-empty">
          <CircleAlert size={30} />
          <h3>{error}</h3>
          <button type="button" onClick={() => void loadCore()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const qualityCount =
    overview?.quality_flags
      ? overview.quality_flags.unassigned +
        overview.quality_flags.missing_email +
        overview.quality_flags.possible_duplicates
      : flagged.length;

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
          <span className="sl-demo">Live data</span> Admin workspace
          <small>Platform CRM oversight</small>
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
        <span>Changes require a reason and write to the admin audit trail</span>
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
            {tab === "Data quality" && <span>{qualityCount}</span>}
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
      {error && (
        <div className="sl-notice" role="alert">
          <CircleAlert size={16} />
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
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
                note: `${overview?.totals.entries ?? active.length} CRM records in scope`,
                icon: Building2,
              },
              {
                label: "OPEN PIPELINE",
                value: money(openValue, true, openCurrency),
                note: `${overview?.totals.open ?? open.length} open deals`,
                icon: TrendingUp,
              },
              {
                label: "CLOSED WIN RATE",
                value: `${overview?.totals.win_rate ?? 0}%`,
                note: `${overview?.totals.won ?? 0} won / ${(overview?.totals.won ?? 0) + (overview?.totals.lost ?? 0)} closed deals`,
                icon: Check,
              },
              {
                label: "RECORDS TO REVIEW",
                value: String(qualityCount),
                note: `${overview?.quality_flags.stale ?? overdue.length} stale · ${overdue.length} overdue follow-ups`,
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
            stages={businessStages.length ? businessStages : stages}
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
                    const currency = items[0]?.currency || "EUR";
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
                            false,
                            currency,
                          )}
                        </td>
                        <td>{items.filter(isOpen).length}</td>
                        <td>
                          <Pill tone={count ? "amber" : "mint"}>
                            {count ? `${count} flagged` : "Healthy"}
                          </Pill>
                        </td>
                        <td>{items.filter((r) => isOverdue(r)).length}</td>
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
            {!scopedBusinesses.length && (
              <div className="sl-empty">No client businesses in this scope.</div>
            )}
            <p className="sl-footnote">
              Open value excludes won, lost, and archived records. Win rate is
              won / (won + lost). Data quality counts flagged records once, even
              when they have several issues.
            </p>
          </section>
        </>
      )}
      {view === "Client pipelines" && business && (
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
                    false,
                    businessRecords[0]?.currency || "EUR",
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
              {(businessStages.length
                ? businessStages
                : [{ id: 0, name: "No stages yet", slug: "" }]
              ).map((stageOpt) => {
                const items = businessRecords.filter(
                  (r) =>
                    r.stageSlug === stageOpt.slug ||
                    r.stage === stageOpt.name ||
                    r.stageId === stageOpt.id,
                );
                return (
                  <button
                    key={stageOpt.slug || stageOpt.name}
                    disabled={!stageOpt.slug}
                    onClick={() => {
                      changeScope(business.id);
                      inspectStage(stageOpt.slug || stageOpt.name);
                    }}
                  >
                    <span>{stageOpt.name}</span>
                    <strong>{items.length}</strong>
                    <small>
                      {money(
                        items.reduce((sum, r) => sum + r.value, 0),
                        true,
                        items[0]?.currency || "EUR",
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
              {business.team.length ? (
                business.team.map((owner) => (
                  <div key={owner}>
                    <Users size={16} />
                    <strong>{owner}</strong>
                    <span>
                      {businessRecords.filter((r) => r.owner === owner).length}{" "}
                      records
                    </span>
                  </div>
                ))
              ) : (
                <div className="sl-empty">No team members listed for this client.</div>
              )}
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
              Stages come from each client’s CRM pipeline configuration. Review
              policy determines stale-deal flags; it does not contact clients or
              change their automations.
            </p>
          </section>
        </div>
      )}
      {view === "Client pipelines" && !business && (
        <div className="sl-empty">
          <Building2 size={30} />
          <h3>No client businesses yet</h3>
          <p>Create organizations in Account Management to inspect pipelines.</p>
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
              {stages.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
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
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
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
                disabled={!bulkReason.trim() || busy}
                onClick={() => void archiveRecords(selected, bulkReason)}
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
                        registry.length > 0 &&
                        registry.every((r) => selected.includes(r.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? registry.map((r) => r.id) : [],
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
                {registry.map((r) => (
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
                      <Pill tone={isWonStage(r) ? "mint" : "neutral"}>
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
                    <td>{money(r.value, false, r.currency)}</td>
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
          {registryLoading && (
            <div className="sl-empty">Loading records…</div>
          )}
          {!registryLoading && !registry.length && (
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
              {registryMeta.total
                ? `${(registryMeta.current_page - 1) * registryMeta.per_page + 1}–${Math.min(registryMeta.current_page * registryMeta.per_page, registryMeta.total)}`
                : "0"}{" "}
              of {registryMeta.total} records
            </span>
            <div>
              <button
                disabled={registryMeta.current_page <= 1 || registryLoading}
                onClick={() => setPage(registryMeta.current_page - 1)}
              >
                Previous
              </button>
              <span>
                {registryMeta.current_page} / {registryMeta.last_page || 1}
              </span>
              <button
                disabled={
                  registryMeta.current_page >= registryMeta.last_page ||
                  registryLoading
                }
                onClick={() => setPage(registryMeta.current_page + 1)}
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
            Dismissing a flag keeps both records separate. This workspace does
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
                        {a.businessId !== "all"
                          ? `${name(a.businessId)} · `
                          : ""}
                        {a.actor}
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
          business={
            businesses.find((b) => b.id === detail.businessId) ?? {
              id: detail.businessId,
              name: name(detail.businessId),
              industry: "—",
              owner: "",
              team: detail.owner ? [detail.owner] : [],
              pipeline: detail.stage,
              staleDays: 7,
            }
          }
          stages={stages}
          duplicate={records.find(
            (r) =>
              detail.duplicateOf &&
              (r.id === detail.duplicateOf ||
                r.numericId === Number(detail.duplicateOf)) &&
              r.businessId === detail.businessId,
          )}
          onClose={() => setDetailId(null)}
          onSave={(draft, reason) => void saveRecord(draft, reason)}
          onArchive={(reason) => void archiveOne(detail, reason)}
          onNote={(note) => void addNote(detail, note)}
          onDuplicate={(reason) => void dismissDuplicate(detail, reason)}
          onFollowup={(reason) => void completeFollowUp(detail, reason)}
        />
      )}
      {policy && (
        <PolicyDialog
          business={policy}
          onClose={() => setPolicyId(null)}
          onSave={async (days, reason) => {
            try {
              await updateCrmReviewPolicy(Number(policy.id), days, reason);
              setBusinesses((items) =>
                items.map((b) =>
                  b.id === policy.id ? { ...b, staleDays: days } : b,
                ),
              );
              setPolicyId(null);
              setNotice(`Review policy updated for ${policy.name}.`);
              await loadCore();
            } catch (err) {
              setError(errMessage(err, "Unable to update review policy."));
            }
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
  onSave: (days: number, reason: string) => void | Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [days, setDays] = useState(business.staleDays);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
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
          setSaving(true);
          void Promise.resolve(onSave(days, reason.trim())).finally(() =>
            setSaving(false),
          );
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
            disabled={!reason.trim() || saving}
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
