"use client";

import { apiRequest } from "@/lib/api/onboarding";

export type TeamSizeRange = "2-10" | "11-50" | "51-200" | "201-500" | "501+";

export type DemoRequestPayload = {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  country: string;
  team_size: TeamSizeRange;
  use_case: string;
  scheduled_date?: string;
  scheduled_time?: string;
};

export type DemoRequestResponse = {
  id: number;
};

export type CountryOption = {
  label: string;
  value: string;
  code?: string;
};

export function submitDemoRequest(payload: DemoRequestPayload) {
  return apiRequest<DemoRequestResponse>({
    method: "POST",
    path: "/enterprise/demo-requests",
    body: payload,
  });
}

type CountriesResponse = {
  countries: CountryOption[];
};

export async function getCountries() {
  const response = await apiRequest<CountriesResponse>({
    method: "GET",
    path: "/countries",
  });

  return response.data.countries;
}

export type SetupInfoResponse = {
  request_id: number;
  email: string;
  company_id: string;
  company_name: string;
};

export function getSetupInfo(requestId: number, token: string) {
  const query = new URLSearchParams({
    request_id: String(requestId),
    token,
  }).toString();

  return apiRequest<SetupInfoResponse>({
    method: "GET",
    path: `/enterprise/onboarding/setup-info?${query}`,
  });
}

export type CompleteEnterpriseSetupPayload = {
  request_id: number;
  token: string;
  company_id: string;
  password: string;
  password_confirmation: string;
};

export type CompleteEnterpriseSetupResponse = {
  token: string;
  token_type: "Bearer";
  user: {
    id: number;
    name?: string;
    email: string;
    user_type: string;
    access_role?: string;
  };
};

export function completeEnterpriseSetup(payload: CompleteEnterpriseSetupPayload) {
  return apiRequest<CompleteEnterpriseSetupResponse>({
    method: "POST",
    path: "/enterprise/onboarding/complete",
    body: payload,
  });
}
