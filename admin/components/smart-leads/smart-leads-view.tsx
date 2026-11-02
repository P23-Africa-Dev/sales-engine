"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  listAdminOrganizations,
  type AdminOrganization,
} from "@/lib/api/admin-organizations";
import { AdminApiError } from "@/lib/api/admin-client";
import {
  createLeadAdminNote,
  fetchLeadDetail,
  fetchOrganizationLeads,
  fetchSmartLeadsAnalytics,
  prepareLeadsOutreach,
  type AdminLead,
  type AdminLeadNote,
  type SmartLeadsAnalytics as SmartLeadsAnalyticsData,
} from "@/lib/api/admin-smart-leads";
import type {
  ProspectTier,
  SmartLead,
  SmartLeadActivity,
  VelocityDayPoint,
} from "@/lib/smart-leads";
import { ProspectDrawer } from "./prospect-drawer";
import { SmartLeadsAnalytics, TIER_LABELS } from "./smart-leads-analytics";

const AVATARS = ["#c9ae4d", "#087f83", "#7856a5", "#4766aa", "#a76a27", "#a35c74"];

type ClientBusiness = {
  id: string;
  name: string;
  company: string;
  industry: string;
  country: string;
  owner: string;
  avatarColor: string;
  leadsCount: number;
  prospectPool: number;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeTier(tier: string | undefined | null, score?: number | null): ProspectTier {
  if (tier === "high" || tier === "middle" || tier === "low") return tier;
  const value = Number(score ?? 0);
  if (value >= 75) return "high";
  if (value >= 50) return "middle";
  return "low";
}

function intentLevelFor(tier: ProspectTier, score: number): SmartLead["intentLevel"] {
  if (tier === "high" && score >= 90) return "Very High";
  if (tier === "high") return "High";
  if (tier === "middle") return "Medium";
  return "Low";
}

function statusFor(lead: AdminLead): SmartLead["status"] {
  if (lead.admin_outreach_prepared) return "In Cadence";
  const stage = (lead.stage ?? "").toLowerCase();
  if (stage.includes("meeting")) return "Meeting Booked";
  if (stage.includes("engaged") || stage.includes("replied")) return "Engaged";
  if (stage.includes("new") || !stage) return "New Match";
  return "Uncontacted";
}

function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function noteText(note: AdminLeadNote): string {
  return asString(note.note) || asString(note.text);
}

function noteActor(note: AdminLeadNote): string {
  return asString(note.admin_name) || asString(note.actor) || "Admin";
}

function noteWhen(note: AdminLeadNote): string {
  return formatWhen(note.created_at ?? note.at ?? null);
}

function mapOrg(org: AdminOrganization): ClientBusiness {
  return {
    id: String(org.id),
    name: org.name,
    company: org.name,
    industry: org.industry || "—",
    country: org.country || "—",
    owner: org.owner?.name || "Invited owner",
    avatarColor: AVATARS[org.id % AVATARS.length],
    leadsCount: org.leads_count ?? 0,
    prospectPool: org.prospect_pool ?? 0,
  };
}

function mapAdminLead(lead: AdminLead, orgId: string): SmartLead {
  const meta = (lead.meta ?? {}) as Record<string, unknown>;
  const score = Math.round(Number(lead.score ?? 0));
  const tier = normalizeTier(lead.tier, score);
  const company =
    asString(lead.company) ||
    asString(meta.company) ||
    asString(lead.name) ||
    `Lead #${lead.id}`;
  const email = asString(lead.email) || asString(meta.email);
  const phone = asString(lead.phone) || asString(meta.phone);
  const location =
    asString(lead.location) ||
    asString(meta.location) ||
    asString(meta.city) ||
    "—";
  const country = asString(meta.country) || "—";
  const website = asString(lead.website) || asString(meta.website) || "—";
  const title =
    asString(meta.title) || asString(meta.job_title) || "Decision maker";
  const industry =
    asString(meta.industry) || asString(lead.source) || "—";
  const intentTrigger =
    asString(meta.intent_trigger) ||
    asString(meta.buying_signal) ||
    asString(lead.summary) ||
    "Review fit evidence in prospect details";
  const whyNow =
    asString(lead.summary) ||
    asString(meta.why_now) ||
    asString(meta.reason) ||
    "No additional summary available for this lead yet.";
  const matchedPresets = asStringArray(meta.matched_presets).length
    ? asStringArray(meta.matched_presets)
    : asStringArray(meta.buying_signals);
  const techStack = asStringArray(meta.tech_stack).length
    ? asStringArray(meta.tech_stack)
    : asStringArray(meta.techStack);

  return {
    id: String(lead.id),
    businessId: orgId,
    company,
    industry,
    location,
    country,
    employees: asString(meta.employees) || asString(meta.company_size) || "—",
    website,
    revenue: asString(meta.revenue) || "—",
    fitScore: score,
    tier,
    intentLevel: intentLevelFor(tier, score),
    intentTrigger,
    whyNow,
    primaryContact: {
      name: asString(lead.name) || company,
      title,
      email: email || "—",
      phone: phone || "—",
      verified: Boolean(email || phone),
      avatarColor: AVATARS[lead.id % AVATARS.length],
      linkedin: asString(meta.linkedin_url) || asString(meta.linkedin) || undefined,
    },
    techStack,
    matchedPresets,
    status: statusFor(lead),
    lastActive: formatWhen(lead.created_at),
    activities: [],
  };
}

function mapDetailActivities(
  activities: unknown[],
  signals: unknown[],
): SmartLeadActivity[] {
  const fromOutreach = activities.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const channel = asString(row.channel, "Email");
    const status = asString(row.status, "draft");
    return {
      id: `act-${asString(row.id, String(index))}`,
      type: "email" as const,
      title: asString(row.name) || `${channel} activity`,
      time: formatWhen(asString(row.occurred_at) || null),
      channel,
      author: "Outreach",
      status,
      description: `${channel} · ${status}`,
      badgeColor: "#0284c7",
    };
  });

  const fromSignals = signals.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      id: `sig-${asString(row.id, String(index))}`,
      type: "signal" as const,
      title: asString(row.intent_label) || asString(row.source) || "Buying signal",
      time: formatWhen(asString(row.posted_at) || null),
      channel: asString(row.source) || "Intelligence Signal",
      author: "Social Listening",
      status: asString(row.status, "new"),
      description: asString(row.summary) || "Signal detected for this account.",
      badgeColor: "#c9ae4d",
    };
  });

  return [...fromSignals, ...fromOutreach];
}

