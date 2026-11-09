"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { SmartLead, SmartLeadActivity } from "@/lib/admin/smart-leads";

export interface ProspectNote {
  id: string;
  text: string;
  time: string;
  author: string;
}

interface ProspectDrawerProps {
  onClose: () => void;
  prospect: SmartLead;
  notes: ProspectNote[];
  onAddNote: (note: ProspectNote) => void;
  onEnroll: (prospect: SmartLead) => void;
}

export function ProspectDrawer({
  onClose,
  prospect,
  notes,
  onAddNote,
  onEnroll,
}: ProspectDrawerProps) {
  const [activeTab, setActiveTab] = useState<"all" | "emails" | "signals" | "notes">("all");
  const [newNote, setNewNote] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(prospect.primaryContact.email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      toast.error("Clipboard access is unavailable.");
    }
  }

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    const noteObj = {
      id: `note-${Date.now()}`,
      text: newNote.trim(),
      time: "Just now",
      author: "Sales Intelligence",
    };
    onAddNote(noteObj);
    setNewNote("");
  }

  const activities: SmartLeadActivity[] = prospect.activities || [];

  const filteredActivities = activities.filter((act) => {
    if (activeTab === "all") return true;
    if (activeTab === "emails") return act.type === "email";
    if (activeTab === "signals") return act.type === "signal" || act.type === "visit";
    return true;
  });

  const tierColor =
    prospect.tier === "high"
      ? { text: "#7e22ce", bg: "#faf5ff", border: "#e9d5ff", label: "High Intent Priority" }
      : prospect.tier === "middle"
      ? { text: "#b45309", bg: "#fffbeb", border: "#fde68a", label: "Middle Intent Priority" }
      : { text: "#475569", bg: "#f8fafc", border: "#cbd5e1", label: "Low Intent Priority" };

  return (
    <>
      {/* Blurred Backdrop - identical to Dashboard ActivityDrawer */}
      <div
        className="activity-drawer-backdrop is-visible"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-Over Drawer Panel */}
      <aside
        className="activity-drawer prospect-drawer-panel is-open"
        role="dialog"
        aria-modal="true"
        aria-label={`Prospect Dossier for ${prospect.company}`}
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <div
              className="drawer-company-avatar"
              style={{ backgroundColor: prospect.primaryContact.avatarColor }}
              aria-hidden="true"
            >
              {prospect.company.charAt(0)}
            </div>
            <div className="drawer-title-group">
              <div className="drawer-title-row">
                <h2>{prospect.company}</h2>
                <span
                  className="prospect-tier-pill"
                  style={{
                    backgroundColor: tierColor.bg,
                    color: tierColor.text,
                    borderColor: tierColor.border,
                  }}
                >
                  ⚡ {prospect.fitScore}% • {tierColor.label}
                </span>
              </div>
              <p>
                {prospect.location} • {prospect.industry} • {prospect.revenue} •{" "}
                <a
                  href={`https://${prospect.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="drawer-meta-link"
                >
                  {prospect.website} ↗
                </a>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close dossier drawer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="drawer-body">
          {/* Executive Readiness Card */}
          <div className="readiness-card">
            <div className="readiness-header">
              <span className="readiness-badge">
                ⚡ {prospect.fitScore}% Deal Readiness • {prospect.intentLevel} Intent
              </span>
              <span className="readiness-owner">
                Status: <strong>{prospect.status}</strong>
              </span>
            </div>
            <p className="readiness-summary">
              <strong>Why reach out now:</strong> {prospect.whyNow}
            </p>
            <div className="readiness-metrics-grid">
              <div className="metric-pill">
                <span>Buying Signal</span>
                <strong className="truncate-text" title={prospect.intentTrigger}>
                  {prospect.intentTrigger}
                </strong>
              </div>
              <div className="metric-pill">
                <span>Account Scale</span>
                <strong>{prospect.employees} employees</strong>
              </div>
              <div className="metric-pill">
                <span>Annual Revenue</span>
                <strong>{prospect.revenue}</strong>
              </div>
              <div className="metric-pill">
                <span>Touchpoints Logged</span>
                <strong>{activities.length} touches</strong>
              </div>
            </div>
          </div>

          {/* Key Stakeholders / Decision Maker Section */}
          <div className="stakeholders-section">
            <h3>Verified Decision Maker</h3>
            <div className="stakeholder-list">
              <div className="stakeholder-card">
                <div
                  className="stakeholder-avatar"
                  style={{ backgroundColor: prospect.primaryContact.avatarColor }}
                >
                  {prospect.primaryContact.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className="stakeholder-info">
                  <strong>{prospect.primaryContact.name}</strong>
                  <span>{prospect.primaryContact.title}</span>
                </div>
                {prospect.primaryContact.verified && (
                  <span className="stakeholder-tag primary-contact">✓ Verified Contact</span>
                )}
              </div>
            </div>

            {/* Quick Contact Action Badges */}
            <div className="contact-actions-row" style={{ marginTop: "10px" }}>
              <button
                type="button"
                className="contact-action-badge"
                onClick={handleCopyEmail}
                title="Click to copy email address"
              >
                ✉ {prospect.primaryContact.email}
                {copiedEmail && <span className="copied-note">Copied!</span>}
              </button>
              <a
                href={`tel:${prospect.primaryContact.phone}`}
                className="contact-action-badge"
                title="Call phone number"
              >
                📞 {prospect.primaryContact.phone}
              </a>
              <a
                href={`https://${prospect.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="contact-action-badge"
                title="Open company website"
              >
                🌐 {prospect.website} ↗
              </a>
            </div>
          </div>

          {/* Tech Stack & Infrastructure Section */}
          <div className="stakeholders-section">
            <h3>Verified Tech Stack & Infrastructure</h3>
            <div className="tech-stack-row">
              {prospect.techStack.map((tech) => (
                <span key={tech} className="tech-stack-tag">
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* Timeline Filter Tabs */}
          <div className="timeline-nav">
            <div className="section-header-split" style={{ marginBottom: "8px" }}>
              <h3>Account Touches & Signal Stream</h3>
              <div className="timeline-tabs" role="tablist">
                {(["all", "emails", "signals", "notes"] as const).map((tab) => (
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
          </div>

          {/* Quick Note Input Form */}
          <form className="quick-note-form" onSubmit={handleAddNote}>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Log an SDR memo, touchpoint note, or intent trigger detail…"
            />
            <button type="submit" disabled={!newNote.trim()}>
              Add Note
            </button>
          </form>

          {/* User Added Notes Stream */}
          {notes.length > 0 && (activeTab === "all" || activeTab === "notes") && (
            <div className="user-notes-stream">
              {notes.map((note) => (
                <div key={note.id} className="timeline-event-card user-note">
                  <div className="event-meta">
                    <span className="event-type-badge note-badge">Internal Note</span>
                    <span className="event-time">{note.time} by {note.author}</span>
                  </div>
                  <p className="event-desc">{note.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Touchpoint Timeline Feed */}
          <div className="timeline-stream">
            {activeTab !== "notes" &&
              filteredActivities.map((act) => (
                <div key={act.id} className="timeline-event-card">
                  <div className="event-meta">
                    <span
                      className="event-type-badge"
                      style={{ borderColor: act.badgeColor, color: act.badgeColor }}
                    >
                      {act.channel}
                    </span>
                    <span className="event-status">{act.status}</span>
                    <span className="event-time">{act.time}</span>
                  </div>
                  <h4 className="event-title">{act.title}</h4>
                  <p className="event-desc">{act.description}</p>
                  <div className="event-footer">
                    <span>Logged by: <strong>{act.author}</strong></span>
                  </div>
                </div>
              ))}

            {(activeTab === "notes"
              ? notes.length === 0
              : filteredActivities.length === 0 && (activeTab !== "all" || notes.length === 0)) && (
              <div className="empty-activities-notice">
                No activity records logged for this filter yet.
              </div>
            )}
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="drawer-footer">
          <div className="drawer-footer-status">
            <span>Status</span>
            <strong>{prospect.status}</strong>
          </div>
          <div className="drawer-footer-actions">
            <button
              type="button"
              className="drawer-secondary-btn"
              onClick={() => {
                const note = prompt("Quick note to append to timeline:", "");
                if (note && note.trim()) {
                  onAddNote({
                    id: `note-${Date.now()}`,
                    text: note.trim(),
                    time: "Just now",
                    author: "AE Quick Note",
                  });
                }
              }}
            >
              + Log Note
            </button>
            <button
              type="button"
              className="drawer-primary-btn"
              onClick={() => {
                onEnroll(prospect);
                onClose();
              }}
            >
              ⚡ Enroll in Sequence ➜
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
