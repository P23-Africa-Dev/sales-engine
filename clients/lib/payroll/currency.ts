import {
    DEFAULT_FALLBACK_CURRENCY,
    FALLBACK_SUPPORTED_CURRENCIES,
} from "@/lib/constants/currencies";

export const PAYROLL_DEFAULT_CURRENCY = DEFAULT_FALLBACK_CURRENCY;

const FALLBACK_SUPPORTED_CODES = new Set(
    FALLBACK_SUPPORTED_CURRENCIES.map((item) => item.code)
);

function normalizeCurrency(currency?: string | null): string {
    const normalized = currency?.trim().toUpperCase();
    return normalized || PAYROLL_DEFAULT_CURRENCY;
}

export function resolvePayrollCurrency(preferredCurrency?: string | null): string {
    const normalized = normalizeCurrency(preferredCurrency);
    if (FALLBACK_SUPPORTED_CODES.has(normalized)) {
        return normalized;
    }

    if (/^[A-Z]{3}$/.test(normalized)) {
        return normalized;
    }

    return PAYROLL_DEFAULT_CURRENCY;
}

export function formatPayrollMoney(amount: number, currency?: string | null): string {
    const resolvedCurrency = PAYROLL_DEFAULT_CURRENCY;

    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: resolvedCurrency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Number.isFinite(amount) ? amount : 0);
    } catch {
        const formatted = (Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        return `${resolvedCurrency} ${formatted}`;
    }
}
