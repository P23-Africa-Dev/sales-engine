"use client";

import { apiRequest, ApiEnvelope } from "./onboarding";

export type CountryOption = {
  label: string;
  value: string;
  code?: string;
};

export type GeographyStatesResponse = {
  country_code: string;
  supported: boolean;
  states: string[];
};

export type GeographyLgasResponse = {
  country_code: string;
  state_name: string;
  supported: boolean;
  lgas: string[];
};

export function getGeographyStates(
  countryCode: string,
  token?: string,
): Promise<ApiEnvelope<GeographyStatesResponse>> {
  const query = `?country_code=${encodeURIComponent(countryCode)}`;

  return apiRequest<GeographyStatesResponse>({
    method: "GET",
    path: `/geography/states${query}`,
    token,
  });
}

export function getGeographyLgas(
  countryCode: string,
  stateName: string,
  token?: string,
): Promise<ApiEnvelope<GeographyLgasResponse>> {
  const query = `?country_code=${encodeURIComponent(countryCode)}&state_name=${encodeURIComponent(stateName)}`;

  return apiRequest<GeographyLgasResponse>({
    method: "GET",
    path: `/geography/lgas${query}`,
    token,
  });
}
