import type { CrmEmailMessage, CrmEmailThread } from "@/lib/api/crm-emails";

export type EmailMessageView = {
    id: string;
    messageId: number;
    threadId: number;
    gmailMessageId: string;
    gmailThreadId: string;
    from: string;
    fromEmail: string;
    to: string;
    toEmail: string;
    subject: string;
    body: string;
    timestamp: string;
    timeAgo: string;
    isRead: boolean;
    isStarred: boolean;
    direction: "sent" | "received";
    status?: string;
    gmailAccountEmail?: string | null;
    errorMessage?: string | null;
    attachments?: { id?: number; name: string; size: string; downloadUrl?: string | null }[];
};

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTimestamp(iso?: string | null): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

export function mapMessageToView(message: CrmEmailMessage, leadName: string): EmailMessageView {
    const isSent = message.direction === "sent";
    const primaryTo = message.to_recipients?.[0];
    const timestamp = message.timestamp ?? message.sent_at ?? message.received_at;

    return {
        id: String(message.id),
        messageId: message.id,
        threadId: message.thread_id,
        gmailMessageId: message.gmail_message_id,
        gmailThreadId: message.gmail_thread_id ?? "",
        from: isSent ? (message.sent_by?.name ?? "You") : (message.from_name ?? message.from_email ?? "Unknown"),
        fromEmail: isSent ? (message.gmail_account_email ?? message.from_email ?? "") : (message.from_email ?? ""),
        to: isSent ? (primaryTo?.name ?? leadName) : "You",
        toEmail: isSent ? (primaryTo?.email ?? "") : (message.gmail_account_email ?? ""),
        subject: message.subject ?? "(No subject)",
        body: message.body_text ?? message.body_html?.replace(/<[^>]+>/g, "") ?? "",
        timestamp: formatTimestamp(timestamp),
        timeAgo: message.time_ago ?? "Just now",
        isRead: message.is_read,
        isStarred: message.is_starred,
        direction: message.direction,
        status: message.status,
        gmailAccountEmail: message.gmail_account_email,
        errorMessage: message.error_message,
        attachments: message.attachments?.map((att) => ({
            id: att.id,
            name: att.filename,
            size: formatBytes(att.size_bytes),
            downloadUrl: att.download_url,
        })),
    };
}

export function flattenThreadsToMessages(
    threads: CrmEmailThread[] | undefined,
    leadName: string,
): EmailMessageView[] {
    if (!threads) return [];

    const messages: EmailMessageView[] = [];

    for (const thread of threads) {
        if (thread.messages?.length) {
            const sortedMessages = [...thread.messages].sort(
                (a, b) => messageSortKey(b) - messageSortKey(a),
            );

            for (const message of sortedMessages) {
                messages.push(mapMessageToView(message, leadName));
            }
            continue;
        }

        if (thread.latest_message) {
            messages.push(mapMessageToView(thread.latest_message, leadName));
        }
    }

    return messages.sort((a, b) => messageSortKeyFromView(b) - messageSortKeyFromView(a));
}

function messageSortKey(message: CrmEmailMessage): number {
    const iso = message.sent_at ?? message.received_at ?? message.timestamp ?? null;
    if (!iso) return 0;

    const time = new Date(iso).getTime();
    return Number.isNaN(time) ? 0 : time;
}

function messageSortKeyFromView(message: EmailMessageView): number {
    const time = new Date(message.timestamp).getTime();
    return Number.isNaN(time) ? Number(message.messageId) : time;
}
