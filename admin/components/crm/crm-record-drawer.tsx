"use client";
import { useEffect, useRef, useState } from "react";
import { Check, CopyCheck, Archive, RotateCcw, X } from "lucide-react";
import {
  dateLabel,
  isClosedStage,
  issuesFor,
  money,
  type CrmBusiness,
  type CrmRecord,
  type CrmStageOption,
} from "@/lib/admin-crm";

export function CrmRecordDrawer({
  record,
  business,
  stages,
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
  stages: CrmStageOption[];
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

  const stageChoices = stages.length
    ? stages
    : record.stageId
      ? [
          {
            id: record.stageId,
            name: record.stage,
            slug: record.stageSlug || record.stage,
          },
        ]
      : [];

  const teamOptions = Array.from(
    new Set(
      [...business.team, record.owner, draft.owner].filter(Boolean) as string[],
    ),
  );

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
              {record.contact}
              {record.role ? ` · ${record.role}` : ""}
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
            <strong>{money(record.value, false, record.currency)}</strong>
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
            <label className="sl-field">
              Client record owner
              <select
                value={draft.owner}
                onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
              >
                <option value="">Unassigned</option>
                {teamOptions.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </label>
            <label className="sl-field">
              Pipeline stage
              <select
                value={draft.stageId ? String(draft.stageId) : ""}
                onChange={(e) => {
                  const selected = stageChoices.find(
                    (s) => String(s.id) === e.target.value,
                  );
                  if (!selected) return;
                  setDraft({
                    ...draft,
                    stageId: selected.id,
                    stage: selected.name,
                    stageSlug: selected.slug,
                  });
                }}
              >
                {!draft.stageId && <option value="">Select stage</option>}
                {stageChoices.map((stage) => (
                  <option key={stage.id} value={String(stage.id)}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
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
        {record.due && !record.archived && !isClosedStage(record) && (
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
        {record.duplicateOf && (
          <section className="crm-drawer-section">
            <h4>Potential duplicate in this workspace</h4>
            <div className="crm-duplicate-pair">
              <div>
                <strong>{record.id}</strong>
                <p>{record.contact}</p>
                <small>{record.email || "Missing email"}</small>
              </div>
              <div>
                <strong>{duplicate?.id || record.duplicateOf}</strong>
                <p>{duplicate?.contact || "Linked duplicate"}</p>
                <small>
                  {duplicate?.email ||
                    (duplicate ? "Missing email" : `Ref ${record.duplicateOf}`)}
                </small>
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
          {!record.notes.length && (
            <p className="sl-footnote">No notes loaded for this record yet.</p>
          )}
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
          Management actions require a reason and are written to the admin audit
          trail. Archiving retains the record and can be reversed from Records →
          Archived.
        </p>
      </div>
    </dialog>
  );
}