function mapVelocity(
  points: SmartLeadsAnalyticsData["outreach_velocity"] | undefined,
): VelocityDayPoint[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  return points.map((point) => ({
    day: point.day,
    dayLabel: point.dayLabel || point.day,
    touches: Number(point.touches ?? 0),
    opens: Number(point.opens ?? 0),
    replies: Number(point.replies ?? 0),
    meetings: Number(point.meetings ?? 0),
  }));
}

function notesFromLead(lead: AdminLead | null | undefined): string[] {
  return (lead?.admin_notes ?? [])
    .map((note) => {
      const text = noteText(note);
      if (!text) return "";
      const actor = noteActor(note);
      const when = noteWhen(note);
      return when !== "—" ? `${text}\n${actor} · ${when}` : `${text}\n${actor}`;
    })
    .filter(Boolean);
}

export function SmartLeadsView() {
  const [clients, setClients] = useState<ClientBusiness[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [showMobileClients, setShowMobileClients] = useState(false);
  const [businessQuery, setBusinessQuery] = useState("");
  const [industry, setIndustry] = useState("all");
  const [sort, setSort] = useState("prospects");
  const [tier, setTier] = useState<"all" | ProspectTier>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [signal, setSignal] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [prospects, setProspects] = useState<SmartLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState("");
  const [analytics, setAnalytics] = useState<SmartLeadsAnalyticsData | null>(null);
  const [velocity, setVelocity] = useState<VelocityDayPoint[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<SmartLead | null>(null);
  const [drawerNotes, setDrawerNotes] = useState<string[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [enrollIds, setEnrollIds] = useState<string[]>([]);
  const [preparedIds, setPreparedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsError("");
    try {
      const result = await listAdminOrganizations({
        search: businessQuery || undefined,
        industry: industry === "all" ? undefined : industry,
        per_page: 100,
        page: 1,
      });
      const mapped = result.data.map(mapOrg).sort((a, b) => {
        if (sort === "fit") return b.prospectPool - a.prospectPool;
        if (sort === "emails") return b.prospectPool - a.prospectPool;
        return b.leadsCount - a.leadsCount;
      });
      setClients(mapped);
      setBusinessId((prev) => {
        if (prev && mapped.some((c) => c.id === prev)) return prev;
        return mapped[0]?.id ?? "";
      });
    } catch (err) {
      setClientsError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to load client businesses.",
      );
    } finally {
      setClientsLoading(false);
    }
  }, [businessQuery, industry, sort]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const loadLeads = useCallback(async () => {
    if (!businessId) {
      setProspects([]);
      setTotal(0);
      setLastPage(1);
      return;
    }
    setLeadsLoading(true);
    setLeadsError("");
    try {
      const result = await fetchOrganizationLeads(Number(businessId), {
        tier,
        signal,
        search: debouncedQuery || undefined,
        page,
        per_page: pageSize,
      });
      setProspects(result.data.map((lead) => mapAdminLead(lead, businessId)));
      setTotal(result.meta.total);
      setLastPage(Math.max(1, result.meta.last_page));
      setPreparedIds((prev) => {
        const next = new Set(prev);
        for (const lead of result.data) {
          if (lead.admin_outreach_prepared) next.add(String(lead.id));
        }
        return Array.from(next);
      });
    } catch (err) {
      setProspects([]);
      setTotal(0);
      setLastPage(1);
      setLeadsError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to load prospects for this client.",
      );
    } finally {
      setLeadsLoading(false);
    }
  }, [businessId, tier, signal, debouncedQuery, page, pageSize]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const loadAnalytics = useCallback(async () => {
    if (!businessId) {
      setAnalytics(null);
      setVelocity([]);
      return;
    }
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const result = await fetchSmartLeadsAnalytics(Number(businessId));
      setAnalytics(result.data);
      setVelocity(mapVelocity(result.data.outreach_velocity));
    } catch (err) {
      setAnalytics(null);
      setVelocity([]);
      setAnalyticsError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to load smart leads analytics.",
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const business = useMemo(
    () => clients.find((b) => b.id === businessId) ?? null,
    [clients, businessId],
  );

  const industries = useMemo(
    () =>
      Array.from(
        new Set(clients.map((b) => b.industry).filter((v) => v && v !== "—")),
      ).sort(),
    [clients],
  );

  const safePage = Math.min(page, lastPage);
  const rows = prospects;

  function changeBusiness(id: string) {
    setBusinessId(id);
    setSelected([]);
    setTier("all");
    setQuery("");
    setDebouncedQuery("");
    setSignal("all");
    setPage(1);
    setDrawer(null);
    setEnrollIds([]);
    setError("");
  }

  function resetPage() {
    setPage(1);
    setSelected([]);
  }

  function resetFilters() {
    setTier("all");
    setQuery("");
    setDebouncedQuery("");
    setSignal("all");
    resetPage();
  }

  async function copyEmail(email: string, id: string) {
    if (!email || email === "—") {
      setNotice("No email on file for this contact.");
      return;
    }
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

  async function openDrawer(prospect: SmartLead) {
    setDrawer(prospect);
    setDrawerNotes([]);
    setDrawerLoading(true);
    try {
      const detail = await fetchLeadDetail(Number(prospect.id));
      const lead = detail.data.lead;
      const mapped = mapAdminLead(lead, businessId);
      mapped.activities = mapDetailActivities(
        detail.data.activities ?? [],
        detail.data.signals ?? [],
      );
      const contact = (detail.data.contacts?.[0] ?? null) as
        | Record<string, unknown>
        | null;
      if (contact) {
        mapped.primaryContact = {
          ...mapped.primaryContact,
          name: asString(contact.name) || mapped.primaryContact.name,
          title: asString(contact.title) || mapped.primaryContact.title,
          email: asString(contact.email) || mapped.primaryContact.email,
          phone: asString(contact.phone) || mapped.primaryContact.phone,
          verified: Boolean(contact.verified),
          linkedin: asString(contact.linkedin) || mapped.primaryContact.linkedin,
        };
      }
      setDrawer(mapped);
      setDrawerNotes(notesFromLead(lead));
      if (lead.admin_outreach_prepared) {
        setPreparedIds((ids) => Array.from(new Set([...ids, String(lead.id)])));
      }
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to load prospect details.",
      );
    } finally {
      setDrawerLoading(false);
    }
  }

  async function addNote(text: string) {
    if (!drawer) return;
    try {
      const result = await createLeadAdminNote(Number(drawer.id), text);
      setDrawerNotes(notesFromLead(result.data));
      setNotice("Admin note saved.");
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to save admin note.",
      );
      throw err;
    }
  }

  async function confirmPrepare(sequence: string) {
    const ids = enrollIds.map(Number).filter((id) => Number.isFinite(id));
    if (!ids.length) {
      setEnrollIds([]);
      return;
    }
    try {
      const result = await prepareLeadsOutreach(ids, sequence);
      const prepared = (result.data.prepared_lead_ids ?? []).map(String);
      setPreparedIds((prev) => Array.from(new Set([...prev, ...prepared])));
      setProspects((rows) =>
        rows.map((row) =>
          prepared.includes(row.id) ? { ...row, status: "In Cadence" } : row,
        ),
      );
      setNotice(
        `Prepared ${prepared.length} ${prepared.length === 1 ? "prospect" : "prospects"} for client outreach · ${sequence}. No messages sent.`,
      );
      setEnrollIds([]);
      setSelected([]);
      setError("");
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Unable to prepare leads for outreach.",
      );
      throw err;
    }
  }

  const tierCounts = {
    high: analytics?.tier_distribution.high ?? 0,
    middle: analytics?.tier_distribution.middle ?? 0,
    low: analytics?.tier_distribution.low ?? 0,
  };
  const analyticsTotal = analytics?.total ?? total;
  const verifiedRateNote = analytics
    ? "From live organization analytics"
    : "Awaiting analytics";

  const metrics = [
    {
      label: "PROSPECTS",
      value: String(analyticsTotal),
      note: "In this client’s lead pool",
      icon: Users,
    },
    {
      label: "HIGH INTENT",
      value: String(tierCounts.high),
      note: "Score 75+",
      icon: Target,
    },
    {
      label: "AVERAGE FIT",
      value: `${Math.round(analytics?.avg_score ?? 0)}%`,
      note: "Across the organization pool",
      icon: SlidersHorizontal,
    },
    {
      label: "VERIFIED CONTACTS",
      value: String(prospects.filter((p) => p.primaryContact.verified).length),
      note: verifiedRateNote,
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
          Live admin workspace
          <small>Notes and prepare-outreach persist via API</small>
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
      {(error || clientsError) && (
        <div className="sl-notice" role="alert">
          {error || clientsError}
          <button
            onClick={() => {
              setError("");
              setClientsError("");
            }}
            aria-label="Dismiss error"
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
            disabled={!clients.length}
          >
            {!clients.length && <option value="">No clients</option>}
            {clients.map((b) => (
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
              <p>
                {clientsLoading
                  ? "Loading workspaces…"
                  : `${clients.length} onboarded workspaces`}
              </p>
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
                <option value="prospects">Lead pool size</option>
                <option value="fit">Prospect pool</option>
                <option value="emails">Prospect pool volume</option>
              </select>
            </label>
          </div>
          {clientsLoading && (
            <div className="sl-empty">
              <h3>Loading clients…</h3>
              <p>Fetching onboarded organizations.</p>
            </div>
          )}
          {!clientsLoading &&
            clients.map((b) => (
              <button
                key={b.id}
                className={`sl-business-item sp-business-item ${b.id === businessId ? "active" : ""}`}
                aria-pressed={b.id === businessId}
                onClick={() => changeBusiness(b.id)}
              >
                <span
                  className="sl-monogram"
                  style={{ background: b.avatarColor }}
                >
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
                    {b.leadsCount} leads · {b.country}
                  </span>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
          {!clientsLoading && !clients.length && (
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
            Selected workspace:{" "}
            <strong>{business?.company ?? "None selected"}</strong>
          </p>
        </aside>
        <div className="sp-detail">
          {!business && !clientsLoading && (
            <section className="sl-panel">
              <div className="sl-empty">
                <Building2 size={30} />
                <h3>Select a client workspace</h3>
                <p>Choose an onboarded organization to inspect its leads.</p>
              </div>
            </section>
          )}
          {business && (
            <>
              <section className="sl-panel sp-business-summary">
                <div className="sl-panel-head">
                  <div className="sl-client-identity">
                    <span
                      className="sl-monogram"
                      style={{ background: business.avatarColor }}
                    >
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
                companyName={business.company}
                analytics={analytics}
                velocity={velocity}
                loading={analyticsLoading}
                error={analyticsError}
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
                  <span className="sl-badge">{total} matches</span>
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
                          ? analyticsTotal
                          : tierCounts[t]}
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
                      {selected.length} selected across the current page
                    </strong>
                    <button
                      onClick={() => setEnrollIds(selected)}
                      className="sl-primary"
                    >
                      <Mail size={15} /> Prepare for client outreach
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
                            aria-label="Select all prospects on this page"
                            checked={
                              rows.length > 0 &&
                              rows.every((p) => selected.includes(p.id))
                            }
                            onChange={(e) =>
                              setSelected(
                                e.target.checked ? rows.map((p) => p.id) : [],
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
                              {preparedIds.includes(p.id)
                                ? "Prepared for outreach"
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
                            <button onClick={() => void openDrawer(p)}>
                              Inspect <ArrowRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {leadsLoading && (
                  <div className="sl-empty">
                    <h3>Loading prospects…</h3>
                    <p>Fetching leads for {business.company}.</p>
                  </div>
                )}
                {!leadsLoading && leadsError && (
                  <div className="sl-empty">
                    <h3>Unable to load prospects</h3>
                    <p>{leadsError}</p>
                    <button onClick={() => void loadLeads()}>Retry</button>
                  </div>
                )}
                {!leadsLoading && !leadsError && !rows.length && (
                  <div className="sl-empty">
                    <Filter size={30} />
                    <h3>No prospects match these filters</h3>
                    <p>Broaden the intent tier, buying signal, or search.</p>
                    <button onClick={resetFilters}>Reset prospect filters</button>
                  </div>
                )}
                <div className="sl-pagination">
                  <span>
                    {total
                      ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, total)}`
                      : "0"}{" "}
                    of {total} prospects
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
                      disabled={safePage === 1 || leadsLoading}
                      onClick={() => setPage(safePage - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      {safePage} / {lastPage}
                    </span>
                    <button
                      disabled={safePage === lastPage || leadsLoading}
                      onClick={() => setPage(safePage + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
                <p className="sl-footnote">
                  Fit, tiers, and coverage use live organization analytics.
                  Preparing outreach marks leads for the client — it does not
                  send messages.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
      <ProspectDrawer
        isOpen={!!drawer}
        prospect={drawer}
        businessName={business?.company ?? ""}
        notes={drawerNotes}
        loading={drawerLoading}
        onAddNote={addNote}
        onClose={() => setDrawer(null)}
        onEnroll={(p) => {
          setDrawer(null);
          setEnrollIds([p.id]);
        }}
      />
      {enrollIds.length > 0 && business && (
        <EnrollmentDialog
          count={enrollIds.length}
          business={business.company}
          onClose={() => setEnrollIds([])}
          onConfirm={confirmPrepare}
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
  onConfirm: (sequence: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sequence, setSequence] = useState("Enterprise discovery");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
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
        <h2 id="sp-enroll-title">Prepare for client outreach</h2>
        <button aria-label="Close prepare outreach" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="sl-dialog-body">
        <p>
          {count} {count === 1 ? "prospect" : "prospects"} from {business}.
          Choose the cadence to prepare for the client.
        </p>
        <label className="sl-field">
          Outreach cadence
          <select
            value={sequence}
            onChange={(e) => setSequence(e.target.value)}
            disabled={saving}
          >
            <option>Enterprise discovery</option>
            <option>Funding follow-up</option>
            <option>Expansion introduction</option>
          </select>
        </label>
        <p className="sl-footnote">
          This marks leads as prepared for client outreach. No messages are sent
          from the admin workspace.
        </p>
        {localError && <p className="sl-footnote">{localError}</p>}
        <div className="sl-dialog-actions">
          <button onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="sl-primary"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              setLocalError("");
              void onConfirm(sequence)
                .catch((err: unknown) => {
                  setLocalError(
                    err instanceof AdminApiError
                      ? err.message
                      : "Unable to prepare outreach.",
                  );
                })
                .finally(() => setSaving(false));
            }}
          >
            <Check size={16} /> {saving ? "Preparing…" : "Confirm prepare"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
