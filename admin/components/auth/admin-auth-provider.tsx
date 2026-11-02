"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  adminLogin,
  adminLogout,
  adminMe,
  getAdminToken,
  type PlatformAdmin,
  AdminApiError,
} from "@/lib/api/admin-client";

type AdminAuthContextValue = {
  admin: PlatformAdmin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

const PUBLIC_PATHS = new Set(["/login"]);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      setAdmin(null);
      return;
    }
    try {
      const data = await adminMe();
      setAdmin(data.admin);
    } catch (error) {
      if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) {
        setAdmin(null);
      } else {
        throw error;
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch {
        if (!cancelled) setAdmin(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.has(pathname ?? "");
    if (!admin && !isPublic) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/sales-engine")}`);
    } else if (admin && isPublic) {
      router.replace("/sales-engine");
    }
  }, [admin, loading, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await adminLogin(email, password);
    setAdmin(data.admin);
  }, []);

  const logout = useCallback(async () => {
    await adminLogout();
    setAdmin(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ admin, loading, login, logout, refresh }),
    [admin, loading, login, logout, refresh],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#041014] text-white/80">
        Loading admin session…
      </div>
    );
  }

  const isPublic = PUBLIC_PATHS.has(pathname ?? "");
  if (!admin && !isPublic) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#041014] text-white/80">
        Redirecting to login…
      </div>
    );
  }

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
