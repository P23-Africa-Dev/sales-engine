"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Share2,
  FileText,
  Image as ImageIcon,
  Loader2,
  HardDrive,
  Eye,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import {
  useCreateDriveFolder,
  useDeleteDriveFile,
  useDownloadDriveFile,
  useDriveFiles,
  useDriveFolders,
  useDriveUsage,
  useSyncDriveGrants,
  useUploadDriveFile,
  type DriveFile,
} from "@/hooks/use-drive";
import { formatDriveBytes } from "@/lib/api/drive";
import { canPreviewDriveFile } from "@/lib/drive-preview";
import { DriveShareModal } from "./drive-share-modal";
import { DriveQuickPreview } from "./drive-quick-preview";
import { DrivePreviewModal } from "./drive-preview-modal";

function fileIcon(mime: string | null) {
  if (mime?.startsWith("image/")) return ImageIcon;
  return FileText;
}

export function DriveView({ basePath = "" }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const deepLinkFileId = searchParams.get("file");
  const deepLinkFolderKey = searchParams.get("folder");

  const { user } = useAuthStore();
  const { apiCompanyId, role } = getActiveCompanyContext(user);
  const canManage = role === "owner" || role === "admin" || role === "supervisor";

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [previewModalFile, setPreviewModalFile] = useState<DriveFile | null>(null);
  const [search, setSearch] = useState("");
  const [shareFile, setShareFile] = useState<DriveFile | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  const { data: usage, isLoading: usageLoading } = useDriveUsage(apiCompanyId ?? undefined);
  const { data: folders = [], isLoading: foldersLoading } = useDriveFolders(apiCompanyId ?? undefined);
  const { data: filesData, isLoading: filesLoading } = useDriveFiles({
    company_id: apiCompanyId ?? undefined,
    folder_id: selectedFolderId ?? undefined,
    search: search || undefined,
    per_page: 50,
  });

  const createFolder = useCreateDriveFolder();
  const uploadFile = useUploadDriveFile();
  const deleteFile = useDeleteDriveFile();
  const downloadFile = useDownloadDriveFile();
  const syncGrants = useSyncDriveGrants();

  const files = filesData?.items ?? [];

  const elyFolder = useMemo(
    () => folders.find((f) => f.system_key === "ely_reports") ?? null,
    [folders],
  );

  useEffect(() => {
    if (selectedFolderId != null || folders.length === 0) return;

    if (deepLinkFolderKey === "ely_reports" && elyFolder) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- apply deep-link folder selection once folders load
      setSelectedFolderId(elyFolder.id);
      return;
    }

    setSelectedFolderId(elyFolder?.id ?? folders[0]?.id ?? null);
  }, [folders, elyFolder, selectedFolderId, deepLinkFolderKey]);

  const highlightedFileId = deepLinkFileId ? Number(deepLinkFileId) : null;

  useEffect(() => {
    if (!highlightedFileId || files.length === 0) return;
    const match = files.find((f) => f.id === highlightedFileId);
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- select file highlighted via URL once files load
      setSelectedFile(match);
    }
  }, [highlightedFileId, files]);

  function handleDownload(file: DriveFile) {
    downloadFile.mutate({
      fileId: file.id,
      company_id: apiCompanyId ?? undefined,
      filename: file.original_name,
    });
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length || !canManage || selectedFolderId == null || !apiCompanyId) return;

    for (const file of Array.from(fileList)) {
      await uploadFile.mutateAsync({
        company_id: apiCompanyId,
        folder_id: selectedFolderId,
        file,
      });
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !apiCompanyId) return;
    const res = await createFolder.mutateAsync({
      company_id: apiCompanyId,
      name: newFolderName.trim(),
      parent_id: null,
    });
    setNewFolderName("");
    setSelectedFolderId(res.data.id);
  }

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-dash-dark">Company Drive</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">
              {canManage ? "Upload, organize, and share files with your team." : "Files shared with you by your organization."}
            </p>
          </div>
          <a
            href={`${basePath}/settings/drive`}
            className="text-[12px] font-semibold text-dash-dark underline-offset-2 hover:underline"
          >
            Storage settings
          </a>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <HardDrive size={18} className="text-dash-dark" />
            <span className="text-[13px] font-bold text-dash-dark">Storage</span>
            {usageLoading ? (
              <Loader2 size={14} className="animate-spin text-gray-400" />
            ) : usage ? (
              <span className="text-[12px] text-gray-500 ml-auto">
                {formatDriveBytes(usage.used_bytes)} of {formatDriveBytes(usage.limit_bytes)} used
              </span>
            ) : null}
          </div>
          {usage && (
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-dash-dark transition-all"
                style={{ width: `${Math.min(100, usage.percent)}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-64 shrink-0 bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Folders</p>
            {foldersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-gray-300" size={20} />
              </div>
            ) : (
              <div className="space-y-1">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setSelectedFile(null);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-[13px] font-medium transition-colors ${
                      selectedFolderId === folder.id
                        ? "bg-dash-dark text-white"
                        : "text-dash-dark hover:bg-gray-50"
                    }`}
                  >
                    <Folder size={16} className="shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            )}

            {canManage && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder"
                  className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-dash-dark/10"
                />
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={createFolder.isPending}
                  className="shrink-0 p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-dash-dark"
                  title="Create folder"
                >
                  <FolderPlus size={16} />
                </button>
              </div>
            )}
          </aside>

          <div className="flex-1 min-w-0 flex flex-col xl:flex-row gap-4">
            <main className="flex-1 min-w-0 bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search files..."
                  className="flex-1 rounded-full border border-gray-200 px-4 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-dash-dark/10"
                />
                {canManage && selectedFolderId != null && (
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-dash-dark text-white text-[13px] font-bold cursor-pointer hover:opacity-90">
                    <Upload size={15} />
                    Upload
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void handleUpload(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>

              {filesLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="animate-spin text-gray-300" size={28} />
                </div>
              ) : files.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-[14px]">
                  {canManage ? "No files in this folder yet. Upload your first document." : "No files have been shared with you in this folder."}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {files.map((file) => {
                    const Icon = fileIcon(file.mime_type);
                    const isSelected = selectedFile?.id === file.id;
                    const isHighlighted = highlightedFileId === file.id;
                    const previewable = canPreviewDriveFile(file);

                    return (
                      <div
                        key={file.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedFile(file)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedFile(file);
                          }
                        }}
                        className={`flex items-center gap-3 py-3 px-2 rounded-2xl cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-dash-dark/5 ring-2 ring-dash-dark/20"
                            : isHighlighted
                              ? "bg-amber-50 ring-1 ring-amber-200"
                              : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                          <Icon size={18} className="text-dash-dark" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold text-dash-dark truncate">{file.original_name}</p>
                          <p className="text-[11px] text-gray-400">
                            {formatDriveBytes(file.size_bytes)}
                            {file.source === "ely_report" ? " · ELY Report" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {previewable && (
                            <button
                              type="button"
                              onClick={() => setPreviewModalFile(file)}
                              className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                              title="View file"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownload(file)}
                            className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                            title="Download"
                          >
                            <Download size={16} />
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => setShareFile(file)}
                                className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                                title="Share"
                              >
                                <Share2 size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  deleteFile.mutate({ fileId: file.id, company_id: apiCompanyId ?? undefined });
                                  if (selectedFile?.id === file.id) setSelectedFile(null);
                                }}
                                className="p-2 rounded-full hover:bg-red-50 text-red-500"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </main>

            {selectedFile && apiCompanyId && (
              <aside className="xl:w-80 shrink-0">
                <DriveQuickPreview
                  file={selectedFile}
                  companyId={apiCompanyId}
                  onOpenFullPreview={() => setPreviewModalFile(selectedFile)}
                />
              </aside>
            )}
          </div>
        </div>
      </div>

      {shareFile && apiCompanyId && (
        <DriveShareModal
          file={shareFile}
          companyId={apiCompanyId}
          onClose={() => setShareFile(null)}
          onSave={async (shareWithAll, userIds) => {
            await syncGrants.mutateAsync({
              fileId: shareFile.id,
              company_id: apiCompanyId,
              share_with_all: shareWithAll,
              user_ids: userIds,
            });
            setShareFile(null);
          }}
          isSaving={syncGrants.isPending}
        />
      )}

      {previewModalFile && apiCompanyId && (
        <DrivePreviewModal
          file={previewModalFile}
          companyId={apiCompanyId}
          onClose={() => setPreviewModalFile(null)}
          onDownload={() => handleDownload(previewModalFile)}
        />
      )}
    </div>
  );
}
