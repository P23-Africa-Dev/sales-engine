"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Handles Google OAuth return query params after a full-page connect redirect.
 */
export function useGoogleOAuthReturnToast(onHandled?: () => void) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const status = searchParams.get("google_oauth");
    if (!status) {
      return;
    }

    const message = searchParams.get("message")?.trim() ?? "";
    const handledKey = `${status}|${message}|${searchParams.get("gmail_enabled") ?? ""}|${searchParams.get("requires_gmail_reconnect") ?? ""}`;
    if (handledKeyRef.current === handledKey) {
      return;
    }
    handledKeyRef.current = handledKey;

    const displayMessage =
      message ||
      (status === "success"
        ? "Google Calendar connected successfully."
        : "Google Calendar connection failed. Please try again.");

    if (status === "success") {
      toast.success(displayMessage);
    } else {
      toast.error(displayMessage);
    }

    onHandled?.();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("google_oauth");
    nextParams.delete("message");
    nextParams.delete("gmail_enabled");
    nextParams.delete("requires_gmail_reconnect");
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname, onHandled]);
}
