"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  downloadTaskProof,
  formatProofBytes,
  replaceTaskProof,
  triggerProofBlobDownload,
  type TaskProofItem,
} from "@/lib/api/tasks";
import { ApiRequestError } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

type ProofPreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  blobUrl: string | null;
  blob: Blob | null;
  error: string | null;
};

type TaskProofGalleryProps = {
  taskId: number | string;
  companyId: number | string;
  proofs: TaskProofItem[];
  canDownload: boolean;
  onProofReplaced?: () => void;
};

function proofDisplayName(proof: TaskProofItem): string {
  if (proof.file_name && proof.file_name.trim()) return proof.file_name.trim();
  return `proof-${proof.id}.jpg`;
}

function formatProofDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TaskProofGallery({
  taskId,
  companyId,
  proofs,
  canDownload,
  onProofReplaced,
}: TaskProofGalleryProps) {
  const [previews, setPreviews] = useState<Record<number, ProofPreviewState>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const blobUrlsRef = useRef<Map<number, string>>(new Map());
  const loadGenerationRef = useRef(0);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetIdRef = useRef<number | null>(null);
  const proofIdsKey = useMemo(() => proofs.map((p) => p.id).join(","), [proofs]);

  useEffect(() => {
    // Portal must wait until client mount; eslint rule flags sync setState in effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only portal gate
    setMounted(true);
  }, []);

  const revokeAllBlobUrls = useCallback(() => {
    for (const url of blobUrlsRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    blobUrlsRef.current.clear();
  }, []);

  const loadProof = useCallback(
    async (proof: TaskProofItem, generation?: number) => {
      if (!canDownload) return;
      const expectedGeneration = generation ?? loadGenerationRef.current;

      const previousUrl = blobUrlsRef.current.get(proof.id);
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
        blobUrlsRef.current.delete(proof.id);
      }

      setPreviews((prev) => ({
        ...prev,
        [proof.id]: { status: "loading", blobUrl: null, blob: null, error: null },
      }));

      try {
        const token = getAuthTokenFromDocument() || "";
        if (!token) {
          throw new ApiRequestError("You must be logged in to view proof files.", 401);
        }

        const blob = await downloadTaskProof(taskId, proof.id, { company_id: companyId }, token);
        if (expectedGeneration !== loadGenerationRef.current) return;

        const blobUrl = URL.createObjectURL(blob);
        blobUrlsRef.current.set(proof.id, blobUrl);

        setPreviews((prev) => ({
          ...prev,
          [proof.id]: { status: "ready", blobUrl, blob, error: null },
        }));
      } catch (error) {
        if (expectedGeneration !== loadGenerationRef.current) return;
        const message =
          error instanceof ApiRequestError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to load proof.";
        setPreviews((prev) => ({
          ...prev,
          [proof.id]: { status: "error", blobUrl: null, blob: null, error: message },
        }));
      }
    },
    [canDownload, companyId, taskId],
  );

  useEffect(() => {
    const generation = ++loadGenerationRef.current;

    if (!canDownload) {
      revokeAllBlobUrls();
      return;
    }

    for (const proof of proofs) {
      void loadProof(proof, generation);
    }

    return () => {
      loadGenerationRef.current += 1;
      revokeAllBlobUrls();
    };
  }, [canDownload, companyId, taskId, proofIdsKey, loadProof, proofs, revokeAllBlobUrls]);

  const activeProof = lightboxIndex != null ? proofs[lightboxIndex] ?? null : null;
  const activePreview = activeProof ? previews[activeProof.id] : undefined;

  const metaLine = useMemo(() => {
    if (!activeProof) return "";
    const parts = [
      activeProof.uploader?.name,
      formatProofDate(activeProof.captured_at ?? activeProof.created_at),
      formatProofBytes(activeProof.size_bytes),
    ].filter(Boolean);
    return parts.join(" · ");
  }, [activeProof]);

  const handleDownload = async (proof: TaskProofItem) => {
    if (!canDownload) return;
    setDownloadingId(proof.id);
    try {
      let blob = previews[proof.id]?.blob ?? null;
      if (!blob) {
        const token = getAuthTokenFromDocument() || "";
        if (!token) throw new ApiRequestError("You must be logged in to download proof files.", 401);
        blob = await downloadTaskProof(taskId, proof.id, { company_id: companyId }, token);
      }
      triggerProofBlobDownload(blob, proofDisplayName(proof));
      toast.success("Proof downloaded.");
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to download proof.";
      toast.error(message);
    } finally {
      setDownloadingId(null);
    }
  };

  const openReplacePicker = (proofId: number) => {
    replaceTargetIdRef.current = proofId;
    replaceInputRef.current?.click();
  };

  const handleReplaceSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const proofId = replaceTargetIdRef.current;
    event.currentTarget.value = "";
    if (!file || proofId == null || !canDownload) return;

    setReplacingId(proofId);
    try {
      const token = getAuthTokenFromDocument() || "";
      if (!token) throw new ApiRequestError("You must be logged in to replace proof files.", 401);
      const formData = new FormData();
      formData.append("company_id", String(companyId));
      formData.append("file", file);
      await replaceTaskProof(taskId, proofId, formData, token);
      toast.success("Proof replaced.");
      onProofReplaced?.();
      const proof = proofs.find((item) => item.id === proofId);
      if (proof) void loadProof(proof);
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to replace proof.";
      toast.error(message);
    } finally {
      setReplacingId(null);
      replaceTargetIdRef.current = null;
    }
  };

  const isMissingFileError = (message?: string | null) =>
    !!message && /could not be found|no longer available/i.test(message);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  useEffect(() => {
    if (lightboxIndex == null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLightbox();
        return;
      }
      if (event.key === "ArrowLeft") {
        setLightboxIndex((current) =>
          current == null || proofs.length === 0
            ? current
            : (current - 1 + proofs.length) % proofs.length,
        );
        return;
      }
      if (event.key === "ArrowRight") {
        setLightboxIndex((current) =>
          current == null || proofs.length === 0 ? current : (current + 1) % proofs.length,
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, proofs.length, closeLightbox]);

  const goPrev = () => {
    if (lightboxIndex == null || proofs.length === 0) return;
    setLightboxIndex((lightboxIndex - 1 + proofs.length) % proofs.length);
  };

  const goNext = () => {
    if (lightboxIndex == null || proofs.length === 0) return;
    setLightboxIndex((lightboxIndex + 1) % proofs.length);
  };

  if (!proofs.length) return null;

  const lightbox =
    mounted && activeProof && lightboxIndex != null
      ? createPortal(
          <div className="fixed inset-0 z-[80000] flex items-center justify-center p-4 sm:p-6">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
              onClick={closeLightbox}
              aria-hidden
            />
            <div
              className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label={proofDisplayName(activeProof)}
            >
              <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-gray-100 shrink-0">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] sm:text-[17px] font-bold text-dash-dark truncate">
                    {proofDisplayName(activeProof)}
                  </h2>
                  {metaLine ? (
                    <p className="text-[12px] text-gray-400 mt-0.5 truncate">{metaLine}</p>
                  ) : null}
                  {activeProof.notes ? (
                    <p className="text-[12px] text-gray-500 mt-1 line-clamp-2">{activeProof.notes}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canDownload ? (
                    <button
                      type="button"
                      onClick={() => void handleDownload(activeProof)}
                      disabled={downloadingId === activeProof.id}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 text-gray-700 text-[13px] font-semibold disabled:opacity-60"
                      title="Download"
                    >
                      {downloadingId === activeProof.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Download size={16} />
                      )}
                      Download
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={closeLightbox}
                    className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-600"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="relative flex-1 min-h-0 bg-[#0f1115] flex items-center justify-center p-4 sm:p-6">
                {proofs.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      className="absolute left-3 sm:left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                      aria-label="Previous proof"
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="absolute right-3 sm:right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                      aria-label="Next proof"
                    >
                      <ChevronRight size={22} />
                    </button>
                  </>
                ) : null}

                {activePreview?.status === "loading" || activePreview?.status === "idle" ? (
                  <Loader2 size={36} className="animate-spin text-white/40" />
                ) : activePreview?.status === "error" || !activePreview?.blobUrl ? (
                  <div className="flex flex-col items-center gap-3 text-center px-4">
                    <p className="text-[14px] text-red-300 font-medium">
                      {activePreview?.error || "Could not load preview"}
                    </p>
                    {canDownload ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => void loadProof(activeProof)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-dash-dark text-[13px] font-bold"
                        >
                          <RefreshCw size={14} />
                          Retry
                        </button>
                        {isMissingFileError(activePreview?.error) ? (
                          <button
                            type="button"
                            onClick={() => openReplacePicker(activeProof.id)}
                            disabled={replacingId === activeProof.id}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-dash-teal text-white text-[13px] font-bold disabled:opacity-60"
                          >
                            {replacingId === activeProof.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Upload size={14} />
                            )}
                            Replace photo
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL, not a public CDN path
                  <img
                    src={activePreview.blobUrl}
                    alt={proofDisplayName(activeProof)}
                    className="max-h-[70vh] max-w-full object-contain rounded-lg"
                  />
                )}
              </div>

              {proofs.length > 1 ? (
                <div className="px-5 py-3 border-t border-gray-100 text-[12px] text-gray-400 text-center shrink-0">
                  {lightboxIndex + 1} of {proofs.length}
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mt-4 space-y-3">
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        onChange={(event) => void handleReplaceSelected(event)}
      />
      <h4 className="text-[13px] font-bold text-dash-dark">Proofs</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {proofs.map((proof, index) => {
          const preview = previews[proof.id];
          const name = proofDisplayName(proof);
          const sizeLabel = formatProofBytes(proof.size_bytes);
          const dateLabel = formatProofDate(proof.captured_at ?? proof.created_at);

          return (
            <div
              key={proof.id}
              className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm"
            >
              <button
                type="button"
                className="relative block w-full aspect-[4/3] bg-gray-50 disabled:cursor-default"
                onClick={() => {
                  if (!canDownload) return;
                  setLightboxIndex(index);
                }}
                disabled={!canDownload}
                aria-label={canDownload ? `Preview ${name}` : `${name} restricted`}
              >
                {!canDownload ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400 px-3">
                    <ImageIcon size={22} />
                    <span className="text-[11px] font-semibold">Restricted</span>
                  </div>
                ) : preview?.status === "loading" || preview?.status === "idle" || !preview ? (
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-gray-100 to-gray-200" />
                ) : preview.status === "error" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
                    <p
                      className="text-[11px] text-red-500 font-medium line-clamp-3"
                      title={preview.error || "Failed to load"}
                    >
                      {preview.error || "Failed to load"}
                    </p>
                    <div className="flex flex-col items-center gap-1">
                      <span
                        role="button"
                        tabIndex={0}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-dash-teal"
                        onClick={(event) => {
                          event.stopPropagation();
                          void loadProof(proof);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            void loadProof(proof);
                          }
                        }}
                      >
                        <RefreshCw size={12} />
                        Retry
                      </span>
                      {isMissingFileError(preview.error) ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-dash-dark"
                          onClick={(event) => {
                            event.stopPropagation();
                            openReplacePicker(proof.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              openReplacePicker(proof.id);
                            }
                          }}
                        >
                          {replacingId === proof.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Upload size={12} />
                          )}
                          Replace photo
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL
                  <img
                    src={preview.blobUrl ?? undefined}
                    alt={name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
              </button>

              <div className="p-2.5 space-y-1">
                <p className="text-[11px] font-semibold text-dash-dark truncate" title={name}>
                  {name}
                </p>
                <p className="text-[10px] text-gray-400 truncate">
                  {[proof.uploader?.name, dateLabel, sizeLabel].filter(Boolean).join(" · ") ||
                    `Proof #${proof.id}`}
                </p>
                {proof.notes ? (
                  <p className="text-[10px] text-gray-500 line-clamp-2">{proof.notes}</p>
                ) : null}
                {canDownload ? (
                  <button
                    type="button"
                    onClick={() => void handleDownload(proof)}
                    disabled={downloadingId === proof.id}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-dash-teal disabled:opacity-60"
                  >
                    {downloadingId === proof.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    Download
                  </button>
                ) : (
                  <span className="mt-1 inline-block text-[11px] text-gray-400">Restricted</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {lightbox}
    </div>
  );
}
