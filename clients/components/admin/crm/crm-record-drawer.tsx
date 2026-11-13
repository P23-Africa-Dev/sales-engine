"use client";
import { useEffect, useRef, useState } from "react";
import { Check, CopyCheck, Archive, RotateCcw, X } from "lucide-react";
import {
  CRM_STAGES,
  dateLabel,
  issuesFor,
  money,
  type CrmBusiness,
  type CrmRecord,
} from "@/lib/admin/admin-crm";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
export function CrmRecordDrawer({
  record,
  business,
  duplicate,
  onClose,
  onSave,
  onArchive,
  onNote,
  onDuplicate,
  onFollowup,
}: {
  record: CrmRecord;
  business: CrmBusiness;
  duplicate?: CrmRecord;
  onClose: () => void;
  onSave: (draft: CrmRecord, reason: string) => void;
  onArchive: (reason: string) => void;
  onNote: (note: string) => void;
  onDuplicate: (reason: string) => void;
  onFollowup: (reason: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(record);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    return () => el?.close();
  }, []);
  const issues = issuesFor(record);
  return (
    <dialog
      ref={dialog}
      className="sl-dialog crm-record-dialog"
      aria-labelledby="crm-record-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sl-dialog-head">
        <div>
          <h2 id="crm-record-title">Record oversight</h2>
          <span className="crm-dialog-subtitle">
            {record.id} · {business.name}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close record details"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="sl-dialog-body">
        <div className="crm-record-heading">
          <div>
            <h3>{record.company}</h3>
            <p>
              {record.contact} · {record.role}
            </p>
          </div>
          <span className="sl-badge">
            {record.archived ? "Archived" : record.stage}
          </span>
        </div>
        <div className="sl-config-grid">
          <div>
            <small>CLIENT WORKSPACE</small>
            <strong>{business.name}</strong>
          </div>
          <div>
            <small>ESTIMATED DEAL VALUE</small>
            <strong>{money(record.value)}</strong>
          </div>
          <div>
            <small>INDUSTRY & CATEGORY</small>
            <strong>
              {record.industry} · {record.category}
            </strong>
          </div>
          <div>
            <small>TERRITORY / LOCATION</small>
            <strong>
              {record.city}, {record.country}
            </strong>
          </div>
          <div>
            <small>CAPTURE SOURCE</small>
            <strong>{record.source}</strong>
          </div>
          <div>
            <small>CREATED / LAST UPDATED</small>
            <strong>
              {dateLabel(record.created)} / {dateLabel(record.updated)}
            </strong>
          </div>
        </div>
        {issues.length > 0 && (
          <div className="sl-warning">
            <div>
              <strong>Data quality needs attention</strong>
              <p>{issues.join(" · ")}</p>
            </div>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim())
              onSave({ ...draft, email: draft.email.trim() }, reason.trim());
          }}
        >
          <div className="sl-form-grid">
            <SearchableSelectField
              label="Client record owner"
              variant="form"
              defaultValue=""
              value={draft.owner}
              onChange={(nextOwner) =>
                setDraft({ ...draft, owner: nextOwner })
              }
              searchPlaceholder="Search team member…"
              options={[
                { value: "", label: "Unassigned" },
                ...business.team.map((owner) => ({
                  value: owner,
                  label: owner,
                })),
              ]}
            />
            <SearchableSelectField
              label="Pipeline stage"
              variant="form"
              defaultValue=""
              value={draft.stage}
              onChange={(nextStage) =>
                setDraft({
                  ...draft,
                  stage: nextStage as CrmRecord["stage"],
                })
              }
              searchPlaceholder="Search pipeline stage…"
              options={CRM_STAGES.map((stage) => ({
                value: stage,
                label: stage,
              }))}
            />
          </div>
          <label className="sl-field">
            Contact email
            <input
              type="email"
              placeholder="name@example.com"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </label>
          <label className="sl-field">
            Reason for management action
            <textarea
              required
              placeholder="Explain the correction or review for the audit log…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="sl-dialog-actions">
            <button
              type="button"
              disabled={!reason.trim()}
              onClick={() => onArchive(reason.trim())}
            >
              {record.archived ? (
                <RotateCcw size={15} />
              ) : (
                <Archive size={15} />
              )}{" "}
              {record.archived ? "Restore record" : "Archive record"}
            </button>
            <button
              className="sl-primary"
              type="submit"
              disabled={!reason.trim() || record.archived}
            >
              <Check size={16} /> Save corrections
            </button>
          </div>
        </form>
        {record.due &&
          !record.archived &&
          record.stage !== "Won" &&
          record.stage !== "Lost" && (
            <section className="crm-drawer-section">
              <h4>Client follow-up</h4>
              <p>{record.nextAction}</p>
              <p>Due {dateLabel(record.due)}</p>
              <button
                disabled={!reason.trim()}
                onClick={() => onFollowup(reason.trim())}
              >
                Mark follow-up complete
              </button>
            </section>
          )}
        {duplicate && !record.duplicateReviewed && (
          <section className="crm-drawer-section">
            <h4>Potential duplicate in this workspace</h4>
            <div className="crm-duplicate-pair">
              <div>
                <strong>{record.id}</strong>
                <p>{record.contact}</p>
                <small>{record.email || "Missing email"}</small>
              </div>
              <div>
                <strong>{duplicate.id}</strong>
                <p>{duplicate.contact}</p>
                <small>{duplicate.email || "Missing email"}</small>
              </div>
            </div>
            <p>
              Compare these records before deciding. Both belong to{" "}
              {business.name}.
            </p>
            <button
              disabled={!reason.trim()}
              onClick={() => onDuplicate(reason.trim())}
            >
              <CopyCheck size={15} /> Keep separate · dismiss duplicate flag
            </button>
          </section>
        )}
        <section className="crm-drawer-section">
          <h4>Record notes</h4>
          {record.notes.map((item, i) => (
            <article className="crm-note" key={i}>
              <p>{item.text}</p>
              <small>
                {item.actor} · {dateLabel(item.date)}
              </small>
            </article>
          ))}
          <label className="sl-field">
            Add admin review note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Record your review findings…"
            />
          </label>
          <button
            disabled={!note.trim()}
            onClick={() => {
              onNote(note.trim());
              setNote("");
            }}
          >
            Add note
          </button>
        </section>
        <p className="sl-footnote">
          Demo changes only. No client email is sent. Archiving retains the
          record and can be reversed from Records → Archived.
        </p>
      </div>
    </dialog>
  );
}
