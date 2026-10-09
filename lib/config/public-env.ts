export const MAPBOX_PUBLIC_TOKEN_ENV = 'NEXT_PUBLIC_MAPBOX_TOKEN';
export const MAPBOX_ALLOWED_HOSTS_ENV = 'NEXT_PUBLIC_MAPBOX_ALLOWED_HOSTS';
export const GOOGLE_MAPS_PUBLIC_API_KEY_ENV = 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY';
export const GOOGLE_PLACES_API_KEY_ENV = 'GOOGLE_PLACES_API_KEY';
export const MAP_PROVIDER_ENV = 'NEXT_PUBLIC_MAP_PROVIDER';
export const TRACKING_WS_URL_ENV = 'NEXT_PUBLIC_TRACKING_WS_URL';

export function getMapboxPublicToken(): string {
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? '';
}

export function getGoogleMapsPublicApiKey(): string {
    return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
}

/**
 * Server-side key for the Places API proxy.
 *
 * Cost control: prefer a DEDICATED Places-only key (GOOGLE_PLACES_API_KEY) so
 * Places quotas/caps/billing stay isolated from the Maps-JS map toggle
 * (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY). Falls back to the public Maps key only for
 * local dev convenience.
 */
export function getGooglePlacesServerKey(): string {
    return (
        process.env.GOOGLE_PLACES_API_KEY?.trim() ||
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
        ''
    );
}

/**
 * True when a dedicated Places-only key is configured (recommended for prod).
 * When false, the proxy is sharing the Maps-JS key, so Places quota caps could
 * also affect the map toggle — set GOOGLE_PLACES_API_KEY to separate them.
 */
export function isGooglePlacesUsingDedicatedKey(): boolean {
    return (process.env.GOOGLE_PLACES_API_KEY?.trim().length ?? 0) > 0;
}

export function isGooglePlacesEnabled(): boolean {
    return getGooglePlacesServerKey().length > 0;
}

export function getDefaultMapProvider(): 'mapbox' | 'google' {
    const configured = process.env.NEXT_PUBLIC_MAP_PROVIDER?.trim().toLowerCase();

    if (configured === 'google') {
        return 'google';
    }

    return 'mapbox';
}

function resolveMapboxAllowedHosts(): Set<string> {
    const hosts = new Set<string>();
    const configured = process.env.NEXT_PUBLIC_MAPBOX_ALLOWED_HOSTS?.trim();

    if (configured) {
        for (const host of configured.split(',')) {
            const normalized = host.trim().toLowerCase();
            if (normalized) hosts.add(normalized);
        }
    }

    if (typeof window !== 'undefined' && window.location.hostname) {
        hosts.add(window.location.hostname.toLowerCase());
    }

    return hosts;
}

export function createMapboxTransformRequest(): (url: string) => { url: string } {
    const explicitHosts = resolveMapboxAllowedHosts();

    return (url: string): { url: string } => {
        if (!url || url.startsWith('mapbox://') || url.startsWith('data:') || url.startsWith('blob:')) {
            return { url };
        }

        if (!/^https?:\/\//i.test(url)) {
            return { url };
        }

        try {
            const parsed = new URL(url);
            const hostname = parsed.hostname.toLowerCase();
            const mapboxHost = hostname === 'mapbox.com' || hostname.endsWith('.mapbox.com');

            if (mapboxHost || explicitHosts.has(hostname)) {
                return { url };
            }

            // Block requests to unexpected hosts from Mapbox internals.
            return { url: 'data:,' };
        } catch {
            return { url };
        }
    };
}

export function getTrackingWebSocketUrl(): string {
    const configured = process.env.NEXT_PUBLIC_TRACKING_WS_URL?.trim();

    if (configured) {
        return configured;
    }

    if (typeof window === 'undefined') {
        return '';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    return `${protocol}//${window.location.host}/tracking-ws`;
}