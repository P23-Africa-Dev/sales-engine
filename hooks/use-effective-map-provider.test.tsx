import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEffectiveMapProvider } from '@/hooks/use-effective-map-provider';

const {
    useMapProviderMock,
    getGoogleMapsPublicApiKeyMock,
    getMapboxPublicTokenMock,
} = vi.hoisted(() => ({
    useMapProviderMock: vi.fn(() => 'mapbox' as const),
    getGoogleMapsPublicApiKeyMock: vi.fn(() => ''),
    getMapboxPublicTokenMock: vi.fn(() => ''),
}));

vi.mock('@/hooks/use-map-provider', () => ({
    useMapProvider: useMapProviderMock,
}));

vi.mock('@/lib/config/public-env', () => ({
    getGoogleMapsPublicApiKey: getGoogleMapsPublicApiKeyMock,
    getMapboxPublicToken: getMapboxPublicTokenMock,
}));

describe('useEffectiveMapProvider', () => {
    it('falls back to mapbox when google is requested but key is missing', () => {
        useMapProviderMock.mockReturnValue('google');
        getGoogleMapsPublicApiKeyMock.mockReturnValue('');
        getMapboxPublicTokenMock.mockReturnValue('pk.mapbox');

        const { result } = renderHook(() => useEffectiveMapProvider());

        expect(result.current.requestedProvider).toBe('google');
        expect(result.current.effectiveProvider).toBe('mapbox');
        expect(result.current.fallbackReason).toBe('missing_google_api_key');
    });

    it('falls back to google when mapbox is requested but token is missing', () => {
        useMapProviderMock.mockReturnValue('mapbox');
        getGoogleMapsPublicApiKeyMock.mockReturnValue('google-key');
        getMapboxPublicTokenMock.mockReturnValue('');

        const { result } = renderHook(() => useEffectiveMapProvider());

        expect(result.current.requestedProvider).toBe('mapbox');
        expect(result.current.effectiveProvider).toBe('google');
        expect(result.current.fallbackReason).toBe('missing_mapbox_token');
    });

    it('does not fallback when requested provider is configured', () => {
        useMapProviderMock.mockReturnValue('google');
        getGoogleMapsPublicApiKeyMock.mockReturnValue('google-key');
        getMapboxPublicTokenMock.mockReturnValue('pk.mapbox');

        const { result } = renderHook(() => useEffectiveMapProvider());

        expect(result.current.requestedProvider).toBe('google');
        expect(result.current.effectiveProvider).toBe('google');
        expect(result.current.fallbackReason).toBeNull();
    });
});
