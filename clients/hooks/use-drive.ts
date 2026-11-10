"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import {
  createDriveFolder,
  deleteDriveFile,
  downloadDriveFile,
  getDriveFile,
  getDriveFiles,
  getDriveFolders,
  getDriveUsage,
  syncDriveFileGrants,
  uploadDriveFile,
  type DriveFile,
} from "@/lib/api/drive";
import { toast } from "sonner";

export const DRIVE_KEYS = {
  all: ["drive"] as const,
  usage: (companyId?: number | string) => ["drive", "usage", companyId] as const,
  folders: (companyId?: number | string, parentId?: number | null) =>
    ["drive", "folders", companyId, parentId ?? "root"] as const,
  files: (params: Record<string, unknown>) => ["drive", "files", params] as const,
  file: (fileId: number, companyId?: number | string) => ["drive", "file", fileId, companyId] as const,
};

export function useDriveUsage(companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: DRIVE_KEYS.usage(companyId),
    queryFn: async () => {
      const res = await getDriveUsage(token, companyId);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && companyId != null,
  });
}

export function useDriveFolders(companyId?: number | string, parentId?: number | null) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: DRIVE_KEYS.folders(companyId, parentId),
    queryFn: async () => {
      const res = await getDriveFolders(token, companyId, parentId);
      return res.data.items;
    },
    enabled: hasActiveApiSession(token) && companyId != null,
  });
}

export function useDriveFiles(params: {
  company_id?: number | string;
  folder_id?: number;
  search?: string;
  page?: number;
  per_page?: number;
}) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: DRIVE_KEYS.files(params),
    queryFn: async () => {
      const res = await getDriveFiles(token, params);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && params.company_id != null,
  });
}

export function useDriveFile(fileId?: number, companyId?: number | string) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useQuery({
    queryKey: DRIVE_KEYS.file(fileId ?? 0, companyId),
    queryFn: async () => {
      const res = await getDriveFile(token, fileId as number, companyId);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && !!fileId && companyId != null,
  });
}

export function useCreateDriveFolder() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: { company_id?: number | string; name: string; parent_id?: number | null }) =>
      createDriveFolder(token, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DRIVE_KEYS.all });
      toast.success("Folder created.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUploadDriveFile() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: {
      company_id?: number | string;
      folder_id: number;
      file: File;
      share_with_all?: boolean;
      user_ids?: number[];
    }) => uploadDriveFile(token, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DRIVE_KEYS.all });
      toast.success("File uploaded.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSyncDriveGrants() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: {
      fileId: number;
      company_id?: number | string;
      share_with_all?: boolean;
      user_ids?: number[];
    }) =>
      syncDriveFileGrants(token, payload.fileId, {
        company_id: payload.company_id,
        share_with_all: payload.share_with_all,
        user_ids: payload.user_ids,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DRIVE_KEYS.all });
      toast.success("Sharing updated.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteDriveFile() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: { fileId: number; company_id?: number | string }) =>
      deleteDriveFile(token, payload.fileId, payload.company_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DRIVE_KEYS.all });
      toast.success("File deleted.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDownloadDriveFile() {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: { fileId: number; company_id?: number | string; filename?: string }) =>
      downloadDriveFile(token, payload.fileId, payload.company_id, payload.filename),
    onError: (err: Error) => toast.error(err.message),
  });
}

export type { DriveFile };
