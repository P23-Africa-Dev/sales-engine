export type SupportedCurrencyOption = {
    code: string;
    name: string;
    symbol: string;
    label: string;
};

export const FALLBACK_SUPPORTED_CURRENCIES: SupportedCurrencyOption[] = [
    { code: "USD", name: "US Dollar", symbol: "$", label: "USD - US Dollar" },
    { code: "GBP", name: "British Pound", symbol: "GBP", label: "GBP - British Pound" },
    { code: "CAD", name: "Canadian Dollar", symbol: "CA$", label: "CAD - Canadian Dollar" },
    { code: "NGN", name: "Nigerian Naira", symbol: "NGN", label: "NGN - Nigerian Naira" },
    { code: "EUR", name: "Euro", symbol: "EUR", label: "EUR - Euro" },
    { code: "AED", name: "UAE Dirham", symbol: "AED", label: "AED - UAE Dirham" },
    { code: "KES", name: "Kenyan Shilling", symbol: "KSh", label: "KES - Kenyan Shilling" },
    { code: "ZAR", name: "South African Rand", symbol: "R", label: "ZAR - South African Rand" },
    { code: "GHS", name: "Ghanaian Cedi", symbol: "GHS", label: "GHS - Ghanaian Cedi" },
];

export const DEFAULT_FALLBACK_CURRENCY = "USD";
