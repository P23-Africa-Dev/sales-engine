"use client";

import { useEffect, useState } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

const LAST_AUTO_RETRY_KEY = "se:global-error:auto-retry-at";
/** One quiet automatic retry per this window, so a lasting problem can't loop. */
const AUTO_RETRY_WINDOW_MS = 30_000;

function shouldAutoRetry(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(LAST_AUTO_RETRY_KEY) ?? 0);
    if (Date.now() - last < AUTO_RETRY_WINDOW_MS) {
      return false;
    }
    window.sessionStorage.setItem(LAST_AUTO_RETRY_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/**
 * Last resort: sections and pages recover on their own first (see SafeSection and the
 * dashboard error.tsx). If something still reaches here, reload quietly once before
 * showing anything, and keep the message calm: the user's data and scans are fine.
 */
export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
  // Starts as "reloading" on both server and client (no hydration mismatch); the
  // effect then either retries quietly or shows the card.
  const [showCard, setShowCard] = useState(false);
  const autoRetrying = !showCard;

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (!shouldAutoRetry()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads sessionStorage, only available after mount
      setShowCard(true);
      return;
    }
    const timer = window.setTimeout(() => unstable_retry(), 800);

    return () => window.clearTimeout(timer);
  }, [unstable_retry]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-[#F8FAFA] px-6">
        {autoRetrying ? (
          <p role="status" className="text-sm text-[#7A7C80]">
            Reloading your workspace…
          </p>
        ) : (
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0px_1px_3px_1px_#00000026] text-center">
            <h1 className="text-xl font-bold text-[#34373C] mb-2">Let&apos;s reload your workspace</h1>
            <p className="text-sm text-[#7A7C80] mb-5">
              Your data is safe, and searches and scans keep running in the background. Reload to pick up where you left off.
            </p>
            <button
              onClick={() => {
                try {
                  window.sessionStorage.removeItem(LAST_AUTO_RETRY_KEY);
                } catch {
                  // Storage can be unavailable (private mode); reloading still works.
                }
                window.location.reload();
              }}
              className="w-full h-[46px] rounded-full bg-[#6FA8A6] text-white text-sm font-medium hover:bg-[#5e9795] transition-colors"
            >
              Reload
            </button>
          </div>
        )}
      </body>
    </html>
  );
}
