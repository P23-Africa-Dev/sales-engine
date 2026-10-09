import { clearAuthSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";

export const ACCOUNT_STATUS_CODES = [
  "deactivated",
  "suspended_temporary",
  "suspended_permanent",
] as const;

export const SUBSCRIPTION_STATUS_CODES = [
  "subscription_required",
  "subscription_suspended",
] as const;

export type SubscriptionStatusCode = (typeof SUBSCRIPTION_STATUS_CODES)[number];

export type AccountStatusCode = (typeof ACCOUNT_STATUS_CODES)[number];

export function isAccountStatusCode(
  value: string | undefined | null
): value is AccountStatusCode {
  return ACCOUNT_STATUS_CODES.includes(value as AccountStatusCode);
}

type AccountStatusPayload = {
  code?: string;
  data?: { account_status?: string } | null;
};

export function extractAccountStatusCode(
  payload: AccountStatusPayload
): string | undefined {
  return payload.code ?? payload.data?.account_status;
}

export function isSubscriptionStatusCode(
  value: string | undefined | null
): value is SubscriptionStatusCode {
  return SUBSCRIPTION_STATUS_CODES.includes(value as SubscriptionStatusCode);
}

export function handleSubscriptionRequired(
  code: SubscriptionStatusCode,
  message?: string,
) {
  if (typeof window === "undefined" || redirectPending) {
    return;
  }

  if (window.location.pathname.startsWith("/subscribe") || window.location.pathname.startsWith("/pay/")) {
    return;
  }

  // Defensive guard: when billing enforcement is disabled at the API layer,
  // we still occasionally see stale 402 responses from cached endpoints.
  // Treat any sessionStorage hint as authoritative.
  try {
    if (typeof window !== "undefined" && window.sessionStorage.getItem("billing.enforced") === "0") {
      return;
    }
  } catch {
    // sessionStorage may be disabled (private mode); fall through to redirect.
  }

  redirectPending = true;
  const params = new URLSearchParams();
  params.set("reason", code === "subscription_suspended" ? "expired" : "required");
  if (message) {
    params.set("message", message);
  }
  window.location.href = `/subscribe?${params.toString()}`;
}

let redirectPending = false;

function inferLoginPath(): string {
  if (typeof window === "undefined") {
    return "/login";
  }

  return window.location.pathname.startsWith("/agent") ? "/agent/login" : "/login";
}

export function handleAccountAccessDenied(
  message: string,
  options?: { loginPath?: string; accountStatus?: string }
) {
  if (typeof window === "undefined" || redirectPending) {
    return;
  }

  redirectPending = true;
  clearAuthSession();
  useAuthStore.getState().clearUser();

  const params = new URLSearchParams();
  if (options?.accountStatus) {
    params.set("account_status", options.accountStatus);
  }
  if (message) {
    params.set("message", message);
  }

  const loginPath = options?.loginPath ?? inferLoginPath();
  const query = params.toString();
  window.location.href = query ? `${loginPath}?${query}` : loginPath;
}

export function getAccountStatusMessage(searchParams: URLSearchParams): string | null {
  return searchParams.get("message");
}
