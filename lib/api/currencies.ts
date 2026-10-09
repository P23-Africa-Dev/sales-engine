"use client";

import { apiRequest, type ApiEnvelope } from "@/lib/api/onboarding";
import {
    DEFAULT_FALLBACK_CURRENCY,
    FALLBACK_SUPPORTED_CURRENCIES,
    type SupportedCurrencyOption,
} from "@/lib/constants/currencies";

export type SupportedCurrenciesData = {
    currencies: SupportedCurrencyOption[];
    default_currency: string;
};

export function getSupportedCurrencies(): Promise<ApiEnvelope<SupportedCurrenciesData>> {
    return apiRequest<SupportedCurrenciesData>({
        method: "GET",
        path: "/currencies",
    });
}

export function getFallbackSupportedCurrencies(): SupportedCurrenciesData {
    return {
        currencies: FALLBACK_SUPPORTED_CURRENCIES,
        default_currency: DEFAULT_FALLBACK_CURRENCY,
    };
}
