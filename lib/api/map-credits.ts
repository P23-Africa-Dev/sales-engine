"use client";

import { apiRequest, ApiRequestError } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export type MapCreditSnapshot = {
  balance: number;
  balance_usd: number;
  plan_credits: number;
  topup_credits: number;
  allocation_credits: number;
  used_this_cycle: number;
  lifetime_consumed: number;
  lifetime_topped_up: number;
  credits_per_usd: number;
  low: boolean;
  low_threshold_percent: number;
  enforcement_enabled: boolean;
  metered: boolean;
  exhausted: boolean;
  plan_key: string | null;
  plan_label: string | null;
  period_start: string | null;
  period_end: string | null;
  last_reset_at: string | null;
};

export type MapCreditTransaction = {
  id: number;
  type: string;
  sku: string | null;
  credits: number;
  usd_amount: number;
  balance_after: number;
  source: string;
  created_at: string | null;
};

export type MapCreditTransactionsResponse = {
  items: MapCreditTransaction[];
  pagination: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};

function authToken(): string | undefined {
  return getAuthTokenFromDocument() ?? undefined;
}

function companyQuery(companyId?: number | string): string {
  return companyId != null ? `?company_id=${encodeURIComponent(String(companyId))}` : "";
}

export async function getMapCredits(companyId?: number | string) {
  return apiRequest<MapCreditSnapshot>({
    method: "GET",
    path: `/map-credits${companyQuery(companyId)}`,
    token: authToken(),
  });
}

export async function getMapCreditTransactions(
  companyId?: number | string,
  page = 1,
) {
  const params = new URLSearchParams({ page: String(page) });
  if (companyId != null) params.set("company_id", String(companyId));
  return apiRequest<MapCreditTransactionsResponse>({
    method: "GET",
    path: `/map-credits/transactions?${params.toString()}`,
    token: authToken(),
  });
}

export async function createCreditTopupCheckout(
  amountUsd: number,
  companyId?: number | string,
) {
  return apiRequest<{ checkout_url: string }>({
    method: "POST",
    path: "/map-credits/topup/checkout",
    token: authToken(),
    body: {
      amount_usd: amountUsd,
      ...(companyId != null ? { company_id: companyId } : {}),
    },
  });
}

export { ApiRequestError };
