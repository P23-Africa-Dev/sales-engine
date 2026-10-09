export type ViewportGranularity = "gps" | "city" | "state" | "country" | "global";

export type ResolvedMapViewport = {
    center: [number, number];
    zoom: number;
    granularity: ViewportGranularity;
    countryCode: string | null;
};

const GLOBAL_VIEWPORT: ResolvedMapViewport = {
    center: [0, 20],
    zoom: 1.9,
    granularity: "global",
    countryCode: null,
};

const GPS_ZOOM = 15.2;
const CITY_ZOOM = 11.4;
const STATE_ZOOM = 7.4;

const COUNTRY_VIEWPORTS: Record<string, { center: [number, number]; zoom: number }> = {
    NG: { center: [8.6753, 9.082], zoom: 5.2 },
    GB: { center: [-3.4, 55.4], zoom: 5.2 },
    US: { center: [-98.58, 39.82], zoom: 3.6 },
    CA: { center: [-106.35, 56.13], zoom: 3.1 },
    IN: { center: [78.9629, 20.5937], zoom: 4.4 },
    AU: { center: [133.7751, -25.2744], zoom: 3.5 },
    ZA: { center: [22.9375, -30.5595], zoom: 4.7 },
    KE: { center: [37.9062, -0.0236], zoom: 5.6 },
    GH: { center: [-1.0232, 7.9465], zoom: 6.0 },
    FR: { center: [2.2137, 46.2276], zoom: 5.1 },
    DE: { center: [10.4515, 51.1657], zoom: 5.0 },
};

const TIMEZONE_TO_COUNTRY: Array<{ prefix: string; country: string }> = [
    { prefix: "Africa/Lagos", country: "NG" },
    { prefix: "Europe/London", country: "GB" },
    { prefix: "America/New_York", country: "US" },
    { prefix: "America/Chicago", country: "US" },
    { prefix: "America/Denver", country: "US" },
    { prefix: "America/Los_Angeles", country: "US" },
    { prefix: "Asia/Kolkata", country: "IN" },
    { prefix: "Africa/Nairobi", country: "KE" },
    { prefix: "Africa/Accra", country: "GH" },
    { prefix: "Africa/Johannesburg", country: "ZA" },
    { prefix: "Europe/Paris", country: "FR" },
    { prefix: "Europe/Berlin", country: "DE" },
    { prefix: "Australia/", country: "AU" },
    { prefix: "Canada/", country: "CA" },
];

let cachedViewport: ResolvedMapViewport | null = null;
let inFlightViewportPromise: Promise<ResolvedMapViewport> | null = null;

function normalizeCountryCode(input: string | null | undefined): string | null {
    if (!input) return null;
    const code = input.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
}

function extractCountryFromLocale(locale: string | null | undefined): string | null {
    if (!locale) return null;

    const text = locale.trim();
    if (!text) return null;

    if (typeof Intl !== "undefined" && "Locale" in Intl) {
        try {
            const region = new Intl.Locale(text).region;
            return normalizeCountryCode(region);
        } catch {
            // Fallback to regex parsing below.
        }
    }

    const match = text.match(/[-_]([A-Za-z]{2})\b/);
    return normalizeCountryCode(match?.[1] ?? null);
}

function inferCountryCodeFromTimezone(timeZone: string | null | undefined): string | null {
    if (!timeZone) return null;

    for (const entry of TIMEZONE_TO_COUNTRY) {
        if (timeZone.startsWith(entry.prefix)) {
            return entry.country;
        }
    }

    return null;
}

function detectCountryCodeFromBrowser(): string | null {
    if (typeof navigator === "undefined") {
        return null;
    }

    const fromLanguages = [
        ...(navigator.languages ?? []),
        navigator.language,
    ]
        .map((locale) => extractCountryFromLocale(locale))
        .find((code): code is string => code !== null);

    if (fromLanguages) {
        return fromLanguages;
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return inferCountryCodeFromTimezone(timeZone);
}

type IpGeoContext = {
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    state: string | null;
    countryCode: string | null;
};

function isFiniteNumber(input: unknown): input is number {
    return typeof input === "number" && Number.isFinite(input);
}

function normalizeCoordinatePair(latitude: unknown, longitude: unknown): [number, number] | null {
    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
        return null;
    }

    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return null;
    }

    return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
}

