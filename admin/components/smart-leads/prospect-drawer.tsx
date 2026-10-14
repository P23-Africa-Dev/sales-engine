"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Mail, Phone, ShieldCheck, X } from "lucide-react";
import type { SmartLead } from "@/lib/smart-leads";
interface Props {
  isOpen: boolean;
  onClose: () => void;
  prospect: SmartLead | null | undefined;
  onEnroll: (lead: SmartLead) => void;
  businessName: string;
  notes: string[];
  onAddNote: (note: string) => void;
}
export function ProspectDrawer({
  isOpen,
  onClose,
  prospect,
  onEnroll,
  businessName,
  notes,
  onAddNote,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState("all");
  const [note, setNote] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (isOpen && prospect) el?.showModal();
    else el?.close();
    return () => el?.close();
  }, [isOpen, prospect?.id]);
  useEffect(() => {
    setTab("all");
    setNote("");
  }, [prospect?.id]);
  if (!prospect) return null;
  const activity = prospect.activities.filter(
    (a) =>
      tab === "all" ||
      (tab === "emails" && a.type === "email") ||
      (tab === "signals" && a.type === "signal"),
  );
  return (
    <dialog
      ref={ref}
      className="sl-dialog sp-prospect-dialog"
      aria-labelledby="sp-prospect-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sl-dialog-head">
        <div>
          <h2 id="sp-prospect-title">Prospect evidence</h2>
          <span className="sp-dialog-owner">
            Client workspace · {businessName}
          </span>
        </div>
        <button aria-label="Close prospect details" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="sl-dialog-body">
        <h3>{prospect.company}</h3>
        <p>
          {prospect.industry} · {prospect.location}
        </p>
        <div className="sl-config-grid">
          <div>
            <small>FIT SCORE</small>
            <strong>{prospect.fitScore}%</strong>
          </div>
          <div>
            <small>BUYING INTENT</small>
            <strong>{prospect.intentLevel}</strong>
          </div>
          <div>
            <small>COMPANY SIZE</small>
            <strong>{prospect.employees} employees</strong>
          </div>
          <div>
            <small>REVENUE ESTIMATE</small>
            <strong>{prospect.revenue}</strong>
          </div>
        </div>
        <section className="sp-evidence">
          <h4>{prospect.intentTrigger}</h4>
          <p>{prospect.whyNow}</p>
          <div className="sp-tech-tags">
            {prospect.techStack.map((t) => (
              <span className="sl-badge" key={t}>
                {t}
              </span>
            ))}
          </div>
        </section>
        <section className="sp-contact">
          <h4>Decision maker</h4>
          <strong>{prospect.primaryContact.name}</strong>
          <p>{prospect.primaryContact.title}</p>
          <span className="sp-contact-line">
            <Mail size={15} />
            {prospect.primaryContact.email}
          </span>
          <span className="sp-contact-line">
            <Phone size={15} />
            {prospect.primaryContact.phone}
          </span>
          <span className="sp-contact-line">
            <ShieldCheck size={15} />
            {prospect.primaryContact.verified
              ? "Contact details verified"
              : "Contact requires verification"}
          </span>
        </section>
        <div className="sp-tier-filters" aria-label="Prospect activity filters">
          {[
            { key: "all", label: "All activity" },
            { key: "emails", label: "Emails" },
            { key: "signals", label: "Signals" },
            { key: "notes", label: "Admin notes" },
          ].map((item) => (
            <button
              key={item.key}
              aria-pressed={tab === item.key}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab !== "notes" && (
          <div className="sp-activity">
            {activity.map((a) => (
              <article key={a.id}>
                <strong>{a.title}</strong>
                <p>{a.description}</p>
                <small>
                  {a.author} · {a.channel} · {a.time}
                </small>
              </article>
            ))}
            {!activity.length && (
              <p className="sl-empty">No activity in this view.</p>
            )}
          </div>
        )}
        {(tab === "all" || tab === "notes") && (
          <section className="sp-notes">
            <h4>Admin notes</h4>
            {notes.map((n, i) => (
              <article key={i}>
                <p>{n}</p>
                <small>Admin review · local demo</small>
              </article>
            ))}
            {!notes.length && <p>No admin notes yet.</p>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) {
                  onAddNote(note.trim());
                  setNote("");
                }
              }}
            >
              <label className="sl-field">
                Add review note
                <textarea
                  placeholder="Capture your review findings…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button type="submit" disabled={!note.trim()}>
                <Check size={15} /> Save note
              </button>
            </form>
          </section>
        )}
        <div className="sl-dialog-actions">
          <button className="sl-primary" onClick={() => onEnroll(prospect)}>
            Prepare demo enrollment <Mail size={16} />
          </button>
        </div>
        <p className="sl-footnote">
          Sample evidence and contact data. Notes and enrollment are local to
          this page session and reset on refresh.
        </p>
      </div>
    </dialog>
  );
}
