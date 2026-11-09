"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { clearAuthSession } from "@/lib/auth/session";
import { isSupportSessionActiveInDocument } from "@/lib/auth/support-session";

const ADMIN_ROLES = ["owner", "admin", "supervisor"];

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const supportActive = isSupportSessionActiveInDocument();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user && !supportActive) {
      clearAuthSession();
      router.replace("/login");
      return;
    }
    if (!user) return;

    const role = user.active_company?.role;
    if (role && !ADMIN_ROLES.includes(role)) {
      router.replace("/agent/dashboard");
    }
  }, [user, hasHydrated, router, supportActive]);

  if (!hasHydrated) return null;
  if (!user) return null;
  if (supportActive) return <>{children}</>;
  const role = user.active_company?.role;
  if (role && !ADMIN_ROLES.includes(role)) return null;

  return <>{children}</>;
}
