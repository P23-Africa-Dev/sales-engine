'use client';

import { useMemo } from 'react';
import {
    getGoogleMapsPublicApiKey,
    getMapboxPublicToken,
} from '@/lib/config/public-env';
import { useMapProvider } from '@/hooks/use-map-provider';
import type { MapProvider } from '@/lib/map/provider';

export type MapProviderFallbackReason =
    | 'missing_google_api_key'
    | 'missing_mapbox_token'
    | null;

export type EffectiveMapProviderState = {
    requestedProvider: MapProvider;
    effectiveProvider: MapProvider;
    hasGoogleMapsApiKey: boolean;
    hasMapboxToken: boolean;
    fallbackReason: MapProviderFallbackReason;
};

export function useEffectiveMapProvider(): EffectiveMapProviderState {
    const requestedProvider = useMapProvider();
    const hasGoogleMapsApiKey = getGoogleMapsPublicApiKey().length > 0;
    const hasMapboxToken = getMapboxPublicToken().length > 0;

    return useMemo(() => {
        if (requestedProvider === 'google' && !hasGoogleMapsApiKey && hasMapboxToken) {
            return {
                requestedProvider,
                effectiveProvider: 'mapbox' as const,
                hasGoogleMapsApiKey,
                hasMapboxToken,
                fallbackReason: 'missing_google_api_key' as const,
            };
        }

        if (requestedProvider === 'mapbox' && !hasMapboxToken && hasGoogleMapsApiKey) {
            return {
                requestedProvider,
                effectiveProvider: 'google' as const,
                hasGoogleMapsApiKey,
                hasMapboxToken,
                fallbackReason: 'missing_mapbox_token' as const,
            };
        }

        return {
            requestedProvider,
            effectiveProvider: requestedProvider,
            hasGoogleMapsApiKey,
            hasMapboxToken,
            fallbackReason: null,
        };
    }, [requestedProvider, hasGoogleMapsApiKey, hasMapboxToken]);
}
