"use client";

import { useMemo, useState } from "react";
import {
    ArrowLeft,
    Clock,
    Inbox,
    MailOpen,
    MailWarning,
    Paperclip,
    Reply,
    Send,
    Tag,
    Trash2,
} from "lucide-react";
import type { GmailLabel } from "@/lib/api/crm-emails";
import type { EmailMessageView } from "./email-types";

type EmailDetailViewProps = {
    email: EmailMessageView;
    threadMessages?: EmailMessageView[];
    gmailLabels?: GmailLabel[];
    labelsLoading?: boolean;
    mailboxBusy?: boolean;
    onBack: () => void;
    onReply: () => void;
    onDelete: () => void;
    onMarkUnread?: () => void;
    onMoveInbox?: () => void;
    onMoveSpam?: () => void;
    onCreateLabel?: (name: string) => Promise<void> | void;
    onRenameLabel?: (labelId: string, name: string) => Promise<void> | void;
    onDeleteLabel?: (labelId: string) => Promise<void> | void;
    onApplyLabel?: (labelId: string) => Promise<void> | void;
    onRemoveLabel?: (labelId: string) => Promise<void> | void;
};

function MessageBlock({ email }: { email: EmailMessageView }) {
    const isSent = email.direction === "sent";

    return (
        <article className="rounded-[14px] border border-gray-100 bg-gray-50/60 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm shrink-0 ${
                            isSent
                                ? "bg-[#0B1215] text-white"
                                : "bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white"
                        }`}
                    >
                        {isSent ? (
                            <Send size={13} className="rotate-[-30deg]" />
                        ) : (
                            <span className="text-[12px] font-semibold">{email.from.charAt(0)}</span>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-[#0B1215]">{email.from}</span>
                            {isSent && (
                                <span className="text-[10px] font-medium text-[#10B981] bg-emerald-50 px-2 py-0.5 rounded-full">
                                    {email.status === "failed" ? "Failed" : "Sent"}
                                </span>
                            )}
                            {!isSent && !email.isRead && (
                                <span className="text-[10px] font-medium text-[#3B82F6] bg-blue-50 px-2 py-0.5 rounded-full">
                                    New
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] text-gray-400 break-all">
                            {isSent ? `To: ${email.toEmail}` : email.fromEmail}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 text-gray-400 shrink-0">
                    <Clock size={12} />
                    <span className="text-[11px] font-normal">{email.timestamp}</span>
                </div>
            </div>

            <div className="text-[13px] text-[#374151] leading-[1.85] whitespace-pre-wrap">
                {email.body}
            </div>

            {email.errorMessage && (
                <p className="text-[11px] text-red-500 mt-3">{email.errorMessage}</p>
            )}

            {email.attachments && email.attachments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                        Attachments ({email.attachments.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {email.attachments.map((att) => (
                            <a
                                key={att.id ?? att.name}
                                href={att.downloadUrl ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 bg-white hover:bg-gray-100 transition-colors rounded-xl px-3 py-2 border border-gray-100"
                            >
                                <Paperclip size={13} className="text-red-400" />
                                <span className="text-[12px] font-medium text-[#0B1215]">{att.name}</span>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </article>
    );
}

export function EmailDetailView({
    email,
    threadMessages,
    gmailLabels = [],
    labelsLoading = false,
    mailboxBusy = false,
    onBack,
    onReply,
    onDelete,
    onMarkUnread,
    onMoveInbox,
    onMoveSpam,
    onCreateLabel,
    onRenameLabel,
    onDeleteLabel,
    onApplyLabel,
    onRemoveLabel,
}: EmailDetailViewProps) {
    const [showLabels, setShowLabels] = useState(false);
    const [newLabelName, setNewLabelName] = useState("");
    const [renamingLabelId, setRenamingLabelId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const conversation =
        threadMessages && threadMessages.length > 0
            ? [...threadMessages].sort((a, b) => a.messageId - b.messageId)
            : [email];

    const userLabels = useMemo(
        () => gmailLabels.filter((label) => label.type === "user"),
        [gmailLabels],
    );

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 gap-2">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-[12px] font-medium text-gray-500 hover:text-[#0B1215] transition-colors"
                >
                    <ArrowLeft size={16} />
                    Back to inbox
                </button>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
                    {onMarkUnread && (
                        <button
                            onClick={onMarkUnread}
                            disabled={mailboxBusy}
                            title="Mark as unread"
                            className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100 disabled:opacity-50"
                        >
                            <MailOpen size={15} className="text-gray-500" />
                        </button>
                    )}
                    {onMoveInbox && (
                        <button
                            onClick={onMoveInbox}
                            disabled={mailboxBusy}
                            title="Move to Inbox"
                            className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100 disabled:opacity-50"
                        >
                            <Inbox size={15} className="text-gray-500" />
                        </button>
                    )}
                    {onMoveSpam && (
                        <button
                            onClick={onMoveSpam}
                            disabled={mailboxBusy}
                            title="Move to Spam"
                            className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-amber-50 transition-colors border border-gray-100 disabled:opacity-50"
                        >
                            <MailWarning size={15} className="text-gray-500" />
                        </button>
                    )}
                    {(onCreateLabel || onApplyLabel) && (
                        <button
                            onClick={() => setShowLabels((prev) => !prev)}
                            disabled={mailboxBusy}
                            title="Manage Gmail labels"
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors border disabled:opacity-50 ${
                                showLabels
                                    ? "bg-[#0B1215] text-white border-[#0B1215]"
                                    : "bg-gray-50 hover:bg-gray-100 border-gray-100 text-gray-500"
                            }`}
                        >
                            <Tag size={15} />
                        </button>
                    )}
                    <button
                        onClick={onReply}
                        className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
                    >
                        <Reply size={15} className="text-gray-500" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-red-50 transition-colors border border-gray-100 group"
                    >
                        <Trash2
                            size={15}
                            className="text-gray-400 group-hover:text-red-500 transition-colors"
                        />
                    </button>
                </div>
            </div>

            {showLabels && (
                <div className="mt-3 mb-1 rounded-[14px] border border-gray-100 bg-gray-50/80 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-semibold text-[#0B1215]">Gmail labels</p>
                        {labelsLoading && (
                            <span className="text-[11px] text-gray-400">Loading…</span>
                        )}
                    </div>

                    {onCreateLabel && (
                        <form
                            className="flex gap-2"
                            onSubmit={async (event) => {
                                event.preventDefault();
                                const name = newLabelName.trim();
                                if (!name || mailboxBusy) return;
                                await onCreateLabel(name);
                                setNewLabelName("");
                            }}
                        >
                            <input
                                value={newLabelName}
                                onChange={(event) => setNewLabelName(event.target.value)}
                                placeholder="Create label"
                                className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-gray-400"
                            />
                            <button
                                type="submit"
                                disabled={mailboxBusy || !newLabelName.trim()}
                                className="rounded-xl bg-[#0B1215] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                            >
                                Create
                            </button>
                        </form>
                    )}

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {userLabels.length === 0 ? (
                            <p className="text-[12px] text-gray-400">No custom Gmail labels yet.</p>
                        ) : (
                            userLabels.map((label) => (
                                <div
                                    key={label.id}
                                    className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-2.5 py-2"
                                >
                                    {renamingLabelId === label.id ? (
                                        <form
                                            className="flex flex-1 gap-2"
                                            onSubmit={async (event) => {
                                                event.preventDefault();
                                                const name = renameValue.trim();
                                                if (!name || !onRenameLabel || mailboxBusy) return;
                                                await onRenameLabel(label.id, name);
                                                setRenamingLabelId(null);
                                                setRenameValue("");
                                            }}
                                        >
                                            <input
                                                value={renameValue}
                                                onChange={(event) => setRenameValue(event.target.value)}
                                                className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[12px] outline-none"
                                            />
                                            <button
                                                type="submit"
                                                className="text-[11px] font-semibold text-[#0B1215]"
                                            >
                                                Save
                                            </button>
                                        </form>
                                    ) : (
                                        <span className="flex-1 text-[12px] font-medium text-[#0B1215] truncate">
                                            {label.name}
                                        </span>
                                    )}
                                    {onApplyLabel && (
                                        <button
                                            type="button"
                                            disabled={mailboxBusy}
                                            onClick={() => void onApplyLabel(label.id)}
                                            className="text-[11px] font-semibold text-blue-600 disabled:opacity-50"
                                        >
                                            Apply
                                        </button>
                                    )}
                                    {onRemoveLabel && (
                                        <button
                                            type="button"
                                            disabled={mailboxBusy}
                                            onClick={() => void onRemoveLabel(label.id)}
                                            className="text-[11px] font-semibold text-gray-500 disabled:opacity-50"
                                        >
                                            Remove
                                        </button>
                                    )}
                                    {onRenameLabel && renamingLabelId !== label.id && (
                                        <button
                                            type="button"
                                            disabled={mailboxBusy}
                                            onClick={() => {
                                                setRenamingLabelId(label.id);
                                                setRenameValue(label.name);
                                            }}
                                            className="text-[11px] font-semibold text-gray-500 disabled:opacity-50"
                                        >
                                            Rename
                                        </button>
                                    )}
                                    {onDeleteLabel && (
                                        <button
                                            type="button"
                                            disabled={mailboxBusy}
                                            onClick={() => void onDeleteLabel(label.id)}
                                            className="text-[11px] font-semibold text-red-500 disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <div className="py-4 sm:py-5 border-b border-gray-50">
                <h3 className="text-[15px] sm:text-[17px] font-semibold text-[#0B1215] leading-tight">
                    {email.subject}
                </h3>
                {conversation.length > 1 && (
                    <p className="text-[11px] text-gray-400 mt-1">
                        {conversation.length} messages in this thread
                    </p>
                )}
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
                {conversation.map((message) => (
                    <MessageBlock key={message.id} email={message} />
                ))}
            </div>

            <div className="pt-4 border-t border-gray-100">
                <button
                    onClick={onReply}
                    className="w-full flex items-center gap-3 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 rounded-[14px] border border-gray-100 transition-colors text-left group"
                >
                    <Reply
                        size={16}
                        className="text-gray-400 group-hover:text-[#0B1215] transition-colors"
                    />
                    <span className="text-[13px] text-gray-400 group-hover:text-gray-500 transition-colors">
                        Click to reply...
                    </span>
                </button>
            </div>
        </div>
    );
}
