import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ActiveCompany } from "@/lib/api/onboarding";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  user_type?: string;
  access_role?: string;
  active_company: ActiveCompany | null;
};

type AuthState = {
  user: AuthUser | null;
  _hasHydrated: boolean;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
  setHasHydrated: (v: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      _hasHydrated: false,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: "factory_auth_user",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
