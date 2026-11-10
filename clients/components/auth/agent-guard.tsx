"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { clearAuthSession } from "@/lib/auth/session";
import { isSupportSessionActiveInDocument } from "@/lib/auth/support-session";

export function AgentGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const supportActive = isSupportSessionActiveInDocument();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user && !supportActive) {
      // Also clear the cookie so the login page server doesn't bounce back here.
      clearAuthSession();
      router.replace("/agent/login");
      return;
    }
    if (!user) return;

    if (!supportActive && user.active_company?.role !== "agent") {
      router.replace("/dashboard");
    }
  }, [user, hasHydrated, router, supportActive]);

  if (!hasHydrated) return null;
  if (!user) return null;
  if (supportActive) return <>{children}</>;
  if (user.active_company?.role !== "agent") return null;

  return <>{children}</>;
}
