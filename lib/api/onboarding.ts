"use client";

import {
  extractAccountStatusCode,
  handleAccountAccessDenied,
  handleSubscriptionRequired,
  isAccountStatusCode,
  isSubscriptionStatusCode,
} from "@/lib/auth/account-status";
import {
  enqueueOfflineHttpMutation,
  isOfflineQueueSupportedPath,
} from "@/lib/offline/queue";
import { formatRateLimitMessage, resolveApiErrorMessage } from "@/lib/api/errors";
import {
  getSupportLevelFromDocument,
  isSupportSessionActiveInDocument,
} from "@/lib/auth/support-session";

export type ApiEnvelope<TData> = {
  success: boolean;
  message: string;
  data: TData;
  errors: Record<string, string[]> | null;
  meta?: {
    queued_offline?: boolean;
    queue_id?: number;
  };
};

type ApiRequestOptions = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  token?: string;
};

export class ApiRequestError extends Error {
  status: number;
  errors: Record<string, string[]> | null;
  code?: string;
  retryAfter?: number;

  constructor(
    message: string,
    status: number,
    errors: Record<string, string[]> | null = null,
    code?: string,
    retryAfter?: number
  ) {
    super(
      status === 429
        ? formatRateLimitMessage(resolveApiErrorMessage(message, errors), retryAfter)
        : resolveApiErrorMessage(message, errors)
    );
    this.status = status;
    this.errors = errors;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

async function queueOfflineIfSupported<TData>(
  method: ApiRequestOptions["method"],
  path: string,
  body?: unknown,
): Promise<ApiEnvelope<TData> | null> {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (
    method === "GET" ||
    isFormData ||
    typeof window === "undefined" ||
    !isOfflineQueueSupportedPath(method, path)
  ) {
    return null;
  }

  const queueId = await enqueueOfflineHttpMutation({
    method,
    path,
    body,
  });

  return {
    success: true,
    message: "Saved offline. It will sync automatically when connection returns.",
    data: {} as TData,
    errors: null,
    meta: {
      queued_offline: true,
      queue_id: queueId,
    },
  };
}

export async function apiRequest<TData>({
  method,
  path,
  body,
  token,
}: ApiRequestOptions): Promise<ApiEnvelope<TData>> {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const supportActive =
    typeof window !== "undefined" && isSupportSessionActiveInDocument();
  const supportLevel = supportActive ? getSupportLevelFromDocument() : null;

  if (supportLevel === "read_only" && method !== "GET") {
    throw new ApiRequestError(
      "This support session is read only. End it and create an operational session to make changes.",
      403,
      null,
    );
  }

  if (
    method !== "GET" &&
    !isFormData &&
    typeof window !== "undefined" &&
    !supportActive &&
    !navigator.onLine &&
    isOfflineQueueSupportedPath(method, path)
  ) {
    return (await queueOfflineIfSupported<TData>(method, path, body)) as ApiEnvelope<TData>;
  }

  let response: Response;

  try {
    const requestUrl = supportActive
      ? `/api/support/proxy${path}`
      : `${API_BASE_URL}${path}`;

    response = await fetch(requestUrl, {
      method,
      headers: {
        Accept: "application/json",
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(!supportActive && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? (isFormData ? (body as FormData) : JSON.stringify(body)) : undefined,
    });
  } catch (error) {
    const queued = await queueOfflineIfSupported<TData>(method, path, body);
    if (queued && isNetworkFailure(error)) {
      return queued;
    }
    throw new ApiRequestError("Network error. Please check your connection.", 0, null);
  }

  let payload: ApiEnvelope<TData>;

  try {
    payload = (await response.json()) as ApiEnvelope<TData>;
  } catch {
    throw new ApiRequestError(
      response.status >= 500
        ? "Server error. Please try again shortly."
        : "Request failed.",
      response.status,
      null
    );
  }

  if (!response.ok || !payload.success) {
    const accountStatus = extractAccountStatusCode({
      code: (payload as { code?: string }).code,
      data:
        payload.data && typeof payload.data === "object"
          ? (payload.data as { account_status?: string })
          : null,
    });

    const statusCode = (payload as { code?: string }).code ?? accountStatus;

    if (response.status === 402 && isSubscriptionStatusCode(statusCode)) {
      handleSubscriptionRequired(
        statusCode,
        resolveApiErrorMessage(payload.message, payload.errors) || undefined
      );
    }

    if (response.status === 403 && isAccountStatusCode(accountStatus) && token) {
      handleAccountAccessDenied(
        resolveApiErrorMessage(
          payload.message || "Your account access has been restricted.",
          payload.errors
        ),
        {
          accountStatus,
        }
      );
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;

    throw new ApiRequestError(
      payload.message || "Request failed.",
      response.status,
      payload.errors,
      accountStatus,
      Number.isFinite(retryAfter) ? retryAfter : undefined
    );
  }

  return payload;
}

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
};

export type VerifyEmailPayload = {
  email: string;
  otp_code: string;
};

export type ResendOtpPayload = {
  email: string;
};

export type WorkspacePayload = {
  company_name: string;
  country: string;
  team_size: "solo" | "2-10" | "11-50" | "51-200" | "201-500" | "500+";
  purpose:
  | "personal"
  | "startup"
  | "enterprise"
  | "freelancing"
  | "education"
  | "non_profit"
  | "other";
  user_type:
  | "developer"
  | "designer"
  | "product_manager"
  | "marketing"
  | "sales"
  | "operations"
  | "founder"
  | "student"
  | "other";
};

type RegisterResponse = {
  email: string;
};

type VerifyEmailResponse = {
  token: string;
  token_type: "Bearer";
  expires_in_days: number;
  user: {
    id: number;
    name: string;
    email: string;
    email_verified: boolean;
    onboarding_completed: boolean;
    onboarding_completed_at: string | null;
  };
  onboarding_completed: boolean;
};

export function registerUser(payload: RegisterPayload) {
  return apiRequest<RegisterResponse>({
    method: "POST",
    path: "/auth/register",
    body: payload,
  });
}

export function verifyEmailOtp(payload: VerifyEmailPayload) {
  return apiRequest<VerifyEmailResponse>({
    method: "POST",
    path: "/auth/verify-email",
    body: payload,
  });
}

export function resendEmailOtp(payload: ResendOtpPayload) {
  return apiRequest<RegisterResponse>({
    method: "POST",
    path: "/auth/resend-otp",
    body: payload,
  });
}

export type WorkspaceResponse = {
  token: string;
  token_type: "Bearer";
  workspace: {
    id: string;
    name: string;
    slug: string;
    country: string;
    team_size: string;
    purpose: string;
    user_type: string;
    created_at: string;
  };
  user: {
    id: number;
    name: string;
    email: string;
    avatar: string | null;
    email_verified: boolean;
    onboarding_completed: boolean;
    onboarding_completed_at: string | null;
    created_at: string;
  };
};

export function createWorkspace(payload: WorkspacePayload, token: string) {
  return apiRequest<WorkspaceResponse>({
    method: "POST",
    path: "/onboarding/workspace",
    body: payload,
    token,
  });
}

export type ActiveCompany = {
  id: number;
  company_id: string;
  name: string;
  status: string;
  role: string;
  subscription_status?: string;
  has_active_subscription?: boolean;
  billing_enforced?: boolean;
};

export type BillingSnapshot = {
  subscription_status: string;
  has_active_subscription: boolean;
  assigned_plan_key?: string | null;
  billing_enforced?: boolean;
};

export type MeResponse = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  email_verified: boolean;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  active_company: ActiveCompany | null;
  billing?: BillingSnapshot | null;
  created_at: string;
};

export function getMe(token: string) {
  return apiRequest<MeResponse>({
    method: "GET",
    path: "/user/me",
    token,
  });
}
