import { getMapboxPublicToken } from "@/lib/config/public-env";

export type GeocodedCoordinates = {
    lat: number;
    lng: number;
};

export type GeocodedPlaceSuggestion = {
    name: string;
    address: string;
    lat: number;
    lng: number;
    bbox: [number, number, number, number] | null;
};

export async function searchPlacesWithMapbox(
    query: string,
    options?: { country?: string; token?: string; limit?: number }
): Promise<GeocodedPlaceSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
        return [];
    }

    const token = options?.token ?? getMapboxPublicToken();
    if (!token) {
        return [];
    }

    const country = options?.country;
    const countryParam = country ? `&country=${country}` : '';
    const limit = options?.limit ?? 5;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?access_token=${token}${countryParam}&limit=${limit}&types=country,region,place,locality,neighborhood,address,poi&autocomplete=true`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return [];
        }

        const payload = (await response.json()) as {
            features?: Array<{ text?: string; place_name?: string; center?: [number, number]; bbox?: number[] }>;
        };

        return (payload.features ?? [])
            .filter((f) => f.center && f.center.length === 2)
            .map((f) => ({
                name: f.text?.trim() || f.place_name?.split(",")[0]?.trim() || "Location",
                address: f.place_name?.trim() || "",
                lng: f.center![0],
                lat: f.center![1],
                bbox: Array.isArray(f.bbox) && f.bbox.length === 4
                    ? (f.bbox as [number, number, number, number])
                    : null,
            }));
    } catch {
        return [];
    }
}

export async function geocodeAddressWithMapbox(
    address: string,
    options?: { country?: string; token?: string }
): Promise<GeocodedCoordinates | null> {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
        return null;
    }

    const token = options?.token ?? getMapboxPublicToken();
    if (!token) {
        return null;
    }

    const country = options?.country;
    const countryParam = country ? `&country=${country}` : '';
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmedAddress)}.json?access_token=${token}${countryParam}&limit=1`;

    const response = await fetch(url);
    if (!response.ok) {
        return null;
    }

    const payload = (await response.json()) as {
        features?: Array<{ center?: [number, number] }>;
    };
    const feature = payload.features?.[0];

    if (!feature?.center || feature.center.length !== 2) {
        return null;
    }

    const [lng, lat] = feature.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    return { lat, lng };
}

export async function reverseGeocodeWithMapbox(
    lng: number,
    lat: number,
    options?: { token?: string }
): Promise<string | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    const token = options?.token ?? getMapboxPublicToken();
    if (!token) {
        return null;
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as {
            features?: Array<{ place_name?: string }>;
        };

        const placeName = payload.features?.[0]?.place_name;
        return placeName && placeName.trim() ? placeName.trim() : null;
    } catch {
        return null;
    }
}
