"use client";

import { useQuery } from "@tanstack/react-query";
import { getGeographyLgas, getGeographyStates } from "@/lib/api/geography";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export function useGeographyStates(countryCode?: string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ["geography", "states", countryCode],
    queryFn: async () => {
      const res = await getGeographyStates(countryCode!, token);
      return res.data;
    },
    enabled: !!countryCode && countryCode.length === 2,
    staleTime: 1000 * 60 * 60,
  });
}

export function useGeographyLgas(countryCode?: string, stateName?: string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: ["geography", "lgas", countryCode, stateName],
    queryFn: async () => {
      const res = await getGeographyLgas(countryCode!, stateName!, token);
      return res.data;
    },
    enabled: !!countryCode && !!stateName,
    staleTime: 1000 * 60 * 60,
  });
}
