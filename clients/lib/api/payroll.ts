"use client";

import { apiRequest, ApiEnvelope, API_BASE_URL, ApiRequestError } from "./onboarding";
import { formatPayrollMoney, resolvePayrollCurrency } from "@/lib/payroll/currency";
import { resolveAvatarSrc } from "@/lib/avatar";
import { getSupportAwareApiTransport } from "@/lib/auth/support-session";

export type PayrollSettings = {
  id: number;
  company_id: number | string;
  salary_type: "daily" | "monthly" | "weekly";
  base_salary: number;
  currency: string;
  work_days: number;
  work_hours: number;
  daily_pay: number;
  attendance_affects_pay: boolean;
  commission_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PayrollData = {
  payroll: PayrollSettings | null;
};

export type PayrollOverview = {
  date: string;
  today_present_agents: number;
  today_payroll_value: number;
  payroll_rise: boolean;
  payroll_fall: boolean;
  total_commission: number;
  pending_approval: number;
  total_agents: number;
  total_payroll: number;
  currency: string;
};

export type PayrollAgentListItem = {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  assigned_zone: string | null;
  role: string;
  status: "Approved" | "Pending" | "Revoked";
  base_salary: number;
  daily_pay: number;
  net_pay: number;
  attendance_days: number;
  currency: string;
  salary_type: "daily" | "monthly" | "weekly" | string;
  attendance_affects_pay: boolean;
};

export type PayrollAgentListResponse = {
  items: PayrollAgentListItem[];
  pagination: {
    current_page: number;
    last_page: number;
    next_page_url: string | null;
    prev_page_url: string | null;
    per_page: number;
    total: number;
  };
};

export type PayrollHistoryEntry = {
  id: number;
  month: string;
  period_year: number;
  period_month: number;
  base_salary: number;
  net_pay: number;
  due_date: string | null;
  status: "Pending" | "Approved" | "Revoked";
};

export type PayrollAgentProfile = {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  assigned_zone: string | null;
  role: string;
  status: "Approved" | "Pending" | "Revoked";
  salary_type: "daily" | "monthly" | "weekly" | string;
  base_salary: number;
  daily_pay: number;
  work_days: number;
  work_hours: number;
  attendance_affects_pay: boolean;
  commission_enabled: boolean;
  currency: string;
  attendance_days: number;
  salary_payable: number;
  history: PayrollHistoryEntry[];
};

export type UpdateAgentPayrollPayload = {
  company_id: number | string;
  base_salary?: number;
  salary_type?: "daily" | "monthly" | "weekly";
  currency_code?: string;
  attendance_affects_pay?: boolean;
  work_days_override?: number | null;
};

export type PayrollAgentListParams = {
  company_id?: number | string;
  search?: string;
  status?: "approved" | "pending" | "revoked";
  date?: string;
  year?: number;
  month?: number;
  per_page?: number;
  page?: number;
};

export type PayrollOverviewParams = {
  company_id?: number | string;
  date?: string;
};

export type PayrollAgentProfileParams = {
  company_id?: number | string;
  date?: string;
  year?: number;
  month?: number;
};

export type PayrollExportParams = {
  company_id: number | string;
  search?: string;
  role?: "agent";
  status?: "approved" | "pending" | "revoked";
  salary_type?: "daily" | "monthly" | "weekly";
  attendance_affects_pay?: boolean;
  attendance_min?: number;
  attendance_max?: number;
  date?: string;
  year?: number;
  month?: number;
  format: "csv" | "xlsx";
};

export function mapPayrollAgentToUi(agent: PayrollAgentListItem, currencyOverride?: string) {
  const displayCurrency = resolvePayrollCurrency(currencyOverride ?? agent.currency);

  return {
    id: String(agent.id),
    name: agent.name,
    address: agent.email,
    lga: agent.assigned_zone ?? "Unassigned",
    avatar: resolveAvatarSrc(agent.avatar_url),
    baseSalary: formatPayrollMoney(agent.base_salary, displayCurrency),
    netPay: formatPayrollMoney(agent.net_pay, displayCurrency),
    role: agent.role,
    status: agent.status,
    email: agent.email,
    currency: displayCurrency,
    salaryType: agent.salary_type,
    dailyPay: formatPayrollMoney(agent.daily_pay, displayCurrency),
    attendanceDays: agent.attendance_days,
    attendanceAffectsPay: agent.attendance_affects_pay,
    workDays: undefined,
    workHours: 0,
  };
}

export function mapPayrollProfileToUi(profile: PayrollAgentProfile, currencyOverride?: string) {
  const displayCurrency = resolvePayrollCurrency(currencyOverride ?? profile.currency);

  return {
    id: String(profile.id),
    name: profile.name,
    address: profile.email,
    lga: profile.assigned_zone ?? "Unassigned",
    avatar: resolveAvatarSrc(profile.avatar_url),
    baseSalary: formatPayrollMoney(profile.base_salary, displayCurrency),
    netPay: formatPayrollMoney(profile.salary_payable, displayCurrency),
    role: profile.role,
    status: profile.status,
    email: profile.email,
    currency: displayCurrency,
    salaryType: profile.salary_type,
    dailyPay: formatPayrollMoney(profile.daily_pay, displayCurrency),
    attendanceDays: profile.attendance_days,
    attendanceAffectsPay: profile.attendance_affects_pay,
    workDays: profile.work_days,
    workHours: profile.work_hours,
  };
}

export type CreatePayrollPayload = {
  company_id: number | string;
  salary_type: "daily" | "monthly" | "weekly";
  base_salary: number;
  work_days: number;
  work_hours: number;
  currency?: string;
  attendance_affects_pay?: boolean;
  commission_enabled?: boolean;
};

export type UpdatePayrollPayload = CreatePayrollPayload;

export function getPayroll(
  companyId: number | string,
  token: string
): Promise<ApiEnvelope<PayrollData>> {
  return apiRequest<PayrollData>({
    method: "GET",
    path: `/payroll?company_id=${companyId}`,
    token,
  });
}

export function createPayroll(
  payload: CreatePayrollPayload,
  token: string
): Promise<ApiEnvelope<PayrollData>> {
  return apiRequest<PayrollData>({
    method: "POST",
    path: "/payroll",
    body: payload,
    token,
  });
}

export function updatePayroll(
  id: number,
  payload: UpdatePayrollPayload,
  token: string
): Promise<ApiEnvelope<PayrollData>> {
  return apiRequest<PayrollData>({
    method: "PUT",
    path: `/payroll/${id}`,
    body: payload,
    token,
  });
}

export function getPayrollOverview(
  params: PayrollOverviewParams,
  token: string
): Promise<ApiEnvelope<PayrollOverview>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  return apiRequest<PayrollOverview>({
    method: "GET",
    path: `/payroll/overview${query.toString() ? `?${query.toString()}` : ""}`,
    token,
  });
}

