"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  Grid3X3,
  Inbox,
  LayoutList,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useOutreachActivities,
  useDeleteOutreachActivity,
} from "@/hooks/use-sales-engine-outreach";
import { useOutreachSenderSettings } from "@/hooks/use-sales-engine-outreach-sender";
import {
  fetchOutreachActivity,
  formatRelativeTime,
  normalizeOutreachSubjectBody,
  outreachActivitySortTime,
  SalesEngineApiError,
  type OutreachActivity,
} from "@/lib/api/sales-engine";
import { OutreachPreviewModal } from "./outreach-preview-modal";
import { OutreachSettingsModal } from "./outreach-settings-modal";

type OutreachPreviewState = {
  activityId: number | null;
  channel: "email" | "whatsapp";
  subject?: string | null;
  body: string;
  toEmail?: string;
  contextLabel?: string;
};

const DELIVERY_STATUS_CONFIG: Record<
  string,
  { label: string; badgeCls: string; dotCls: string }
> = {
  queued: {
    label: "Queued",
    badgeCls: "bg-amber-50 text-amber-800 border-amber-200/80",
    dotCls: "bg-amber-500",
  },
  sent: {
    label: "Sent",
    badgeCls: "bg-slate-100 text-slate-700 border-slate-200/80",
    dotCls: "bg-slate-400",
  },
  delivered: {
    label: "Delivered",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    dotCls: "bg-emerald-500",
  },
  opened: {
    label: "Opened",
    badgeCls: "bg-sky-50 text-sky-700 border-sky-200/80",
    dotCls: "bg-sky-500",
  },
  clicked: {
    label: "Clicked",
    badgeCls: "bg-purple-50 text-purple-700 border-purple-200/80",
    dotCls: "bg-purple-500",
  },
  failed: {
    label: "Failed",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotCls: "bg-rose-500",
  },
  bounced: {
    label: "Bounced",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotCls: "bg-rose-500",
  },
  dropped: {
    label: "Dropped",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotCls: "bg-rose-500",
  },
  spam: {
    label: "Marked Spam",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotCls: "bg-rose-500",
  },
  unsubscribed: {
    label: "Unsubscribed",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200/80",
    dotCls: "bg-amber-500",
  },
};

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SalesEngineApiError && error.message) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "??"
  );
}

const AVATAR_COLORS = ["#dc9c56", "#f5fdfa", "#b190b6", "#7bb6b8", "#e3a5e9"];

function percentOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export function SalesEngineOutreachView() {
  const { data: senderSettings } = useOutreachSenderSettings(true);
  const deleteOutreach = useDeleteOutreachActivity();

  const [preview, setPreview] = useState<OutreachPreviewState | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name_asc" | "name_desc">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { data: pageData, isLoading, isError, isRefetching, refetch } = useOutreachActivities({ page: currentPage, per_page: itemsPerPage, search: searchQuery, channel: channelFilter, status: statusFilter, sort: sortBy });
  const items = useMemo(() => pageData?.items ?? [], [pageData]);
  const recordTotal = pageData?.total ?? 0;


  // Compute metrics
  const metrics = useMemo(() => {
    const totals = pageData?.metrics ?? { total: 0, deliveredCount: 0, openedCount: 0, clickedCount: 0, failedCount: 0, emailCount: 0, whatsappCount: 0 };
    return { ...totals, deliveryRate: percentOf(totals.deliveredCount, totals.total), openRate: percentOf(totals.openedCount, totals.total), avatars: { total: [], delivered: [], opened: [] } };
  }, [pageData]);

  const metricCards = [
    {
      id: "total",
      title: "No of Outreach",
      total: metrics.total,
      tracks: [
        { label: "Email", count: metrics.emailCount, percent: percentOf(metrics.emailCount, metrics.total) },
        { label: "WhatsApp", count: metrics.whatsappCount, percent: percentOf(metrics.whatsappCount, metrics.total) },
      ],
      avatars: metrics.avatars.total,
    },
    {
      id: "delivered",
      title: "Delivered",
      total: metrics.deliveredCount,
      tracks: [
        { label: "Delivered", count: metrics.deliveredCount, percent: metrics.deliveryRate },
        { label: "Bounced", count: metrics.failedCount, percent: percentOf(metrics.failedCount, metrics.total) },
      ],
      avatars: metrics.avatars.delivered,
    },
    {
      id: "opened",
      title: "Engagement (Opened)",
      total: metrics.openedCount,
      tracks: [
        { label: "Opened", count: metrics.openedCount, percent: metrics.openRate },
        { label: "Clicked", count: metrics.clickedCount, percent: percentOf(metrics.clickedCount, metrics.total) },
      ],
      avatars: metrics.avatars.opened,
    },
  ];

  const filteredItems = items;
  const totalPages = pageData?.last_page ?? 1;
  const effectivePage = pageData?.current_page ?? currentPage;
  const startIndex = (effectivePage - 1) * itemsPerPage;
  const paginatedItems = items;

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.max(1, Math.min(newPage, totalPages)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleView = async (item: OutreachActivity) => {
    setOpeningId(item.id);
    try {
      const draft = await fetchOutreachActivity(item.id);
      const normalized = normalizeOutreachSubjectBody(draft.body || item.preview, draft.subject);
      setPreview({
        activityId: draft.activity_id ?? item.id,
        channel: draft.channel === "whatsapp" ? "whatsapp" : "email",
        subject: normalized.subject,
        body: normalized.body,
        toEmail: draft.to_email ?? "",
        contextLabel: item.name,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not open outreach draft."));
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = (item: OutreachActivity) => {
    if (!window.confirm(`Are you sure you want to delete outreach for ${item.name}?`)) {
      return;
    }
    deleteOutreach.mutate(item.id, {
      onSuccess: () => {
        if (preview?.activityId === item.id) setPreview(null);
        toast.success(`Removed outreach for ${item.name}.`);
      },
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Could not delete outreach activity.")),
    });
  };

  const handleCopyPreview = async (item: OutreachActivity) => {
    try {
      await navigator.clipboard.writeText(item.preview);
      setCopiedId(item.id);
      toast.success("Outreach snippet copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy snippet");
    }
  };

  const hasActiveFilters =
    Boolean(searchQuery) || channelFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setChannelFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  return (
    <div className="outreach-dashboard oa-page">
      {/* Breadcrumb & actions */}
      <div className="oa-topbar">
        <nav className="oa-breadcrumb" aria-label="Breadcrumb">
          <Link href="/sales-engine" className="group">
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
            <span>Sales Engine</span>
          </Link>
          <span aria-hidden="true">/</span>
          <strong>All Outreach</strong>
        </nav>

        <div className="oa-actions">
          {senderSettings && (
            <div className="oa-domain">
              <span className="oa-live-dot" aria-hidden="true" />
              <span>Sending Domain:</span>
              <strong>
                {senderSettings.sender_mode === "organization" &&
                senderSettings.org_connection_status === "verified" &&
                senderSettings.org_verified_domain
                  ? senderSettings.org_verified_domain
                  : "The Factory Platform"}
              </strong>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="oa-pill"
            title="Sender domain and mailbox settings"
          >
            <Settings size={14} />
            <span>Sender Settings</span>
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="oa-pill"
            title="Refresh outreach activities"
          >
            <RefreshCw size={13} className={isRefetching ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <h1 className="oa-title">
        Outreach Activities
        <span className="oa-count">{recordTotal} records</span>
      </h1>
      <p className="oa-subtitle">
        Review, personalize, and dispatch AI-generated sales outreach across email and WhatsApp.
      </p>

      {/* Metric cards — same treatment as the dashboard */}
      {isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Could not load outreach activities. <button onClick={() => { void refetch(); }}>Retry</button></div>}
      <div className="outreach-metrics">
        {metricCards.map((card) => (
          <article className="outreach-metric" key={card.id}>
            <h2>{card.title}</h2>
            <p className="metric-number">{card.total.toLocaleString()}</p>
            <div className="outreach-progress">
              {card.tracks.map((track, index) => (
                <div key={track.label}>
                  <span className="oa-progress-label">
                    {track.label}
                    <em>{track.count}</em>
                  </span>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={`${track.label} ${card.title}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={track.percent}
                  >
                    <div
                      className={index ? "progress-purple" : "progress-mint"}
                      style={{ width: `${Math.max(0, Math.min(100, track.percent))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="outreach-avatars">
              {card.avatars.length > 0 ? (
                card.avatars.map((name, index) => (
                  <span
                    key={`${name}-${index}`}
                    className="oa-avatar"
                    style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
                    title={name}
                  >
                    {getInitials(name)}
                  </span>
                ))
              ) : (
                <span className="oa-avatar-empty">No prospects yet</span>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* White content panel */}
      <section className="oa-panel" aria-label="Outreach activities">
        {/* Toolbar: search, channel tabs, filters, layout switcher */}
        <div className="oa-toolbar">
          <div className="oa-search">
            <Search size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by prospect name, message content, channel..."
              aria-label="Search outreach"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="oa-toolbar-group">
            {(
              [
                { value: "all", label: "All", count: recordTotal, icon: null },
                { value: "email", label: "Email", count: metrics.emailCount, icon: <Mail size={12} /> },
                {
                  value: "whatsapp",
                  label: "WhatsApp",
                  count: metrics.whatsappCount,
                  icon: <MessageCircle size={12} />,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setChannelFilter(tab.value);
                  setCurrentPage(1);
                }}
                aria-pressed={channelFilter === tab.value}
                className={`oa-pill ${channelFilter === tab.value ? "is-selected" : ""}`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span className="oa-pill-badge">{tab.count}</span>
              </button>
            ))}

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="oa-select"
              aria-label="Filter by delivery status"
            >
              <option value="all">All Statuses</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="opened">Opened</option>
              <option value="clicked">Clicked</option>
              <option value="bounced">Bounced</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="oa-select"
              aria-label="Sort outreach"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name_asc">Prospect A → Z</option>
              <option value="name_desc">Prospect Z → A</option>
            </select>

            <div className="oa-view-switch" role="group" aria-label="Layout">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={viewMode === "grid" ? "is-selected" : ""}
                aria-pressed={viewMode === "grid"}
                title="Grid card view"
              >
                <Grid3X3 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={viewMode === "table" ? "is-selected" : ""}
                aria-pressed={viewMode === "table"}
                title="Table list view"
              >
                <LayoutList size={15} />
              </button>
            </div>

            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="oa-pill is-danger">
                <X size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        <div className="oa-panel-heading">
          <h2>All Outreach</h2>
          {!isLoading && (
            <span>
              {items.length} of {recordTotal} shown
            </span>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="oa-state">
            <Loader2 size={28} className="animate-spin text-[#022228]" />
            <p>Fetching outreach records…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="oa-state">
            <div className="oa-state-icon">
              <Inbox size={30} />
            </div>
            <h3>No outreach activities match</h3>
            <p>
              {hasActiveFilters
                ? "No records found matching your active filters. Try searching for another prospect or clearing the active filters."
                : "You haven't generated any outreach drafts yet. Navigate to Sales Engine to start discovering prospects and generating customized messaging."}
            </p>
            {hasActiveFilters ? (
              <button type="button" onClick={clearFilters} className="oa-mint-btn">
                Clear all filters
              </button>
            ) : (
              <Link href="/sales-engine" className="oa-mint-btn">
                <span>Go to Sales Engine</span>
                <ArrowLeft size={13} className="rotate-180" />
              </Link>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="oa-grid">
            {paginatedItems.map((item) => {
              const statusCfg = item.delivery_status
                ? DELIVERY_STATUS_CONFIG[item.delivery_status]
                : null;
              const isEmail = item.channel?.toLowerCase() === "email";
              const isBusyOpening = openingId === item.id;
              const isDeleting =
                deleteOutreach.isPending && deleteOutreach.variables === item.id;
              const normalized = normalizeOutreachSubjectBody(item.preview);

              return (
                <article key={item.id} className="oa-card">
                  <div>
                    <div className="oa-card-head">
                      <div className="oa-person">
                        <div className="oa-initials">
                          <span>{getInitials(item.name)}</span>
                          <span
                            className={`oa-channel-dot ${isEmail ? "is-email" : "is-whatsapp"}`}
                            title={item.channel}
                          >
                            {isEmail ? <Mail size={8} /> : <MessageCircle size={8} />}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h3>{item.name}</h3>
                          <div className="oa-meta">
                            <span>{item.channel}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {formatRelativeTime(new Date(outreachActivitySortTime(item)).toISOString())}
                            </span>
                          </div>
                        </div>
                      </div>

                      {statusCfg && (
                        <span
                          className={`oa-status ${statusCfg.badgeCls}`}
                          title={item.bounce_reason ?? undefined}
                        >
                          <i className={statusCfg.dotCls} />
                          {statusCfg.label}
                        </span>
                      )}
                    </div>

                    <div className="oa-preview">
                      {normalized.subject ? (
                        <div className="oa-preview-subject">
                          <span>Subject</span>
                          <p>{normalized.subject}</p>
                        </div>
                      ) : null}
                      <p>{normalized.body || item.preview}</p>
                    </div>

                    {item.bounce_reason && <p className="oa-bounce">Reason: {item.bounce_reason}</p>}
                  </div>

                  <div className="oa-card-foot">
                    <button
                      type="button"
                      onClick={() => handleView(item)}
                      disabled={isBusyOpening}
                      className="oa-mint-btn"
                    >
                      {isBusyOpening ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                      <span>Review &amp; Send</span>
                    </button>

                    <div className="oa-icon-actions">
                      <button
                        type="button"
                        onClick={() => handleCopyPreview(item)}
                        className="oa-icon-btn"
                        title="Copy message preview"
                      >
                        {copiedId === item.id ? (
                          <Check size={14} className="text-emerald-600" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={isDeleting}
                        className="oa-icon-btn is-danger"
                        title="Delete outreach"
                      >
                        {isDeleting ? (
                          <Loader2 size={14} className="animate-spin text-rose-600" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="oa-table-wrap">
            <table className="oa-table">
              <thead>
                <tr>
                  <th>Prospect</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Message Snippet</th>
                  <th>Dispatched</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => {
                  const statusCfg = item.delivery_status
                    ? DELIVERY_STATUS_CONFIG[item.delivery_status]
                    : null;
                  const isEmail = item.channel?.toLowerCase() === "email";
                  const isBusyOpening = openingId === item.id;
                  const isDeleting =
                    deleteOutreach.isPending && deleteOutreach.variables === item.id;
                  const normalized = normalizeOutreachSubjectBody(item.preview);

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="oa-initials is-sm">{getInitials(item.name)}</div>
                          <span className="font-semibold">{item.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="oa-chip">
                          {isEmail ? (
                            <Mail size={11} className="is-email" />
                          ) : (
                            <MessageCircle size={11} className="is-whatsapp" />
                          )}
                          <span>{item.channel}</span>
                        </span>
                      </td>
                      <td>
                        {statusCfg ? (
                          <span
                            className={`oa-status ${statusCfg.badgeCls}`}
                            title={item.bounce_reason ?? undefined}
                          >
                            <i className={statusCfg.dotCls} />
                            {statusCfg.label}
                          </span>
                        ) : (
                          <span className="oa-muted">—</span>
                        )}
                      </td>
                      <td className="max-w-[340px]">
                        <p className="oa-muted truncate">
                          {normalized.subject ? `[${normalized.subject}] ` : ""}
                          {normalized.body || item.preview}
                        </p>
                      </td>
                      <td className="oa-muted whitespace-nowrap">
                        {formatRelativeTime(new Date(outreachActivitySortTime(item)).toISOString())}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleView(item)}
                            disabled={isBusyOpening}
                            className="oa-mint-btn is-sm"
                          >
                            {isBusyOpening ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Eye size={12} />
                            )}
                            <span>Open</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyPreview(item)}
                            className="oa-icon-btn"
                            title="Copy snippet"
                          >
                            {copiedId === item.id ? (
                              <Check size={13} className="text-emerald-500" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={isDeleting}
                            className="oa-icon-btn is-danger"
                            title="Delete outreach"
                          >
                            {isDeleting ? (
                              <Loader2 size={13} className="animate-spin text-rose-600" />
                            ) : (
                              <Trash2 size={13} />
                            )}
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

        {/* Pagination */}
        {filteredItems.length > 0 && (
          <footer className="oa-pagination">
            <div className="flex items-center gap-3">
              <span>
                Showing <strong>{startIndex + 1}</strong> to{" "}
                <strong>{Math.min(startIndex + items.length, recordTotal)}</strong> of{" "}
                <strong>{recordTotal}</strong> record
                {recordTotal === 1 ? "" : "s"}
              </span>

              <label className="oa-per-page">
                <span>Per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>

            <div className="oa-pages">
              <button
                type="button"
                onClick={() => handlePageChange(effectivePage - 1)}
                disabled={effectivePage <= 1}
                className="oa-page-btn"
                title="Previous page"
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true;
                  if (p === 1 || p === totalPages) return true;
                  return Math.abs(p - effectivePage) <= 1;
                })
                .map((pageNumber, idx, arr) => {
                  const prev = arr[idx - 1];
                  const hasGap = prev && pageNumber - prev > 1;

                  return (
                    <div key={pageNumber} className="flex items-center gap-1">
                      {hasGap && <span className="px-1">…</span>}
                      <button
                        type="button"
                        onClick={() => handlePageChange(pageNumber)}
                        aria-current={pageNumber === effectivePage ? "page" : undefined}
                        className={`oa-page-btn ${pageNumber === effectivePage ? "is-active" : ""}`}
                      >
                        {pageNumber}
                      </button>
                    </div>
                  );
                })}

              <button
                type="button"
                onClick={() => handlePageChange(effectivePage + 1)}
                disabled={effectivePage >= totalPages}
                className="oa-page-btn"
                title="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </footer>
        )}
      </section>

      {/* Modals */}
      <OutreachPreviewModal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        activityId={preview?.activityId ?? null}
        channel={preview?.channel ?? "email"}
        initialSubject={preview?.subject}
        initialBody={preview?.body ?? ""}
        initialToEmail={preview?.toEmail}
        contextLabel={preview?.contextLabel}
        onSent={() => {
          setPreview(null);
          refetch();
        }}
        onConfigureSender={() => setIsSettingsOpen(true)}
      />

      <OutreachSettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
