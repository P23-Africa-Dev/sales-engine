"use client";

import { useEffect } from "react";
import { fetchSalesEngineMe, SalesEngineAuthError } from "@/lib/api/sales-engine-native-auth";
import { clearSalesEngineSession } from "@/lib/sales-engine/session";
import { clearAuthSession, getAuthTokenFromDocument } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";

export default function AuthInitializer({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setUser, clearUser } = useAuthStore();

  useEffect(() => {
    const token = getAuthTokenFromDocument();
    if (!token) return;

    fetchSalesEngineMe(token)
      .then((user) => {
        setUser({
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: null,
          access_role: user.organization_role,
          active_company: null,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof SalesEngineAuthError && err.status === 401) {
          clearAuthSession();
          clearSalesEngineSession();
          clearUser();
        }
      });
  }, [clearUser, setUser]);

  return <>{children}</>;
}
