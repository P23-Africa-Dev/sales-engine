'use client';

import { WifiOff, RefreshCcw } from 'lucide-react';
import { useTrackingStore } from '@/store/tracking';

/**
 * Small floating pill that surfaces the realtime tracking connection state.
 * Renders nothing while the socket is healthy; shows a reconnecting/offline
 * notice when live updates are degraded so failures are never silent.
 */
export function TrackingConnectionStatus({ className }: { className?: string }) {
    const wsStatus = useTrackingStore((s) => s.wsStatus);
    const degraded = wsStatus === 'connecting' || wsStatus === 'reconnecting' || wsStatus === 'error';

    if (!degraded) return null;

    const isError = wsStatus === 'error';
    const isConnecting = wsStatus === 'connecting';

    return (
        <div
            role="status"
            aria-live="polite"
            className={
                className ??
                'absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none'
            }
        >
            <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 shadow-lg backdrop-blur text-[12px] font-semibold ${
                    isError
                        ? 'bg-red-600/95 text-white'
                        : 'bg-amber-500/95 text-white'
                } ${isConnecting ? 'opacity-0 [animation:tracking-connecting-reveal_0s_linear_4s_forwards]' : ''}`}
            >
                {isError ? (
                    <WifiOff size={14} strokeWidth={2.5} />
                ) : (
                    <RefreshCcw size={14} strokeWidth={2.5} className="animate-spin" />
                )}
                {isError
                    ? 'Live tracking unavailable · retrying...'
                    : 'Reconnecting to live tracking...'}
            </div>
            {isConnecting ? (
                <style>{'@keyframes tracking-connecting-reveal { to { opacity: 1; } }'}</style>
            ) : null}
        </div>
    );
}
