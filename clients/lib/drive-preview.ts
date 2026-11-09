import type { DriveFile } from "@/lib/api/drive";

export type DrivePreviewKind = "image" | "pdf" | "text" | "unsupported";

const IMAGE_PREFIX = "image/";
const PDF_MIME = "application/pdf";
const TEXT_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/csv",
]);

export function getDrivePreviewKind(mime: string | null): DrivePreviewKind {
  if (!mime) return "unsupported";
  if (mime.startsWith(IMAGE_PREFIX)) return "image";
  if (mime === PDF_MIME) return "pdf";
  if (TEXT_MIMES.has(mime) || mime.startsWith("text/")) return "text";
  return "unsupported";
}

export function canPreviewDriveFile(file: DriveFile): boolean {
  return getDrivePreviewKind(file.mime_type) !== "unsupported";
}

export function canThumbnailDriveFile(file: DriveFile): boolean {
  const kind = getDrivePreviewKind(file.mime_type);
  return kind === "image" || kind === "pdf";
}
