'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';

interface CalendarTooltipProps {
    /** The message to display inside the tooltip bubble */
    message: string;
    /** The trigger element (button, icon, etc.) */
    children: ReactNode;
    /** Which side of the trigger to display the tooltip. Defaults to 'top' */
    side?: 'top' | 'left';
}

/**
 * Styled tooltip that shows on hover (desktop) and click/tap (mobile).
 * Designed specifically for the "calendar not connected" disabled button UX.
 */
export function CalendarTooltip({ message, children, side = 'top' }: CalendarTooltipProps) {
    const [visible, setVisible] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside (for the click-to-show mobile behaviour)
    useEffect(() => {
        if (!visible) return;
        const handler = (e: MouseEvent | TouchEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setVisible(false);
            }
        };
        document.addEventListener('mousedown', handler);
        document.addEventListener('touchstart', handler);
        return () => {
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('touchstart', handler);
        };
    }, [visible]);

    const isTop = side === 'top';

    return (
        <div
            ref={containerRef}
            className="relative inline-block"
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            onClick={() => setVisible((v) => !v)}
        >
            {children}

            {/* Tooltip bubble */}
            <div
                role="tooltip"
                className={[
                    // Layout & size
                    'pointer-events-none absolute z-[9999] w-56',
                    // Positioning
                    isTop
                        ? 'bottom-[calc(100%+10px)] right-0'
                        : 'right-[calc(100%+10px)] top-1/2 -translate-y-1/2',
                    // Visual style
                    'rounded-xl bg-[#0B2B38] px-3.5 py-2.5 shadow-2xl ring-1 ring-white/10',
                    // Transition
                    'transition-all duration-200',
                    visible ? 'opacity-100 translate-y-0 scale-100' : isTop ? 'opacity-0 translate-y-1.5 scale-95' : 'opacity-0 translate-x-1.5 scale-95',
                ].join(' ')}
            >
                {/* Icon + text row */}
                <div className="flex items-start gap-2">
                    {/* Calendar lock icon */}
                    <span className="mt-0.5 shrink-0 text-amber-400">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                            <rect x="9" y="14" width="6" height="5" rx="1" />
                        </svg>
                    </span>
                    <p className="text-[11px] leading-relaxed text-white/90">{message}</p>
                </div>

                {/* Arrow */}
                {isTop ? (
                    // Arrow pointing down (tooltip is above the button)
                    <span className="absolute -bottom-[5px] right-[14px] h-0 w-0 border-x-[5px] border-t-[5px] border-x-transparent border-t-[#0B2B38]" />
                ) : (
                    // Arrow pointing right (tooltip is to the left of the button)
                    <span className="absolute -right-[5px] top-1/2 -translate-y-1/2 h-0 w-0 border-y-[5px] border-l-[5px] border-y-transparent border-l-[#0B2B38]" />
                )}
            </div>
        </div>
    );
}
