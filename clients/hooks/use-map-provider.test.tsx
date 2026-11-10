import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMapProvider } from '@/hooks/use-map-provider';
import {
    MAP_PROVIDER_CHANGED_EVENT,
    MAP_PROVIDER_STORAGE_KEY,
} from '@/lib/map/provider';

describe('useMapProvider', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.NEXT_PUBLIC_MAP_PROVIDER;
        process.env.NEXT_PUBLIC_MAP_PROVIDER = 'mapbox';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('hydrates from localStorage before remote sync', async () => {
        window.localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, 'google');

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
            })
        );

        const { result } = renderHook(() => useMapProvider());

        await waitFor(() => {
            expect(result.current).toBe('google');
        });
    });

    it('syncs provider from API and persists to storage', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: {
                        provider: 'google',
                    },
                }),
            })
        );

        const { result } = renderHook(() => useMapProvider());

        await waitFor(() => {
            expect(result.current).toBe('google');
        });

        expect(window.localStorage.getItem(MAP_PROVIDER_STORAGE_KEY)).toBe('google');
    });

    it('reacts to provider change custom event', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
            })
        );

        const { result } = renderHook(() => useMapProvider());

        await waitFor(() => {
            expect(result.current).toBe('mapbox');
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(MAP_PROVIDER_CHANGED_EVENT, {
                    detail: {
                        provider: 'google',
                    },
                })
            );
        });

        expect(result.current).toBe('google');
    });

    it('reacts to provider storage updates from other tabs', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
            })
        );

        const { result } = renderHook(() => useMapProvider());

        await waitFor(() => {
            expect(result.current).toBe('mapbox');
        });

        act(() => {
            window.dispatchEvent(
                new StorageEvent('storage', {
                    key: MAP_PROVIDER_STORAGE_KEY,
                    newValue: 'google',
                })
            );
        });

        expect(result.current).toBe('google');
    });
});
