"use client";

import { useRef, useState } from "react";
import { ChevronDown, Paperclip, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { EmailRecipient } from "@/lib/api/crm-emails";
import type { EmailAccountItem } from "@/lib/api/email-accounts";
import type { EmailMessageView } from "./email-types";
import { EmailRecipientField } from "./email-recipient-field";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
    enhanceCopilotEmailDraft,
    regenerateCopilotEmailDraft,
} from "@/lib/api/copilot";

type ElyTone = "professional" | "friendly" | "concise" | "persuasive";

const TONE_LABELS: Record<ElyTone, string> = {
    professional: "Professional",
    friendly: "Friendly",
    concise: "Concise",
    persuasive: "Persuasive",
};

const TONE_INSTRUCTIONS: Record<ElyTone, string> = {
    professional: "Make this email sound professional and polished.",
    friendly: "Make this email sound warm and friendly.",
    concise: "Make this email shorter and more concise.",
    persuasive: "Make this email more persuasive and compelling.",
};

type ComposeEmailPanelProps = {
    leadId?: number | string;
    leadName: string;
    leadEmail: string;
    companyId?: number | string;
    connectedAccountEmail?: string | null;
    emailAccounts?: EmailAccountItem[];
    replyTo?: EmailMessageView | null;
    isSending?: boolean;
    onSend: (payload: {
        to: EmailRecipient[];
        cc: EmailRecipient[];
        bcc: EmailRecipient[];
        subject: string;
        body_text: string;
        body_html: string;
        attachment_ids: number[];
        reply_to_gmail_message_id?: string;
        gmail_thread_id?: string;
        from_email_account_id?: number;
        email_account_id?: number;
    }) => void;
    onClose: () => void;
    onUploadAttachment: (file: File) => Promise<{ id: number }>;
};

