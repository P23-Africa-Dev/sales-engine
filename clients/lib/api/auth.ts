import { apiRequest, ApiEnvelope, type MeResponse } from "./onboarding";

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginUser = MeResponse;

export type LoginResponseData = {
  token: string;
  token_type: "Bearer";
  dashboard_path?: string;
  user_type: "self-serve" | "enterprise" | "admin" | "supervisor" | "agent";
  access_role: "admin" | "supervisor" | "agent";
  internal_role: "admin" | "supervisor" | null;
  user: LoginUser;
};

export type ForgotPasswordPayload = {
  email: string;
  portal?: "management" | "agent";
};

export type ForgotPasswordResponseData = null;

export function forgotPassword(
  payload: ForgotPasswordPayload
): Promise<ApiEnvelope<ForgotPasswordResponseData>> {
  return apiRequest<ForgotPasswordResponseData>({
    method: "POST",
    path: "/auth/forgot-password",
    body: payload,
  });
}

export type ResetPasswordPayload = {
  email: string;
  token: string;
  password: string;
  password_confirmation: string;
  portal?: "management" | "agent";
};

export type ValidateResetTokenResponseData = {
  valid: boolean;
};

export function validateResetPasswordToken(
  token: string,
  params: { email: string; portal?: "management" | "agent" }
): Promise<ApiEnvelope<ValidateResetTokenResponseData>> {
  const qs = new URLSearchParams();
  qs.set("email", params.email);
  if (params.portal) {
    qs.set("portal", params.portal);
  }

  return apiRequest<ValidateResetTokenResponseData>({
    method: "GET",
    path: `/auth/reset-password/${encodeURIComponent(token)}?${qs.toString()}`,
  });
}

export function resetPassword(
  payload: ResetPasswordPayload
): Promise<ApiEnvelope<{ redirect_path: string }>> {
  return apiRequest<{ redirect_path: string }>({
    method: "POST",
    path: "/auth/reset-password",
    body: payload,
  });
}

export function logout(token: string): Promise<ApiEnvelope<null>> {
  return apiRequest<null>({
    method: "POST",
    path: "/auth/logout",
    token,
  });
}

export function loginUser(
  payload: LoginPayload
): Promise<ApiEnvelope<LoginResponseData>> {
  return apiRequest<LoginResponseData>({
    method: "POST",
    path: "/auth/login",
    body: payload,
  });
}

export type AgentLoginResponseData = {
  token: string;
  token_type: "Bearer";
  dashboard_path?: string;
  internal_role: "agent";
  access_role: "agent";
  user: LoginUser;
};

export function loginAgent(
  payload: LoginPayload
): Promise<ApiEnvelope<AgentLoginResponseData>> {
  return apiRequest<AgentLoginResponseData>({
    method: "POST",
    path: "/agent/login",
    body: payload,
  });
}
