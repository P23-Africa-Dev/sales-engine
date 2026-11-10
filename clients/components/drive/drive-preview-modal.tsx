"use client";

import { Download, Eye, FileText, Loader2, X } from "lucide-react";
import type { DriveFile } from "@/lib/api/drive";
import { formatDriveBytes } from "@/lib/api/drive";
import { canPreviewDriveFile, getDrivePreviewKind } from "@/lib/drive-preview";
import { useDriveFileBlobUrl } from "@/hooks/use-drive-preview";
import { DrivePreviewContent } from "./drive-preview-content";

type DrivePreviewModalProps = {
  file: DriveFile;
  companyId: number | string;
  onClose: () => void;
  onDownload: () => void;
};

export function DrivePreviewModal({ file, companyId, onClose, onDownload }: DrivePreviewModalProps) {
  const previewable = canPreviewDriveFile(file);
  const { blobUrl, isLoading, isError } = useDriveFileBlobUrl(
    file.id,
    companyId,
    previewable,
  );

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />

      <div
        className="relative flex flex-col w-full max-w-5xl max-h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-preview-title"
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id="drive-preview-title" className="text-[16px] sm:text-[17px] font-bold text-dash-dark truncate">
              {file.original_name}
            </h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {formatDriveBytes(file.size_bytes)}
              {file.folder?.name ? ` · ${file.folder.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onDownload}
              className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-600"
              title="Download"
            >
              <Download size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-600"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-[#F8F9FA] p-4 sm:p-6">
          {!previewable ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-200 flex items-center justify-center">
                <FileText size={28} className="text-gray-500" />
              </div>
              <p className="text-[14px] font-medium text-dash-dark">Preview not available</p>
              <p className="text-[12px] text-gray-400 max-w-xs">
                This file type cannot be displayed in the browser. Download it to open on your device.
              </p>
              <button
                type="button"
                onClick={onDownload}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-bold"
              >
                <Download size={16} />
                Download file
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={32} className="animate-spin text-gray-300" />
            </div>
          ) : isError || !blobUrl ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <p className="text-[14px] text-red-500 font-medium">Could not load preview</p>
              <button type="button" onClick={onDownload} className="text-[13px] text-dash-dark underline">
                Download instead
              </button>
            </div>
          ) : (
            <DrivePreviewContent
              kind={getDrivePreviewKind(file.mime_type)}
              blobUrl={blobUrl}
              fileName={file.original_name}
              variant="modal"
            />
          )}
        </div>
      </div>
    </div>
  );
}