export function getCountryFallbackViewport(countryCode?: string | null): ResolvedMapViewport {
    const resolvedCountryCode = countryCode === undefined
        ? detectCountryCodeFromBrowser()
        : normalizeCountryCode(countryCode);

    if (resolvedCountryCode && COUNTRY_VIEWPORTS[resolvedCountryCode]) {
        const selected = COUNTRY_VIEWPORTS[resolvedCountryCode];
        return {
            center: selected.center,
            zoom: selected.zoom,
            granularity: "country",
            countryCode: resolvedCountryCode,
        };
    }

    return { ...GLOBAL_VIEWPORT };
}

function requestPreciseBrowserPosition(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            reject(new Error("Geolocation unavailable"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => reject(error),
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 60_000,
            }
        );
    });
}

async function requestIpGeoContext(): Promise<IpGeoContext | null> {
    try {
        const response = await fetch("https://ipapi.co/json/", {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as {
            latitude?: number;
            longitude?: number;
            city?: string;
            region?: string;
            country_code?: string;
        };

        return {
            latitude: isFiniteNumber(payload.latitude) ? payload.latitude : null,
            longitude: isFiniteNumber(payload.longitude) ? payload.longitude : null,
            city: payload.city?.trim() || null,
            state: payload.region?.trim() || null,
            countryCode: normalizeCountryCode(payload.country_code),
        };
    } catch {
        return null;
    }
}

function buildDynamicFallbackViewport(context: {
    center: [number, number] | null;
    city: string | null;
    state: string | null;
    countryCode: string | null;
}): ResolvedMapViewport {
    if (context.center && context.city) {
        return {
            center: context.center,
            zoom: CITY_ZOOM,
            granularity: "city",
            countryCode: context.countryCode,
        };
    }

    if (context.center && context.state) {
        return {
            center: context.center,
            zoom: STATE_ZOOM,
            granularity: "state",
            countryCode: context.countryCode,
        };
    }

    return getCountryFallbackViewport(context.countryCode);
}

export async function resolvePrivacySafeViewport(options?: { preferFreshGps?: boolean }): Promise<ResolvedMapViewport> {
    const preferFreshGps = options?.preferFreshGps === true;

    if (cachedViewport && (!preferFreshGps || cachedViewport.granularity === "gps")) {
        return cachedViewport;
    }

    if (inFlightViewportPromise) {
        return inFlightViewportPromise;
    }

    inFlightViewportPromise = (async () => {
        const detectedCountryCode = detectCountryCodeFromBrowser();

        try {
            const { latitude, longitude } = await requestPreciseBrowserPosition();
            const center = normalizeCoordinatePair(latitude, longitude);

            if (center !== null) {
                cachedViewport = {
                    center,
                    zoom: GPS_ZOOM,
                    granularity: "gps",
                    countryCode: detectedCountryCode,
                };

                return cachedViewport;
            }
        } catch {
            // Fallback to dynamic IP-based viewport resolution below.
        }

        try {
            const ipContext = await requestIpGeoContext();
            const center = normalizeCoordinatePair(ipContext?.latitude, ipContext?.longitude);

            cachedViewport = buildDynamicFallbackViewport({
                center,
                city: ipContext?.city ?? null,
                state: ipContext?.state ?? null,
                countryCode: ipContext?.countryCode ?? detectedCountryCode,
            });

            return cachedViewport;
        } catch {
            cachedViewport = getCountryFallbackViewport(detectedCountryCode);
            return cachedViewport;
        } finally {
            inFlightViewportPromise = null;
        }
    })();

    return inFlightViewportPromise;
}

export function resetViewportResolverCacheForTests(): void {
    cachedViewport = null;
    inFlightViewportPromise = null;
}
