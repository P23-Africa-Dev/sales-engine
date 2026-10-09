"use client";

import { apiRequest, ApiEnvelope, API_BASE_URL, ApiRequestError } from "./onboarding";
import { getSupportAwareApiTransport } from "@/lib/auth/support-session";

export type DriveFolder = {
  id: number;
  company_id: number;
  parent_id: number | null;
  name: string;
  is_system: boolean;
  system_key: string | null;
  created_at: string | null;
};

export type DriveFileGrant = {
  grantee_type: "user" | "all";
  user_id: number | null;
};

export type DriveFile = {
  id: number;
  company_id: number;
  folder_id: number;
  folder: DriveFolder | null;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  source: string;
  ely_report_id: string | null;
  uploaded_by_user_id: number | null;
  can_manage: boolean;
  grants: DriveFileGrant[];
  created_at: string | null;
};

export type DriveUsage = {
  used_bytes: number;
  limit_bytes: number;
  remaining_bytes: number;
  percent: number;
};

export type DriveFilesResponse = {
  items: DriveFile[];
  pagination: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
};

function companyQuery(companyId?: number | string) {
  return companyId != null ? `company_id=${companyId}` : "";
}

export async function getDriveUsage(token: string, companyId?: number | string) {
  const q = companyQuery(companyId);
  return apiRequest<DriveUsage>({ method: "GET", path: `/drive/usage${q ? `?${q}` : ""}`, token });
}

export async function getDriveFolders(token: string, companyId?: number | string, parentId?: number | null) {
  const params = new URLSearchParams();
  if (companyId != null) params.set("company_id", String(companyId));
  if (parentId != null) params.set("parent_id", String(parentId));
  const qs = params.toString();
  return apiRequest<{ items: DriveFolder[] }>({
    method: "GET",
    path: `/drive/folders${qs ? `?${qs}` : ""}`,
    token,
  });
}

export async function createDriveFolder(
  token: string,
  payload: { company_id?: number | string; name: string; parent_id?: number | null },
) {
  return apiRequest<DriveFolder>({ method: "POST", path: "/drive/folders", body: payload, token });
}

export async function getDriveFiles(
  token: string,
  params: {
    company_id?: number | string;
    folder_id?: number;
    search?: string;
    page?: number;
    per_page?: number;
  },
) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") qs.set(key, String(value));
  });
  return apiRequest<DriveFilesResponse>({
    method: "GET",
    path: `/drive/files?${qs.toString()}`,
    token,
  });
}

export async function getDriveFile(token: string, fileId: number, companyId?: number | string) {
  const q = companyQuery(companyId);
  return apiRequest<DriveFile>({
    method: "GET",
    path: `/drive/files/${fileId}${q ? `?${q}` : ""}`,
    token,
  });
}

export async function uploadDriveFile(
  token: string,
  payload: {
    company_id?: number | string;
    folder_id: number;
    file: File;
    share_with_all?: boolean;
    user_ids?: number[];
  },
): Promise<ApiEnvelope<DriveFile>> {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("folder_id", String(payload.folder_id));
  if (payload.company_id != null) formData.append("company_id", String(payload.company_id));
  if (payload.share_with_all) formData.append("share_with_all", "1");
  payload.user_ids?.forEach((id) => formData.append("user_ids[]", String(id)));

  const transport = getSupportAwareApiTransport("/drive/files", token, API_BASE_URL);
  const response = await fetch(transport.url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...transport.authorizationHeaders,
    },
    body: formData,
  });

  const json = (await response.json()) as ApiEnvelope<DriveFile>;
  if (!response.ok || !json.success) {
    throw new ApiRequestError(json.message || "Upload failed", response.status, json.errors);
  }

  return json;
}

export async function syncDriveFileGrants(
  token: string,
  fileId: number,
  payload: { company_id?: number | string; share_with_all?: boolean; user_ids?: number[] },
) {
  return apiRequest<DriveFile>({
    method: "PUT",
    path: `/drive/files/${fileId}/grants`,
    body: payload,
    token,
  });
}

export async function deleteDriveFile(token: string, fileId: number, companyId?: number | string) {
  const q = companyQuery(companyId);
  return apiRequest<null>({
    method: "DELETE",
    path: `/drive/files/${fileId}${q ? `?${q}` : ""}`,
    token,
  });
}

export async function fetchDriveFileBlob(
  token: string,
  fileId: number,
  companyId?: number | string,
): Promise<Blob> {
  const q = companyQuery(companyId);
  const transport = getSupportAwareApiTransport(
    `/drive/files/${fileId}/download${q ? `?${q}` : ""}`,
    token,
    API_BASE_URL,
  );
  const response = await fetch(transport.url, {
    headers: {
      ...transport.authorizationHeaders,
    },
  });

  if (!response.ok) {
    throw new ApiRequestError("Unable to load file preview", response.status, null);
  }

  return response.blob();
}

export async function downloadDriveFile(
  token: string,
  fileId: number,
  companyId?: number | string,
  filename?: string,
) {
  const blob = await fetchDriveFileBlob(token, fileId, companyId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function formatDriveBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
