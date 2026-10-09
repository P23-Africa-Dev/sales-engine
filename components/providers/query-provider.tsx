"use client";

import { useAuthStore } from "@/store/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export default function QueryProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  const userId = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    // Reset data while preserving active observers so dependent queries restart
    // after user hydration, login, and logout.
    void queryClient.resetQueries();
  }, [queryClient, userId]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
