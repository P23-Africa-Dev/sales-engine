import { toast } from "sonner";

type EmailOAuthToastPayload = {
  success?: boolean;
  message?: string;
  provider?: string;
};

let lastKey = "";
let lastAt = 0;

/**
 * Show at most one Email Accounts OAuth toast for the same result within a short window.
 * Multiple listeners (Settings, AI chat, CRM banner) can receive the same postMessage.
 */
export function toastEmailOAuthResult(payload: EmailOAuthToastPayload): void {
  const success = Boolean(payload.success);
  const message = (payload.message || "").trim();
  const provider = (payload.provider || "").trim();
  const key = `${success}|${provider}|${message}`;
  const now = Date.now();

  if (key === lastKey && now - lastAt < 4000) {
    return;
  }

  lastKey = key;
  lastAt = now;

  const display =
    message ||
    (success
      ? "Email account connected successfully."
      : "Email account connection failed. Please try again.");

  if (success) {
    toast.success(display);
    return;
  }

  toast.error(display, { duration: 12000 });
}