export function ComposeEmailPanel({
    leadId,
    leadName,
    leadEmail,
    companyId,
    connectedAccountEmail,
    emailAccounts,
    replyTo,
    isSending = false,
    onSend,
    onClose,
    onUploadAttachment,
}: ComposeEmailPanelProps) {
    const [to] = useState<EmailRecipient[]>([{ email: leadEmail, name: leadName }]);
    const [cc, setCc] = useState<EmailRecipient[]>([]);
    const [bcc, setBcc] = useState<EmailRecipient[]>([]);
    const [subject, setSubject] = useState(
        replyTo
            ? replyTo.subject.startsWith("Re:")
                ? replyTo.subject
                : `Re: ${replyTo.subject}`
            : "",
    );
    const [body, setBody] = useState("");
    const [attachmentIds, setAttachmentIds] = useState<number[]>([]);
    const [attachmentNames, setAttachmentNames] = useState<Record<number, string>>({});
    const [uploading, setUploading] = useState(false);
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const [elyLoading, setElyLoading] = useState(false);
    const [elyMode, setElyMode] = useState<"enhance" | "regenerate" | null>(null);
    const [elyTone, setElyTone] = useState<ElyTone>("professional");
    const [showTonePicker, setShowTonePicker] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    // Determine the active accounts and selected sender
    const activeAccounts = (emailAccounts || []).filter(
        (a) => a.status === "active",
    );
    const defaultAccount =
        activeAccounts.find((a) => a.is_default) || activeAccounts[0] || null;
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
        defaultAccount?.id ?? null,
    );
    const selectedAccount = activeAccounts.find(
        (a) => a.id === selectedAccountId,
    ) || defaultAccount;

    const senderLabel = selectedAccount
        ? selectedAccount.display_name || selectedAccount.email
        : connectedAccountEmail || "No account selected";

    const handleSend = () => {
        if (!subject.trim() || !body.trim() || !leadEmail) return;
        onSend({
            to,
            cc,
            bcc,
            subject: subject.trim(),
            body_text: body.trim(),
            body_html: `<p>${body.trim().replace(/\n/g, "<br />")}</p>`,
            attachment_ids: attachmentIds,
            reply_to_gmail_message_id: replyTo?.gmailMessageId,
            gmail_thread_id: replyTo?.gmailThreadId,
            from_email_account_id: selectedAccountId ?? undefined,
            email_account_id: selectedAccountId ?? undefined,
        });
    };

    const handleAttachmentPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const attachment = await onUploadAttachment(file);
            setAttachmentIds((prev) => [...prev, attachment.id]);
            setAttachmentNames((prev) => ({ ...prev, [attachment.id]: file.name }));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const removeAttachment = (id: number) => {
        setAttachmentIds((prev) => prev.filter((item) => item !== id));
        setAttachmentNames((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const handleElyAction = async (mode: "enhance" | "regenerate") => {
        const token = getAuthTokenFromDocument();
        if (!token) {
            toast.error("You must be signed in to use ELY AI.");
            return;
        }

        if (!body.trim() && mode === "enhance") {
            toast.error("Type a draft first, then enhance it with ELY.");
            return;
        }

        setElyLoading(true);
        setElyMode(mode);

        const toneInstruction = TONE_INSTRUCTIONS[elyTone];
        const userNote = mode === "regenerate"
            ? `${toneInstruction} Write a new email draft.`
            : `${toneInstruction} Improve the existing draft while keeping the core message.`;

        const numericLeadId = leadId ? Number(leadId) : null;

        try {
            const payload = {
                company_id: companyId ?? undefined,
                lead_id: Number.isFinite(numericLeadId) && (numericLeadId ?? 0) > 0 ? numericLeadId : null,
                to_email: leadEmail || undefined,
                subject: subject.trim() || undefined,
                body_text: body.trim() || undefined,
                user_note: userNote,
            };

            const response = mode === "enhance"
                ? await enhanceCopilotEmailDraft(payload, token)
                : await regenerateCopilotEmailDraft(payload, token);

            const nextSubject = String(response.data?.subject ?? subject);
            const nextBody = String(response.data?.body_text ?? body);

            if (nextSubject && nextSubject !== subject) {
                setSubject(nextSubject);
            }
            if (nextBody) {
                setBody(nextBody);
            }

            toast.success(
                mode === "enhance"
                    ? "Draft enhanced by ELY."
                    : "New draft generated by ELY.",
            );
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "ELY AI request failed.";
            toast.error(message);
        } finally {
            setElyLoading(false);
            setElyMode(null);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between px-0 pb-4 border-b border-gray-100">
                <div>
                    <h3 className="text-[14px] sm:text-[15px] font-semibold text-[#0B1215]">
                        {replyTo ? "Reply" : "New Message"}
                    </h3>
                    {/* Sender account selector */}
                    <div className="relative mt-1">
                        {activeAccounts.length > 1 ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowAccountPicker((p) => !p)}
                                    className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-[#0B1215] transition-colors"
                                >
                                    <span className="text-[10px] text-gray-400">From</span>
                                    <span className="font-semibold">{senderLabel}</span>
                                    <ChevronDown size={10} />
                                </button>
                                {showAccountPicker && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowAccountPicker(false)}
                                        />
                                        <div className="absolute z-50 top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[220px]">
                                            {activeAccounts.map((account) => (
                                                <button
                                                    key={account.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedAccountId(account.id);
                                                        setShowAccountPicker(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                                                        account.id === selectedAccountId
                                                            ? "bg-gray-50"
                                                            : ""
                                                    }`}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[12px] font-semibold text-[#0B1215] truncate">
                                                            {account.display_name || account.email}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 truncate">
                                                            {account.email}
                                                        </p>
                                                    </div>
                                                    {account.id === selectedAccountId && (
                                                        <div className="w-2 h-2 rounded-full bg-[#0B1215] shrink-0" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                                From {senderLabel}
                            </p>
                        )}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
                >
                    <X size={14} className="text-gray-500" />
                </button>
            </div>

            <div className="flex flex-col gap-0 mt-4">
                <div className="flex items-center gap-3 py-3 border-b border-gray-50">
                    <label className="text-[12px] font-bold text-gray-400 w-12 shrink-0 uppercase tracking-wider">
                        To
                    </label>
                    <div className="flex-1 flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-[#0B1215] text-white px-3 py-1.5 rounded-full text-[11px] font-medium">
                            {leadName || leadEmail}
                        </div>
                        <span className="text-[12px] text-gray-400">{leadEmail}</span>
                    </div>
                </div>

                <EmailRecipientField
                    label="CC"
                    recipients={cc}
                    onChange={setCc}
                    companyId={companyId}
                    placeholder="Add CC..."
                />

                <EmailRecipientField
                    label="BCC"
                    recipients={bcc}
                    onChange={setBcc}
                    companyId={companyId}
                    placeholder="Add BCC..."
                />

                <div className="flex items-center gap-3 py-3 border-b border-gray-50">
                    <label className="text-[12px] font-bold text-gray-400 w-12 shrink-0 uppercase tracking-wider">
                        Subj
                    </label>
                    <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="What's this about?"
                        className="flex-1 outline-none text-[14px] font-medium text-[#0B1215] placeholder:text-gray-300 bg-transparent"
                    />
                </div>
            </div>

            <div className="flex-1 mt-4 min-h-0">
                <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write your message..."
                    className="w-full h-full min-h-[200px] resize-none outline-none text-[13px] text-[#374151] leading-relaxed placeholder:text-gray-300 bg-transparent"
                />
            </div>

            {attachmentIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {attachmentIds.map((id) => (
                        <span
                            key={id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100 text-[11px] text-gray-600"
                        >
                            <Paperclip size={11} className="text-gray-400" />
                            <span className="max-w-[140px] truncate">
                                {attachmentNames[id] || `Attachment ${id}`}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeAttachment(id)}
                                className="text-gray-400 hover:text-gray-700"
                                aria-label="Remove attachment"
                            >
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-auto">
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleAttachmentPick}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors border border-gray-100"
                    >
                        <Paperclip size={15} className="text-gray-400" />
                    </button>

                    {/* ELY AI buttons */}
                    <div className="relative flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => handleElyAction("enhance")}
                            disabled={elyLoading || !body.trim()}
                            title="Enhance draft with ELY"
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                                elyLoading
                                    ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                    : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                            }`}
                        >
                            {elyLoading && elyMode === "enhance" ? (
                                <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                            ) : (
                                <Sparkles size={12} />
                            )}
                            Enhance
                        </button>
                        <button
                            type="button"
                            onClick={() => handleElyAction("regenerate")}
                            disabled={elyLoading}
                            title="Regenerate draft with ELY"
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                elyLoading
                                    ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                    : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                            }`}
                        >
                            {elyLoading && elyMode === "regenerate" ? (
                                <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                            ) : (
                                <Sparkles size={12} />
                            )}
                            Regenerate
                        </button>

                        {/* Tone selector */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowTonePicker((p) => !p)}
                                disabled={elyLoading}
                                className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                            >
                                {TONE_LABELS[elyTone]}
                                <ChevronDown size={10} />
                            </button>
                            {showTonePicker && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setShowTonePicker(false)}
                                    />
                                    <div className="absolute z-50 bottom-full left-0 mb-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[140px]">
                                        {(Object.keys(TONE_LABELS) as ElyTone[]).map((tone) => (
                                            <button
                                                key={tone}
                                                type="button"
                                                onClick={() => {
                                                    setElyTone(tone);
                                                    setShowTonePicker(false);
                                                }}
                                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-gray-50 transition-colors ${
                                                    tone === elyTone
                                                        ? "font-semibold text-purple-700 bg-purple-50/50"
                                                        : "text-gray-600"
                                                }`}
                                            >
                                                {TONE_LABELS[tone]}
                                                {tone === elyTone && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600 shrink-0 ml-auto" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleSend}
                    disabled={!subject.trim() || !body.trim() || isSending || uploading || !leadEmail}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-[12px] sm:rounded-[14px] text-[13px] font-semibold transition-all shadow-md ${
                        subject.trim() && body.trim() && !isSending && !uploading && leadEmail
                            ? "bg-[#0B1215] text-white hover:opacity-90"
                            : "bg-gray-100 text-gray-300 cursor-not-allowed"
                    }`}
                >
                    {isSending ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                        </>
                    ) : (
                        <>
                            <Send size={15} />
                            Send Email
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
