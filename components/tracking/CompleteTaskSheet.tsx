"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, CheckCircle, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { getCurrentPosition } from "@/lib/tracking/geolocation";
import { completeTaskTracking } from "@/lib/api/tracking";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { ApiRequestError } from "@/lib/api/onboarding";

interface CompleteTaskSheetProps {
  taskId: number;
  companyId: number | string;
  minimumPhotos?: number;
  onSuccess: () => void;
  onClose: () => void;
}

export function CompleteTaskSheet({
  taskId,
  companyId,
  minimumPhotos = 1,
  onSuccess,
  onClose,
}: CompleteTaskSheetProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const canSubmit = files.length >= minimumPhotos && !submitting;

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const valid = Array.from(incoming).filter((f) =>
      f.type.startsWith("image/")
    );
    setFiles((prev) => [...prev, ...valid]);
    valid.forEach((f) => {
      const url = URL.createObjectURL(f);
      setPreviews((prev) => [...prev, url]);
    });
  };

  const removeFile = (idx: number) => {
    URL.revokeObjectURL(previews[idx]);
    setFiles((f) => f.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setFieldErrors({});
    setSubmitting(true);

    try {
      const token = getAuthTokenFromDocument();
      const geo = await getCurrentPosition().catch(() => null);

      const formData = new FormData();
      formData.append("company_id", String(companyId));
      if (geo) {
        formData.append("latitude", String(geo.latitude));
        formData.append("longitude", String(geo.longitude));
        if (geo.accuracyMeters != null)
          formData.append("accuracy_meters", String(geo.accuracyMeters));
      }
      formData.append("recorded_at", new Date().toISOString());
      if (notes.trim()) formData.append("notes", notes.trim());
      files.forEach((f) => formData.append("files[]", f));

      const response = await completeTaskTracking(taskId, formData, token);
      toast.success(response.message || "Task completed successfully.");
      onSuccess();
    } catch (err) {
      if (err instanceof ApiRequestError && err.errors) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.errors)) {
          mapped[k] = v[0];
        }
        setFieldErrors(mapped);
        toast.error(err.message || "Please fix the errors below.");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to complete task. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-t-[32px] shadow-2xl z-10 max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-[16px] font-bold text-dash-dark">Complete Task</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Proof photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-bold text-dash-dark">
                Proof Photos
                <span className="text-red-400 ml-0.5">*</span>
              </p>
              <p className="text-[11px] text-gray-400">
                {files.length}/{minimumPhotos} minimum
              </p>
            </div>

            {/* Preview grid */}
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {previews.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} className="w-full h-full object-cover" alt="" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-3.5 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-semibold text-gray-400 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Camera size={16} />
              {previews.length === 0 ? "Add photos" : "Add more photos"}
            </button>

            {fieldErrors.files && (
              <p className="text-[11px] text-red-400 mt-1">{fieldErrors.files}</p>
            )}
            {fieldErrors["files[]"] && (
              <p className="text-[11px] text-red-400 mt-1">{fieldErrors["files[]"]}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-[13px] font-bold text-dash-dark mb-2">
              Notes
              <span className="text-[11px] font-normal text-gray-400 ml-1">(optional)</span>
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remarks about this task completion…"
              rows={3}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-[13px] text-dash-dark border border-gray-200 focus:border-dash-teal outline-none resize-none placeholder:text-gray-300"
            />
          </div>

          {files.length < minimumPhotos && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <ImageIcon size={14} className="text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-700">
                {minimumPhotos - files.length} more photo{minimumPhotos - files.length !== 1 ? "s" : ""} required before submitting.
              </p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-4 bg-[#7EB5AE] text-white rounded-2xl text-[14px] font-bold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle size={16} />
            )}
            {submitting ? "Submitting…" : "Submit Completion"}
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
