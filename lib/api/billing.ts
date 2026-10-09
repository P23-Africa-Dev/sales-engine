"use client";

import { apiRequest, ApiRequestError } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export type BillingPlan = {
  key: string;
  label: string;
  seat_limit: number;
  monthly_amount: number;
  annual_amount: number;
  monthly_amount_display: string;
  annual_amount_display: string;
  monthly_available?: boolean;
  annual_available?: boolean;
};

export type BillingStatus = {
  company_id: number;
  company_name: string;
  public_company_id: string;
  billing_enforced: boolean;
  subscription_status: string;
  has_active_subscription: boolean;
  has_paid_subscription: boolean;
  plan_key: string | null;
  billing_interval: string | null;
  assigned_plan_key: string | null;
  assigned_billing_interval: string | null;
  can_choose_plan: boolean;
  can_manage_billing: boolean;
  viewer_role: string | null;
  has_stripe_customer?: boolean;
  has_active_stripe_subscription?: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_ends_at: string | null;
  seat_usage: {
    used: number;
    limit: number | null;
    remaining: number | null;
  };
  payment_method?: {
    type: string | null;
    last_four: string | null;
    exp_month: number | null;
    exp_year: number | null;
  };
};

export type BillingPaymentMethod = {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
};

export type BillingPaymentMethodsResponse = {
  items: BillingPaymentMethod[];
  default_payment_method_id: string | null;
  requires_payment_method: boolean;
};

export type BillingPlansResponse = {
  plans: BillingPlan[];
  billing_status: BillingStatus;
};

export type PaymentLinkPayload = {
  company_name: string;
  public_company_id: string;
  plan_key: string;
  plan_label: string;
  billing_interval: string;
  amount_cents: number;
  amount_display: string;
  already_paid: boolean;
  expires_at: string | null;
};

function authToken(): string | undefined {
  return getAuthTokenFromDocument() ?? undefined;
}

export async function getBillingStatus() {
  return apiRequest<BillingStatus>({
    method: "GET",
    path: "/billing/status",
    token: authToken(),
  });
}

export async function getBillingPlans() {
  return apiRequest<BillingPlansResponse>({
    method: "GET",
    path: "/billing/plans",
    token: authToken(),
  });
}

export async function createCheckoutSession(payload: {
  plan_key: string;
  interval: "monthly" | "annual";
  context?: "onboarding" | "renewal" | "upgrade";
}) {
  return apiRequest<{ checkout_url: string }>({
    method: "POST",
    path: "/billing/checkout",
    token: authToken(),
    body: payload,
  });
}

export async function changeBillingPlan(payload: {
  plan_key: string;
  interval: "monthly" | "annual";
  company_id?: number;
}) {
  return apiRequest<BillingStatus>({
    method: "POST",
    path: "/billing/change-plan",
    token: authToken(),
    body: payload,
  });
}

export async function createBillingPortalSession() {
  return apiRequest<{ portal_url: string }>({
    method: "POST",
    path: "/billing/portal",
    token: authToken(),
  });
}

export async function getBillingPaymentMethods(companyId?: number | string) {
  const qs = companyId != null ? `?company_id=${encodeURIComponent(String(companyId))}` : "";
  return apiRequest<BillingPaymentMethodsResponse>({
    method: "GET",
    path: `/billing/payment-methods${qs}`,
    token: authToken(),
  });
}

export async function createBillingPaymentMethodSetup(companyId?: number | string) {
  return apiRequest<{ client_secret: string; setup_intent_id: string }>({
    method: "POST",
    path: "/billing/payment-methods/setup",
    token: authToken(),
    body: companyId != null ? { company_id: companyId } : undefined,
  });
}

export async function setDefaultBillingPaymentMethod(
  paymentMethodId: string,
  companyId?: number | string,
) {
  return apiRequest<BillingPaymentMethodsResponse>({
    method: "POST",
    path: `/billing/payment-methods/${paymentMethodId}/default`,
    token: authToken(),
    body: companyId != null ? { company_id: companyId } : undefined,
  });
}

export async function detachBillingPaymentMethod(
  paymentMethodId: string,
  companyId?: number | string,
) {
  const qs = companyId != null ? `?company_id=${encodeURIComponent(String(companyId))}` : "";
  return apiRequest<BillingPaymentMethodsResponse>({
    method: "DELETE",
    path: `/billing/payment-methods/${paymentMethodId}${qs}`,
    token: authToken(),
  });
}

export async function getPaymentLinkInfo(token: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1"}/billing/payment-link/${token}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new ApiRequestError(payload.message || "Invalid payment link.", response.status, payload.errors);
  }
  return payload as { data: PaymentLinkPayload };
}

export async function checkoutFromPaymentLink(token: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1"}/billing/payment-link/${token}/checkout`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new ApiRequestError(payload.message || "Unable to start checkout.", response.status, payload.errors);
  }
  return payload as { data: { checkout_url: string } };
}

export { ApiRequestError };
