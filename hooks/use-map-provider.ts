'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api/onboarding';
import { getDefaultMapProvider } from '@/lib/config/public-env';
import {
    MAP_PROVIDER_CHANGED_EVENT,
    MAP_PROVIDER_STORAGE_KEY,
    normalizeMapProvider,
    type MapProvider,
} from '@/lib/map/provider';

const POLL_INTERVAL_MS = 5_000;

function applyProvider(provider: MapProvider): void {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, provider);
    window.dispatchEvent(new CustomEvent(MAP_PROVIDER_CHANGED_EVENT, { detail: { provider } }));
}

async function fetchProviderFromApi(signal?: AbortSignal): Promise<MapProvider | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/map/provider`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            cache: 'no-store',
            signal,
        });

        if (!response.ok) {
            return null;
        }

        const payload = await response.json() as {
            data?: { provider?: unknown };
        };

        return normalizeMapProvider(payload?.data?.provider);
    } catch {
        return null;
    }
}

export function useMapProvider(): MapProvider {
    const [provider, setProvider] = useState<MapProvider>(() => {
        if (typeof window === 'undefined') {
            return getDefaultMapProvider();
        }

        const cached = normalizeMapProvider(window.localStorage.getItem(MAP_PROVIDER_STORAGE_KEY));
        return cached ?? getDefaultMapProvider();
    });

    useEffect(() => {
        let cancelled = false;
        let activeRequest: AbortController | null = null;

        const sync = async () => {
            activeRequest?.abort();
            activeRequest = new AbortController();

            const apiProvider = await fetchProviderFromApi(activeRequest.signal);
            if (!apiProvider || cancelled) {
                return;
            }

            setProvider((previous) => {
                if (previous === apiProvider) {
                    return previous;
                }

                applyProvider(apiProvider);
                return apiProvider;
            });
        };

        void sync();
        const intervalId = window.setInterval(() => {
            void sync();
        }, POLL_INTERVAL_MS);

        const onVisibility = () => {
            if (!document.hidden) {
                void sync();
            }
        };

        const onFocus = () => {
            void sync();
        };

        const onStorage = (event: StorageEvent) => {
            if (event.key !== MAP_PROVIDER_STORAGE_KEY) return;
            const normalized = normalizeMapProvider(event.newValue);
            if (!normalized) return;
            setProvider(normalized);
        };

        const onCustom = (event: Event) => {
            const detail = (event as CustomEvent<{ provider?: unknown }>).detail;
            const normalized = normalizeMapProvider(detail?.provider);
            if (!normalized) return;
            setProvider(normalized);
        };

        window.addEventListener('storage', onStorage);
        window.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onFocus);
        window.addEventListener(MAP_PROVIDER_CHANGED_EVENT, onCustom as EventListener);

        return () => {
            cancelled = true;
            activeRequest?.abort();
            window.clearInterval(intervalId);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener(MAP_PROVIDER_CHANGED_EVENT, onCustom as EventListener);
        };
    }, []);

    return provider;
}
