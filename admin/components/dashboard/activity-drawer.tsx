"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { OutreachBusiness } from "@/lib/outreach-dashboard";
import { BusinessLogo } from "./business-logo";

interface ActivityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  business: OutreachBusiness | null | undefined;
  onOpenAccount: (business: OutreachBusiness) => void;
}

export function ActivityDrawer({
  isOpen,
  onClose,
  business,
  onOpenAccount,
}: ActivityDrawerProps) {
  const [activeTab, setActiveTab] = useState<"all" | "emails" | "meetings" | "notes">("all");
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!business) return null;

  const timelineEvents = [
    {
      id: "ev-1",
      type: "email",
      title: "Contract Proposal v2.4 Delivered & Opened",
      time: "Today at 14:28",
      channel: "Email",
      author: business.owner,
      status: "Opened (3x)",
      description: "Client opened the pilot implementation scope and reviewed the pricing appendix. Link clicked: 'SLA-Terms.pdf'.",
      badgeColor: "#0284c7",
    },
    {
      id: "ev-2",
      type: "meeting",
      title: "In-Person Executive Sync",
      time: "Yesterday at 11:00",
      channel: "In-person",
      author: business.owner,
      status: "Completed",
      description: `Met with procurement and engineering leads at ${business.company}. Finalized requirements for rollout. Next step: Account creation.`,
      badgeColor: "#7c3aed",
    },
    {
      id: "ev-3",
      type: "sms",
      title: "SMS Confirmation Received",
      time: `${business.created}`,
      channel: "SMS",
      author: "Decision Maker",
      status: "Received",
      description: "“Thanks Michael, our team reviewed the proposal and approved the onboarding plan. Ready to open our enterprise account.”",
      badgeColor: "#d97706",
    },
    {
      id: "ev-4",
      type: "email",
      title: "Initial Outreach Sequence",
      time: "June 08, 2026",
      channel: "Email",
      author: "Sales Automation",
      status: "Replied",
      description: `Automated campaign sequence #4 targeted to ${business.industry} leaders in ${business.country}.`,
      badgeColor: "#0d9488",
    },
  ];

  const filteredEvents = timelineEvents.filter((ev) => {
    if (activeTab === "all") return true;
    if (activeTab === "emails") return ev.type === "email";
    if (activeTab === "meetings") return ev.type === "meeting";
    if (activeTab === "notes") return ev.type === "note";
    return true;
  });

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNotes([newNote.trim(), ...notes]);
    setNewNote("");
  }

  function handleConfirmOpenAccount() {
    setIsSuccessModalOpen(true);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`activity-drawer-backdrop ${isOpen ? "is-visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-Over Drawer Sheet */}
      <aside
        className={`activity-drawer ${isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Full Activity Stream for ${business.name}`}
      >
        {/* Drawer Header */}
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

        {/* Scrollable Drawer Body */}
        <div className="drawer-body">
          {/* Executive Readiness Card */}
          <div className="readiness-card">
            <div className="readiness-header">
              <span className="readiness-badge">
                ⚡ 96% Deal Readiness • High Intent
              </span>
              <span className="readiness-owner">
                Owner: <strong>{business.owner}</strong>
              </span>
            </div>
            <p className="readiness-summary">
              Decision makers actively engaged. Pricing proposal reviewed 3 times today with zero blockers reported. Client requested enterprise account onboarding.
            </p>
            <div className="readiness-metrics-grid">
              <div className="metric-pill">
                <span>Emails Sent</span>
                <strong>{business.emailsSent ? business.emailsSent.toLocaleString() : "—"}</strong>
              </div>
              <div className="metric-pill">
                <span>Prospects</span>
                <strong>{business.prospects ? business.prospects.toLocaleString() : "—"}</strong>
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

          {/* Key Stakeholders Section */}
          <div className="stakeholders-section">
            <h3>Key Stakeholders</h3>
            <div className="stakeholder-list">
              <div className="stakeholder-card">
                <div className="stakeholder-avatar" style={{ backgroundColor: business.avatarColor }}>
                  {business.owner.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="stakeholder-info">
                  <strong>{business.owner}</strong>
                  <span>Head of Procurement • Verified Buyer</span>
                </div>
                <span className="stakeholder-tag primary-contact">Primary Contact</span>
              </div>
            </div>
          </div>

          {/* Timeline Filter Tabs */}
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

          {/* Quick Note Input Form */}
          <form className="quick-note-form" onSubmit={handleAddNote}>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add an internal note or call memo…"
            />
            <button type="submit" disabled={!newNote.trim()}>
              Add Note
            </button>
          </form>

          {/* User Added Notes */}
          {notes.length > 0 && (
            <div className="user-notes-stream">
              {notes.map((noteText, idx) => (
                <div key={idx} className="timeline-event-card user-note">
                  <div className="event-meta">
                    <span className="event-type-badge note-badge">Internal Note</span>
                    <span className="event-time">Just now by You</span>
                  </div>
                  <p className="event-desc">{noteText}</p>
                </div>
              ))}
            </div>
          )}

          {/* Touchpoint Timeline Feed */}
          <div className="timeline-stream">
            {filteredEvents.map((ev) => (
              <div key={ev.id} className="timeline-event-card">
                <div className="event-meta">
                  <span
                    className="event-type-badge"
                    style={{ borderColor: ev.badgeColor, color: ev.badgeColor }}
                  >
                    {ev.channel}
                  </span>
                  <span className="event-status">{ev.status}</span>
                  <span className="event-time">{ev.time}</span>
                </div>
                <h4 className="event-title">{ev.title}</h4>
                <p className="event-desc">{ev.description}</p>
                <div className="event-footer">
                  <span>Logged by: <strong>{ev.author}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="drawer-footer">
          <div className="drawer-footer-actions">
            <button
              type="button"
              className="drawer-secondary-btn"
              onClick={() => {
                const memo = prompt("Quick note to append to timeline:", "");
                if (memo && memo.trim()) {
                  setNotes([memo.trim(), ...notes]);
                }
              }}
            >
              + Log Note
            </button>
            <button
              type="button"
              className="drawer-primary-btn"
              onClick={handleConfirmOpenAccount}
            >
              ✨ Open Account ➜
            </button>
          </div>
        </div>
      </aside>

      {/* Account Opening Confirmation / Success Modal */}
      {isSuccessModalOpen && (
        <div
          className="account-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-headline"
        >
          <div className="account-modal-content">
            <div className="modal-icon-wrap" aria-hidden="true">
              ✓
            </div>
            <h3 id="modal-headline">Ready to Open Account?</h3>
            <p className="modal-desc">
              This will convert <strong>{business.name}</strong> ({business.company}) into an active enterprise account, assign <strong>{business.owner}</strong> as Lead AE, and trigger customer onboarding.
            </p>
            <div className="modal-details-card">
              <div>
                <span>Account ID</span>
                <strong>{business.id.toUpperCase()}-2026</strong>
              </div>
              <div>
                <span>Industry</span>
                <strong>{business.industry}</strong>
              </div>
              <div>
                <span>Country</span>
                <strong>{business.country}</strong>
              </div>
              <div>
                <span>Initial Status</span>
                <strong style={{ color: "#059669" }}>Active Customer</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={() => setIsSuccessModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-confirm-btn"
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  onOpenAccount(business);
                  onClose();
                  alert(`🎉 Account successfully opened for ${business.name}! Onboarding workflow initiated.`);
                }}
              >
                Confirm & Launch Account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
