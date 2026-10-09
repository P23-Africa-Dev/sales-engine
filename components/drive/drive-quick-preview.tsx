"use client";

import { Eye, FileText, Loader2 } from "lucide-react";
import type { DriveFile } from "@/lib/api/drive";
import { formatDriveBytes } from "@/lib/api/drive";
import { canPreviewDriveFile, canThumbnailDriveFile, getDrivePreviewKind } from "@/lib/drive-preview";
import { useDriveFileBlobUrl } from "@/hooks/use-drive-preview";
import { DrivePreviewContent } from "./drive-preview-content";

type DriveQuickPreviewProps = {
  file: DriveFile;
  companyId: number | string;
  onOpenFullPreview: () => void;
};

export function DriveQuickPreview({ file, companyId, onOpenFullPreview }: DriveQuickPreviewProps) {
  const thumbnailable = canThumbnailDriveFile(file);
  const previewable = canPreviewDriveFile(file);
  const { blobUrl, isLoading } = useDriveFileBlobUrl(file.id, companyId, thumbnailable || previewable);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 flex flex-col gap-4 h-full min-h-[220px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-dash-dark truncate">{file.original_name}</p>
          <p className="text-[11px] text-gray-400">{formatDriveBytes(file.size_bytes)}</p>
        </div>
        {previewable && (
          <button
            type="button"
            onClick={onOpenFullPreview}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dash-dark text-white text-[11px] font-bold hover:opacity-90"
          >
            <Eye size={14} />
            View
          </button>
        )}
      </div>

      <div className="flex-1 min-h-[160px] rounded-2xl bg-[#F4F7F9] border border-gray-100 overflow-hidden flex items-center justify-center p-2">
        {isLoading ? (
          <Loader2 size={24} className="animate-spin text-gray-300" />
        ) : thumbnailable && blobUrl ? (
          <DrivePreviewContent
            kind={getDrivePreviewKind(file.mime_type)}
            blobUrl={blobUrl}
            fileName={file.original_name}
            variant="thumbnail"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-gray-200 flex items-center justify-center">
              <FileText size={24} className="text-gray-500" />
            </div>
            <p className="text-[11px] text-gray-400">
              {previewable ? "Click View for full preview" : "No thumbnail for this file type"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
