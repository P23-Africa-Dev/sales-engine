"use client";

import { useQuery } from "@tanstack/react-query";
import {
    getFallbackSupportedCurrencies,
    getSupportedCurrencies,
    type SupportedCurrenciesData,
} from "@/lib/api/currencies";
import { DEFAULT_FALLBACK_CURRENCY } from "@/lib/constants/currencies";

export const CURRENCY_KEYS = {
    all: ["currencies"] as const,
};

const PRIORITY_CODES = ["USD", "GBP", "CAD"] as const;

function prioritizeCurrencies(data: SupportedCurrenciesData): SupportedCurrenciesData {
    const currencies = Array.isArray(data.currencies) ? data.currencies : [];
    const grouped = new Map(currencies.map((item) => [item.code.toUpperCase(), item]));

    const prioritized = PRIORITY_CODES
        .map((code) => grouped.get(code))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const remaining = currencies.filter((item) => !PRIORITY_CODES.includes(item.code.toUpperCase() as (typeof PRIORITY_CODES)[number]));
    const defaultCurrency = grouped.has(DEFAULT_FALLBACK_CURRENCY)
        ? DEFAULT_FALLBACK_CURRENCY
        : (prioritized[0]?.code ?? remaining[0]?.code ?? DEFAULT_FALLBACK_CURRENCY);

    return {
        currencies: [...prioritized, ...remaining],
        default_currency: defaultCurrency,
    };
}

export function useSupportedCurrencies() {
    return useQuery({
        queryKey: CURRENCY_KEYS.all,
        queryFn: async (): Promise<SupportedCurrenciesData> => {
            try {
                const res = await getSupportedCurrencies();
                return prioritizeCurrencies(res.data);
            } catch {
                return prioritizeCurrencies(getFallbackSupportedCurrencies());
            }
        },
        staleTime: 1000 * 60 * 10,
    });
}