export function getPayrollAgents(
  params: PayrollAgentListParams,
  token: string
): Promise<ApiEnvelope<PayrollAgentListResponse>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  return apiRequest<PayrollAgentListResponse>({
    method: "GET",
    path: `/payroll/agents${query.toString() ? `?${query.toString()}` : ""}`,
    token,
  });
}

export function getPayrollAgentProfile(
  userId: number | string,
  params: PayrollAgentProfileParams,
  token: string
): Promise<ApiEnvelope<PayrollAgentProfile>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  return apiRequest<PayrollAgentProfile>({
    method: "GET",
    path: `/payroll/agents/${userId}${query.toString() ? `?${query.toString()}` : ""}`,
    token,
  });
}

export function updatePayrollAgent(
  userId: number | string,
  payload: UpdateAgentPayrollPayload,
  token: string
): Promise<ApiEnvelope<PayrollAgentProfile>> {
  return apiRequest<PayrollAgentProfile>({
    method: "PATCH",
    path: `/payroll/agents/${userId}`,
    body: payload,
    token,
  });
}

export type ApprovalAction = "approve" | "revoke";

export type ApprovePayrollPayload = {
  company_id: number | string;
  action: ApprovalAction;
  reason?: string;
};

export function approvePayrollAgent(
  userId: number | string,
  payload: ApprovePayrollPayload,
  token: string
): Promise<ApiEnvelope<PayrollAgentProfile>> {
  return apiRequest<PayrollAgentProfile>({
    method: "PATCH",
    path: `/payroll/agents/${userId}/approval`,
    body: payload,
    token,
  });
}

export async function downloadPayrollExport(
  params: PayrollExportParams,
  token: string
): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const transport = getSupportAwareApiTransport(
    `/payroll/export?${query.toString()}`,
    token,
    API_BASE_URL,
  );
  const response = await fetch(transport.url, {
    method: "GET",
    headers: {
      ...transport.authorizationHeaders,
      Accept: "text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    let message = `Payroll export failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as ApiEnvelope<unknown>;
      message = payload.message || message;
      if (payload.errors) {
        throw new ApiRequestError(message, response.status, payload.errors);
      }
    } catch {
      // Fall through to generic error when response is not JSON.
    }

    throw new Error(message);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const utf8FilenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const filenameMatch = disposition.match(/filename="?([^\"]+)"?/i);
  const filename = utf8FilenameMatch?.[1]
    ? decodeURIComponent(utf8FilenameMatch[1])
    : (filenameMatch?.[1] ?? `payroll-export.${params.format === "xlsx" ? "xlsx" : "csv"}`);

  return {
    blob: await response.blob(),
    filename,
  };
}
