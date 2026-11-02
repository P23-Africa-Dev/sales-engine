"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OutreachBusiness } from "@/lib/outreach-dashboard";
import {
  createOrganizationAdminNote,
  fetchOrganizationTimeline,
  type TimelineItem,
} from "@/lib/api/admin-outreach";
import { AdminApiError } from "@/lib/api/admin-client";
import { BusinessLogo } from "./business-logo";

interface ActivityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  business: OutreachBusiness | null | undefined;
  onOpenAccount: (business: OutreachBusiness) => void;
}

const BADGE: Record<string, string> = {
  email: "#0284c7",
  sms: "#d97706",
  note: "#0d9488",
  admin: "#7c3aed",
  crm: "#475569",
  outreach: "#0284c7",
};

function formatTime(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function ActivityDrawer({
  isOpen,
  onClose,
  business,
  onOpenAccount,
}: ActivityDrawerProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | "emails" | "meetings" | "notes">("all");
  const [newNote, setNewNote] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadTimeline = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setError("");
    try {
      const result = await fetchOrganizationTimeline(Number(business.id));
      setTimeline(result.data);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load timeline");
      setTimeline([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && business?.id) void loadTimeline();
  }, [isOpen, business?.id, loadTimeline]);

  if (!business) return null;

  const filteredEvents = timeline.filter((ev) => {
    if (activeTab === "all") return true;
    if (activeTab === "emails") {
      return ev.channel === "email" || ev.type === "inbound_email" || ev.type === "outreach";
    }
    if (activeTab === "meetings") {
      return ev.channel === "in-person" || ev.type?.includes("meeting") || ev.channel === "crm";
    }
    if (activeTab === "notes") {
      return ev.type === "note" || ev.type === "admin_note" || ev.channel === "note" || ev.channel === "admin";
    }
    return true;
  });

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim() || !business) return;
    setSaving(true);
    setError("");
    try {
      await createOrganizationAdminNote(Number(business.id), newNote.trim());
      setNewNote("");
      await loadTimeline();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  function openAccount() {
    if (!business) return;
    onOpenAccount(business);
    onClose();
    router.push(`/sales-engine/account-management?organization_id=${business.id}`);
  }

  return (
    <>
      <div
        className={`activity-drawer-backdrop ${isOpen ? "is-visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`activity-drawer ${isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Full Activity Stream for ${business.name}`}
      >
        <div className="drawer-header">
          <div className="drawer-header-left">
            <BusinessLogo
              id={business.id}
              name={business.name}
              color={business.avatarColor}
              size={42}
            />
            <div className="drawer-title-group">
              <h2>{business.name}</h2>
              <p>
                {business.company} • {business.industry} • {business.country}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close activity drawer"
          >
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <div className="readiness-card">
            <div className="readiness-header">
              <span className="readiness-badge">Organization activity</span>
              <span className="readiness-owner">
                Owner: <strong>{business.owner}</strong>
              </span>
            </div>
            <div className="readiness-metrics-grid">
              <div className="metric-pill">
                <span>Emails Sent</span>
                <strong>
                  {business.emailsSent != null ? business.emailsSent.toLocaleString() : "—"}
                </strong>
              </div>
              <div className="metric-pill">
                <span>Prospects</span>
                <strong>
                  {business.prospects != null ? business.prospects.toLocaleString() : "—"}
                </strong>
              </div>
              <div className="metric-pill">
                <span>Follow-ups</span>
                <strong>{business.followUpsCompleted ?? "—"}</strong>
              </div>
              <div className="metric-pill">
                <span>Website</span>
                <strong className="truncate-text" title={business.website}>
                  {business.website}
                </strong>
              </div>
            </div>
          </div>

          <div className="timeline-nav">
            <h3>Activity Stream</h3>
            <div className="timeline-tabs" role="tablist">
              {(["all", "emails", "meetings", "notes"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`timeline-tab ${activeTab === tab ? "is-active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <form className="quick-note-form" onSubmit={handleAddNote}>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add an internal platform note…"
            />
            <button type="submit" disabled={!newNote.trim() || saving}>
              {saving ? "Saving…" : "Add Note"}
            </button>
          </form>

          {error ? <p className="event-desc">{error}</p> : null}
          {loading ? <p className="event-desc">Loading timeline…</p> : null}

          <div className="timeline-stream">
            {!loading && filteredEvents.length === 0 ? (
              <p className="event-desc">No activity for this filter.</p>
            ) : null}
            {filteredEvents.map((ev) => {
              const color = BADGE[ev.channel] || BADGE[ev.type] || "#64748b";
              return (
                <div key={ev.id} className="timeline-event-card">
                  <div className="event-meta">
                    <span
                      className="event-type-badge"
                      style={{ borderColor: color, color }}
                    >
                      {ev.channel || ev.type}
                    </span>
                    {ev.status ? <span className="event-status">{ev.status}</span> : null}
                    <span className="event-time">{formatTime(ev.occurred_at)}</span>
                  </div>
                  <h4 className="event-title">{ev.title}</h4>
                  {ev.body ? <p className="event-desc">{ev.body}</p> : null}
                  {ev.author ? (
                    <div className="event-footer">
                      <span>
                        Logged by: <strong>{ev.author}</strong>
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="drawer-footer">
          <div className="drawer-footer-actions">
            <button
              type="button"
              className="drawer-secondary-btn"
              onClick={() => {
                const memo = prompt("Quick note to append to timeline:", "");
                if (memo?.trim()) {
                  void createOrganizationAdminNote(Number(business.id), memo.trim()).then(
                    loadTimeline,
                  );
                }
              }}
            >
              + Log Note
            </button>
            <button type="button" className="drawer-primary-btn" onClick={openAccount}>
              Open Account ➜
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
