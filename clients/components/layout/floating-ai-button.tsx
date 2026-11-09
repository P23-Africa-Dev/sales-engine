"use client";

import { AIChat } from "@/components/dashboard/ai-chat";
import { ELY_OPEN_LABEL } from "@/lib/ely-brand";
import { X } from "lucide-react";
import { useRef, useState } from "react";

const BUTTON_SIZE = 64; // px — matches w-16 h-16

export function FloatingAIButton() {
  const [open, setOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  // null = use CSS default (bottom-right); set after first drag
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);

  function openChat() {
    setChatKey((k) => k + 1);
    setOpen(true);
  }

  function handlePointerDown(e: React.PointerEvent) {
    // Only primary button (left-click / touch)
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();

    const rect = btnRef.current!.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = rect.left;
    const originY = rect.top;
    let moved = false;

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      // 5 px threshold to distinguish click from drag
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - BUTTON_SIZE, originX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - BUTTON_SIZE, originY + dy)),
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) {
        // treat as a click
        open ? setOpen(false) : openChat();
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, bottom: "auto", right: "auto" }
    : { bottom: "2rem", right: "2rem" };

  return (
    <>
      {/* FAB */}
      <div
        ref={btnRef}
        className="fixed z-[9997] flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none"
        style={posStyle}
        onPointerDown={handlePointerDown}
      >
        {/* Glow rings */}
        {!open && (
          <>
            <span
              className="absolute w-32 h-32 rounded-full bg-purple-600/10 animate-ping"
              style={{ animationDuration: "3s" }}
            />
            <span
              className="absolute w-24 h-24 rounded-full bg-purple-600/15 animate-ping"
              style={{ animationDuration: "3s", animationDelay: "0.4s" }}
            />
            <span className="absolute w-20 h-20 rounded-full bg-purple-500/20" />
          </>
        )}

        <button
          aria-label={ELY_OPEN_LABEL}
          className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.6)] active:scale-95 transition-transform duration-200 pointer-events-none"
          style={{
            background: open
              ? "rgba(255,255,255,0.12)"
              : "linear-gradient(135deg, #9333ea 0%, #a855f7 40%, #c026d3 100%)",
          }}
          tabIndex={-1}
        >
          {open ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <span className="relative flex items-center justify-center">
              <svg
                width="29"
                height="29"
                viewBox="0 0 29 29"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M14.2311 18.0353L22.0189 25.823C22.3727 26.1768 22.5496 26.3537 22.7405 26.4483C23.1036 26.6283 23.5299 26.6283 23.8931 26.4483C24.0839 26.3537 24.2608 26.1768 24.6147 25.823C24.9685 25.4691 25.1454 25.2922 25.24 25.1014C25.42 24.7382 25.42 24.3119 25.24 23.9488C25.1454 23.7579 24.9685 23.581 24.6147 23.2272L16.827 15.4395L14.2311 12.8436C13.8773 12.4898 13.7004 12.3129 13.5095 12.2183C13.1464 12.0383 12.7201 12.0383 12.3569 12.2183C12.1661 12.3129 11.9892 12.4898 11.6353 12.8436C11.2815 13.1975 11.1045 13.3744 11.01 13.5652C10.83 13.9284 10.83 14.3547 11.01 14.7178C11.1045 14.9088 11.2815 15.0857 11.6353 15.4395L14.2311 18.0353ZM16.827 15.4395L14.2311 18.0353"
                  stroke="#FCFCFC"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M20.5423 2.41669L20.8985 3.37925C21.3656 4.64143 21.5991 5.27252 22.0595 5.7329C22.5199 6.19327 23.1509 6.4268 24.4131 6.89384L25.3757 7.25002L24.4131 7.6062C23.1509 8.07325 22.5199 8.30678 22.0595 8.76714C21.5991 9.22752 21.3656 9.85861 20.8985 11.1208L20.5423 12.0834L20.1861 11.1208C19.7191 9.85862 19.4855 9.22752 19.0251 8.76714C18.5648 8.30677 17.9338 8.07325 16.6715 7.6062L15.709 7.25002L16.6715 6.89384C17.9338 6.4268 18.5648 6.19327 19.0251 5.7329C19.4855 5.27252 19.7191 4.64143 20.1861 3.37925L20.5423 2.41669Z"
                  stroke="#FCFCFC"
                  strokeLinejoin="round"
                />
                <path
                  d="M7.25 4.83331L7.51714 5.55523C7.86742 6.50186 8.04257 6.97519 8.38785 7.32047C8.73312 7.66574 9.20645 7.84089 10.1531 8.19117L10.875 8.45831L10.1531 8.72545C9.20645 9.07573 8.73312 9.25088 8.38784 9.59616C8.04257 9.94143 7.86742 10.4148 7.51714 11.3614L7.25 12.0833L6.98286 11.3614C6.63258 10.4148 6.45743 9.94143 6.11215 9.59616C5.76688 9.25088 5.29355 9.07573 4.34692 8.72545L3.625 8.45831L4.34692 8.19117C5.29355 7.84089 5.76688 7.66574 6.11215 7.32046C6.45743 6.97519 6.63258 6.50186 6.98286 5.55523L7.25 4.83331Z"
                  stroke="#FCFCFC"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
        </button>
      </div>

      <AIChat key={chatKey} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
