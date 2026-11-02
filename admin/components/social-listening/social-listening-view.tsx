"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  REVIEW_TO_API,
  SOURCES,
  enabledKeysFromSources,
  formatRunDate,
  formatRunStatus,
  isActiveRunStatus,
  normalizeSourceLabel,
  sourcesFromEnabledKeys,
  type ListeningBusiness,
  type ReviewStatus,
  type Scan,
  type Signal,
} from "@/lib/social-listening";
import {
  fetchSocialOverview,
  fetchSocialRuns,
  fetchSocialSettings,
  fetchSocialSignals,
  pauseSocialListening,
  queueSocialRun,
  resumeSocialListening,
  retrySocialRun,
  reviewSocialSignals,
  updateSocialSettings,
  type SocialOverview,
  type SocialRun,
  type SocialSettings,
  type SocialSignalRow,
} from "@/lib/api/admin-social";
import {
  listAdminOrganizations,
  type AdminOrganization,
} from "@/lib/api/admin-organizations";
import { AdminApiError } from "@/lib/api/admin-client";

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
const SIGNALS_PER_PAGE = 6;
const ANALYTICS_SIGNAL_LIMIT = 100;

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

function mapSignal(row: SocialSignalRow): Signal {
  return {
    id: String(row.id),
    businessId: String(row.organization_id),
    company: row.company ?? "—",
    author: row.author ?? "—",
    source: normalizeSourceLabel(row.source),
    title: row.title ?? "Untitled signal",
    quote: row.quote ?? "",
    reason: "Matched against the client's listening rules and quality thresholds.",
    score: Math.round(Number(row.score) || 0),
    stage: row.stage ?? "—",
    status: row.status || "Needs review",
    issue: null,
    crm: Boolean(row.crm),
    date: row.date ?? "",
  };
}

function mapRun(run: SocialRun): Scan {
  const raw = run.status ?? "";
  return {
    id: String(run.id),
    businessId: String(run.organization_id),
    status: formatRunStatus(raw),
    source: "All sources",
    found: Number(run.signals_created ?? 0),
    date: formatRunDate(run.started_at ?? run.created_at ?? run.finished_at ?? null),
    error: run.error ?? undefined,
    rawStatus: raw,
  };
}

function mapOrgToBusiness(
  org: AdminOrganization,
  settings?: SocialSettings | null,
): ListeningBusiness {
  const intent = settings?.intent_filters;
  const keywords = Array.isArray(intent)
    ? intent.join(", ")
    : typeof intent === "string"
      ? intent
      : typeof settings?.keywords === "string"
        ? settings.keywords
        : Array.isArray(settings?.keywords)
          ? settings.keywords.join(", ")
          : "";
  const cadenceRaw = Number(settings?.cadence_days ?? 14);
  const cadence: 14 | 30 = cadenceRaw === 30 ? 30 : 14;
  const destination =
    settings?.crm_destination === "human_review" ||
    settings?.destination === "human_review"
      ? "human_review"
      : "qualified_pipeline";
  return {
    id: String(org.id),
    name: org.name,
    owner: org.owner?.name || "Invited owner",
    industry: org.industry || "—",
    paused: Boolean(settings?.admin_paused_at),
    sources: sourcesFromEnabledKeys(
      settings?.enabled_sources ?? settings?.sources,
    ),
    cadence,
    minScore: Number(settings?.min_score ?? 55),
    freshness: Number(
      settings?.freshness_window_days ?? settings?.freshness_days ?? 30,
    ),
    destination,
    keywords: keywords || "Default intent filters",
    icp:
      (typeof settings?.icp_summary === "string" && settings.icp_summary) ||
      `${org.industry || "Business"} · ${org.scope || org.purpose || "Listening profile"}`,
    settingsLoaded: Boolean(settings),
  };
}

