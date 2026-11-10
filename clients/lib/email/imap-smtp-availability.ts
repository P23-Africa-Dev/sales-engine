/**
 * Custom IMAP/SMTP is available again: outbound SMTP (465/587/25) is open on the
 * production cluster (verified 2026-08-14). It stays enabled unless explicitly
 * disabled via NEXT_PUBLIC_EMAIL_IMAP_SMTP_ENABLED=false (set this if the hosting
 * provider reinstates the SMTP block).
 */
export function isImapSmtpConnectionAvailable(): boolean {
  const flag = process.env.NEXT_PUBLIC_EMAIL_IMAP_SMTP_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") {
    return false;
  }

  return true;
}

export const IMAP_SMTP_UNSUPPORTED_MESSAGE =
  "Custom IMAP/SMTP is not available right now. Connect Google or Microsoft instead to send and sync CRM email from your mailbox.";
