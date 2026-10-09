export type MapProvider = 'mapbox' | 'google';

export const MAP_PROVIDER_CHANGED_EVENT = 'factory23:map-provider-changed';

export const MAP_PROVIDER_STORAGE_KEY = 'factory23.map-provider';

export function normalizeMapProvider(input: unknown): MapProvider | null {
    const normalized = String(input ?? '').trim().toLowerCase();

    if (normalized === 'mapbox' || normalized === 'google') {
        return normalized;
    }

    return null;
}
