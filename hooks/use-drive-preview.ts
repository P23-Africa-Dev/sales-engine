"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { fetchDriveFileBlob } from "@/lib/api/drive";

export const DRIVE_PREVIEW_KEYS = {
  blob: (fileId: number, companyId?: number | string) => ["drive", "preview-blob", fileId, companyId] as const,
};

export function useDriveFileBlobUrl(fileId?: number, companyId?: number | string, enabled = true) {
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  const query = useQuery({
    queryKey: DRIVE_PREVIEW_KEYS.blob(fileId ?? 0, companyId),
    queryFn: async () => fetchDriveFileBlob(token, fileId as number, companyId),
    enabled: hasActiveApiSession(token) && !!fileId && companyId != null && enabled,
    staleTime: 1000 * 60 * 5,
  });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear object URL when preview data unloads
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(query.data);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [query.data]);

  return {
    blobUrl: objectUrl,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