function applySettingsToBusiness(
  business: ListeningBusiness,
  settings: SocialSettings,
): ListeningBusiness {
  const intent = settings.intent_filters;
  const keywords = Array.isArray(intent)
    ? intent.join(", ")
    : typeof intent === "string"
      ? intent
      : "";
  const cadenceRaw = Number(settings.cadence_days ?? business.cadence);
  return {
    ...business,
    paused: Boolean(settings.admin_paused_at),
    sources: sourcesFromEnabledKeys(settings.enabled_sources ?? settings.sources),
    cadence: cadenceRaw === 30 ? 30 : 14,
    minScore: Number(settings.min_score ?? business.minScore),
    freshness: Number(
      settings.freshness_window_days ??
        settings.freshness_days ??
        business.freshness,
    ),
    destination:
      settings.crm_destination === "human_review" ||
      settings.destination === "human_review"
        ? "human_review"
        : "qualified_pipeline",
    keywords: keywords || business.keywords,
    icp:
      (typeof settings.icp_summary === "string" && settings.icp_summary) ||
      business.icp,
    settingsLoaded: true,
  };
}

export function SocialListeningView() {
  const [view, setView] = useState<View>("Overview");
  const [businesses, setBusinesses] = useState<ListeningBusiness[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [analyticsSignals, setAnalyticsSignals] = useState<Signal[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [overview, setOverview] = useState<SocialOverview | null>(null);
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [signalTotal, setSignalTotal] = useState(0);
  const [signalLastPage, setSignalLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const businessName = (id: string) =>
    businesses.find((b) => b.id === id)?.name ?? id;
  const orgIdParam = scope === "all" ? undefined : Number(scope);
  const scopedBusinesses = businesses.filter(
    (b) => scope === "all" || b.id === scope,
  );
  const scopedScans = scans.filter(
    (s) => scope === "all" || s.businessId === scope,
  );
  const pendingCount =
    overview?.totals.needs_review ??
    analyticsSignals.filter((s) => s.status === "Needs review").length;
  const failures = scopedScans.filter((s) => s.status === "Failed");
  const detail = signals.find((s) => s.id === detailId)
    ?? analyticsSignals.find((s) => s.id === detailId);
  const scanDetail = scans.find((s) => s.id === scanId);
  const settings = businesses.find((b) => b.id === settingsId);
  const selectedBusiness = businesses.find((b) => b.id === scope);

  const chartSignals = useMemo(() => {
    if (view === "Signal review") return signals;
    return analyticsSignals;
  }, [view, signals, analyticsSignals]);

  const loadSettingsForOrg = useCallback(async (orgId: number) => {
    try {
      const result = await fetchSocialSettings(orgId);
      setBusinesses((items) =>
        items.map((b) =>
          b.id === String(orgId) ? applySettingsToBusiness(b, result.data) : b,
        ),
      );
      return result.data;
    } catch {
      return null;
    }
  }, []);

  const loadOverview = useCallback(async () => {
    const result = await fetchSocialOverview(orgIdParam);
    setOverview(result.data);
  }, [orgIdParam]);

  const loadOrganizations = useCallback(async () => {
    const result = await listAdminOrganizations({ per_page: 100, page: 1 });
    const orgs = result.data;
    const withSettings = await Promise.all(
      orgs.map(async (org) => {
        try {
          const settingsResult = await fetchSocialSettings(org.id);
          return mapOrgToBusiness(org, settingsResult.data);
        } catch {
          return mapOrgToBusiness(org, null);
        }
      }),
    );
    setBusinesses(withSettings);
  }, []);

  const loadAnalyticsSignals = useCallback(async () => {
    const result = await fetchSocialSignals({
      organization_id: orgIdParam,
      per_page: ANALYTICS_SIGNAL_LIMIT,
      page: 1,
    });
    setAnalyticsSignals(result.data.map(mapSignal));
  }, [orgIdParam]);

  const loadSignals = useCallback(async () => {
    setSignalsLoading(true);
    try {
      const result = await fetchSocialSignals({
        organization_id: orgIdParam,
        source: source === "all" ? undefined : source,
        status: status === "all" ? undefined : status,
        search: search.trim() || undefined,
        page,
        per_page: SIGNALS_PER_PAGE,
      });
      setSignals(result.data.map(mapSignal));
      setSignalTotal(result.meta.total);
      setSignalLastPage(Math.max(1, result.meta.last_page));
    } finally {
      setSignalsLoading(false);
    }
  }, [orgIdParam, source, status, search, page]);

  const loadRuns = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setRunsLoading(true);
    try {
      const result = await fetchSocialRuns({
        organization_id: orgIdParam,
        per_page: 50,
        page: 1,
      });
      setScans(result.data.map(mapRun));
    } finally {
      if (!opts?.quiet) setRunsLoading(false);
    }
  }, [orgIdParam]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([
        loadOrganizations(),
        fetchSocialOverview().then((result) => setOverview(result.data)),
        fetchSocialSignals({ per_page: ANALYTICS_SIGNAL_LIMIT, page: 1 }).then(
          (result) => setAnalyticsSignals(result.data.map(mapSignal)),
        ),
        fetchSocialRuns({ per_page: 50, page: 1 }).then((result) =>
          setScans(result.data.map(mapRun)),
        ),
      ]);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to load social listening data.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadOrganizations]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (loading) return;
    void loadOverview().catch(() => undefined);
    void loadAnalyticsSignals().catch(() => undefined);
    void loadRuns().catch(() => undefined);
  }, [orgIdParam, loading, loadOverview, loadAnalyticsSignals, loadRuns]);

  useEffect(() => {
    if (view !== "Signal review") return;
    void loadSignals().catch((err) => {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to load signals.",
      );
    });
  }, [view, loadSignals]);

  useEffect(() => {
    if (scope !== "all") {
      void loadSettingsForOrg(Number(scope));
    }
  }, [scope, loadSettingsForOrg]);

  useEffect(() => {
    const active = scans.some((s) => isActiveRunStatus(s.rawStatus ?? s.status));
    if (!active) return;
    const timer = window.setInterval(() => {
      void loadRuns({ quiet: true }).catch(() => undefined);
      void loadOverview().catch(() => undefined);
      void loadAnalyticsSignals().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [scans, loadRuns, loadOverview, loadAnalyticsSignals]);

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

  const review = async (ids: string[], next: ReviewStatus, note: string) => {
    if (!note.trim()) {
      setNotice("Add a review reason before updating signals.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await reviewSocialSignals(
        ids.map(Number),
        REVIEW_TO_API[next],
        note.trim(),
      );
      setSelected([]);
      setReason("");
      setDetailId(null);
      setNotice(
        `${ids.length} signal${ids.length === 1 ? "" : "s"} updated to ${next.toLowerCase()}. Approval records a quality decision only — it does not create a CRM record.`,
      );
      await Promise.all([loadSignals(), loadAnalyticsSignals(), loadOverview()]);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to update signal review status.",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleMonitoring = async (b: ListeningBusiness) => {
    setBusy(true);
    setError("");
    try {
      const result = b.paused
        ? await resumeSocialListening(Number(b.id), "Resumed by platform admin.")
        : await pauseSocialListening(Number(b.id), "Paused by platform admin.");
      setBusinesses((items) =>
        items.map((item) =>
          item.id === b.id ? applySettingsToBusiness(item, result.data) : item,
        ),
      );
      setNotice(
        `${b.name}: monitoring ${b.paused ? "resumed" : "paused"}. Existing signals retained.`,
      );
      await loadOverview();
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to update monitoring status.",
      );
    } finally {
      setBusy(false);
    }
  };

  const queueScan = async (b: ListeningBusiness, scan?: Scan) => {
    if (
      b.paused ||
      scans.some(
        (s) =>
          s.businessId === b.id && isActiveRunStatus(s.rawStatus ?? s.status),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (scan) {
        await retrySocialRun(Number(scan.id));
        setNotice(`Retry queued for run ${scan.id} (${b.name}).`);
      } else {
        await queueSocialRun(Number(b.id));
        setNotice(`Scan queued for ${b.name}.`);
      }
      setScanId(null);
      await loadRuns();
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to queue social listening run.",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveConfiguration = async (updated: ListeningBusiness) => {
    setBusy(true);
    setError("");
    try {
      const result = await updateSocialSettings(Number(updated.id), {
        enabled_sources: enabledKeysFromSources(updated.sources),
        cadence_days: updated.cadence,
        min_score: updated.minScore,
        freshness_window_days: updated.freshness,
        crm_destination: updated.destination,
        reason: "Updated via admin social listening.",
      });
      setBusinesses((items) =>
        items.map((b) =>
          b.id === updated.id ? applySettingsToBusiness(b, result.data) : b,
        ),
      );
      setSettingsId(null);
      setNotice(`Configuration saved for ${updated.name}.`);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to save social listening settings.",
      );
    } finally {
      setBusy(false);
    }
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
      ...signals.map((s) => [
        s.id,
        businessName(s.businessId),
        s.company,
        String(s.source),
        String(s.score),
        s.stage,
        String(s.status),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "social-listening-signals.csv";
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${signals.length} signals from the current page.`);
  };

  const openSettings = async (id: string) => {
    setSettingsId(id);
    await loadSettingsForOrg(Number(id));
  };

  if (loading) {
    return (
      <div className="sl-root">
        <header className="sl-page-head">
          <div>
            <h1>
              Social Listening<span>.</span>
            </h1>
            <p>Loading live monitoring data…</p>
          </div>
        </header>
        <div className="sl-empty">
          <Radar size={30} />
          <h3>Loading social listening</h3>
          <p>Fetching organizations, signals, and run history.</p>
        </div>
      </div>
    );
  }

  if (error && !businesses.length && !overview) {
    return (
      <div className="sl-root">
        <header className="sl-page-head">
          <div>
            <h1>
              Social Listening<span>.</span>
            </h1>
            <p>Unable to load the admin social listening workspace.</p>
          </div>
        </header>
        <div className="sl-empty">
          <CircleAlert size={30} />
          <h3>Couldn’t load social listening</h3>
          <p>{error}</p>
          <button onClick={() => void bootstrap()}>Retry</button>
        </div>
      </div>
    );
  }

  const monitored = scopedBusinesses.filter((b) => !b.paused).length;
  const pausedCount =
    overview?.totals.paused_organizations ??
    scopedBusinesses.filter((b) => b.paused).length;
  const signalsCaptured = overview?.totals.signals ?? analyticsSignals.length;
  const awaitingReview = overview?.totals.needs_review ?? pendingCount;

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
          Admin workspace
          <small>Live · social listening APIs</small>
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
        <span>Changes persist through the admin API</span>
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
            {name === "Signal review" && <span>{awaitingReview}</span>}
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
      {error && (
        <div className="sl-notice" role="alert">
          <CircleAlert size={17} />
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
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
                value: monitored,
                note: `${pausedCount} paused · ${scopedBusinesses.length} total`,
                icon: Building2,
              },
              {
                label: "SIGNALS CAPTURED",
                value: signalsCaptured,
                note: "Across all sources in this scope",
                icon: Radar,
              },
              {
                label: "AWAITING REVIEW",
                value: awaitingReview,
                note: `${overview?.totals.approved ?? 0} approved · ${overview?.totals.suppressed ?? 0} suppressed`,
                icon: ShieldCheck,
              },
              {
                label: "SCANS NEED ATTENTION",
                value: failures.length,
                note: `${scopedScans.filter((s) => isActiveRunStatus(s.rawStatus ?? s.status)).length} in progress · provider operations`,
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
            signals={chartSignals}
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
                      <td>
                        {b.sources.length ? b.sources.join(" · ") : "—"}
                      </td>
                      <td>
                        {
                          analyticsSignals.filter((s) => s.businessId === b.id)
                            .length
                        }
                      </td>
                      <td>
                        {
                          analyticsSignals.filter(
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
            {!scopedBusinesses.length && (
              <div className="sl-empty">
                <Building2 size={30} />
                <h3>No organizations found</h3>
                <p>Create a client business in Account Management to begin monitoring.</p>
              </div>
            )}
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
                  <button
                    disabled={busy}
                    onClick={() => void openSettings(selectedBusiness.id)}
                  >
                    <Settings2 size={16} /> Edit configuration
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void toggleMonitoring(selectedBusiness)}
                  >
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
                      busy ||
                      selectedBusiness.paused ||
                      scans.some(
                        (s) =>
                          s.businessId === selectedBusiness.id &&
                          isActiveRunStatus(s.rawStatus ?? s.status),
                      )
                    }
                    onClick={() => void queueScan(selectedBusiness)}
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
                    <strong>
                      {selectedBusiness.sources.length
                        ? selectedBusiness.sources.join(" · ")
                        : "—"}
                    </strong>
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
                {signalsLoading && (
                  <p className="sl-footnote">Loading recent signals…</p>
                )}
                {!signalsLoading &&
                  (scope === "all"
                    ? analyticsSignals
                    : analyticsSignals.filter((s) => s.businessId === scope)
                  )
                    .slice(0, 4)
                    .map((s) => (
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
                          tone={
                            s.status === "Needs review" ? "amber" : "neutral"
                          }
                        >
                          {s.status}
                        </Badge>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                {!signalsLoading &&
                  !(scope === "all"
                    ? analyticsSignals
                    : analyticsSignals.filter((s) => s.businessId === scope)
                  ).length && (
                    <p className="sl-empty">No signals captured for this business yet.</p>
                  )}
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
            <button onClick={exportSignals} disabled={!signals.length}>
              <ArrowDownToLine size={16} /> Export page signals
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
                disabled={!reason.trim() || busy}
                onClick={() => void review(selected, "Approved", reason)}
              >
                Approve
              </button>
              <button
                disabled={!reason.trim() || busy}
                onClick={() => void review(selected, "Suppressed", reason)}
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
                        signals.length > 0 &&
                        signals.every((s) => selected.includes(s.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? signals.map((s) => s.id) : [],
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
                {signals.map((s) => (
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
          {signalsLoading && (
            <div className="sl-empty">
              <Radar size={30} />
              <h3>Loading signals…</h3>
            </div>
          )}
          {!signalsLoading && !signals.length && (
            <div className="sl-empty">
              <Radar size={30} />
              <h3>No signals match these filters</h3>
              <p>Try another source, review status, or search term.</p>
              <button
                onClick={() => {
                  setSource("all");
                  setStatus("all");
                  setSearch("");
                  setPage(1);
                }}
              >
                Reset filters
              </button>
            </div>
          )}
          <div className="sl-pagination">
            <span>
              {signalTotal
                ? `${(page - 1) * SIGNALS_PER_PAGE + 1}–${Math.min(page * SIGNALS_PER_PAGE, signalTotal)}`
                : "0"}{" "}
              of {signalTotal} signals
            </span>
            <div>
              <button
                disabled={page === 1 || signalsLoading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                {page} / {signalLastPage}
              </span>
              <button
                disabled={page >= signalLastPage || signalsLoading}
                onClick={() => setPage(page + 1)}
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
              const enabledCount = scopedBusinesses.filter((b) =>
                b.sources.includes(s),
              ).length;
              const sourceCount =
                overview?.by_source.find(
                  (row) =>
                    normalizeSourceLabel(row.source) === s ||
                    (row.source ?? "").toLowerCase() === s.toLowerCase(),
                )?.count ?? 0;
              return (
                <div key={s}>
                  <strong>{s}</strong>
                  <Badge
                    tone={
                      enabledCount
                        ? sourceCount
                          ? "mint"
                          : "neutral"
                        : "neutral"
                    }
                  >
                    {enabledCount ? (sourceCount ? "Active" : "Enabled") : "No runs"}
                  </Badge>
                  <small>
                    {sourceCount} signals · {enabledCount} businesses enabled
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
                    <td>
                      {isActiveRunStatus(r.rawStatus ?? r.status)
                        ? "—"
                        : r.found}
                    </td>
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
          {runsLoading && !scopedScans.length && (
            <div className="sl-empty">
              <Activity size={30} />
              <h3>Loading runs…</h3>
            </div>
          )}
          {!runsLoading && !scopedScans.length && (
            <div className="sl-empty">
              <Activity size={30} />
              <h3>No scan runs yet</h3>
              <p>Queue a scan from a business workspace to start collecting signals.</p>
            </div>
          )}
          <p className="sl-footnote">
            Active runs refresh automatically every few seconds until they
            complete or fail. Queued retries create a new run while preserving
            the original failure record.
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
            <Badge>0 events</Badge>
          </div>
          <div className="sl-audit">
            <div className="sl-empty">
              No durable activity feed is exposed on the admin social listening
              API yet. Review actions still write server-side audit records.
            </div>
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
            {detail.quote ? <blockquote>“{detail.quote}”</blockquote> : null}
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
                disabled={
                  !reason.trim() || busy || detail.status === "Suppressed"
                }
                onClick={() => void review([detail.id], "Suppressed", reason)}
              >
                Suppress signal
              </button>
              <button
                disabled={
                  !reason.trim() || busy || detail.status === "Needs review"
                }
                onClick={() => void review([detail.id], "Needs review", reason)}
              >
                Return to review
              </button>
              <button
                className="sl-primary"
                disabled={
                  !reason.trim() || busy || detail.status === "Approved"
                }
                onClick={() => void review([detail.id], "Approved", reason)}
              >
                <Check size={16} /> Approve
              </button>
            </div>
            <p className="sl-footnote">
              Approve records a quality decision only. It does not create a CRM
              record or send outreach.
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
            key={`${settings.id}-${settings.settingsLoaded ? "ready" : "pending"}`}
            business={settings}
            busy={busy}
            onSave={(updated) => void saveConfiguration(updated)}
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
                  (isActiveRunStatus(scanDetail.rawStatus ?? scanDetail.status)
                    ? "Run is in progress. This view refreshes automatically while the worker is active."
                    : `Source collection finished. ${scanDetail.found} signals created on this run.`)}
              </p>
            </div>
            {scanDetail.status === "Failed" && (
              <button
                className="sl-primary"
                disabled={
                  busy ||
                  businesses.find((b) => b.id === scanDetail.businessId)
                    ?.paused ||
                  scans.some(
                    (s) =>
                      s.businessId === scanDetail.businessId &&
                      isActiveRunStatus(s.rawStatus ?? s.status),
                  )
                }
                onClick={() => {
                  const b = businesses.find(
                    (item) => item.id === scanDetail.businessId,
                  );
                  if (b) void queueScan(b, scanDetail);
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
  busy,
}: {
  business: ListeningBusiness;
  onSave: (b: ListeningBusiness) => void;
  busy?: boolean;
}) {
  const [draft, setDraft] = useState(business);
  useEffect(() => {
    setDraft(business);
  }, [business]);
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
          value={draft.keywords}
          onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
          readOnly
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
            {[7, 14, 30, 90, 180].map((n) => (
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
            min="40"
            max="90"
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
        inspection. Intent keywords are managed on the client ICP profile.
      </p>
      <div className="sl-dialog-actions">
        <button
          type="submit"
          className="sl-primary"
          disabled={busy || !draft.sources.length}
        >
          <Check size={16} /> Save configuration
        </button>
      </div>
    </form>
  );
}
