"use client";

import { useEffect, useState } from "react";
import type { DrivePreviewKind } from "@/lib/drive-preview";

type DrivePreviewContentProps = {
  kind: DrivePreviewKind;
  blobUrl: string;
  fileName: string;
  variant: "modal" | "thumbnail";
};

export function DrivePreviewContent({ kind, blobUrl, fileName, variant }: DrivePreviewContentProps) {
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "text") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear text preview when switching away from text
      setTextContent(null);
      return;
    }

    let cancelled = false;
    fetch(blobUrl)
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setTextContent(text.slice(0, variant === "thumbnail" ? 800 : 50000));
      })
      .catch(() => {
        if (!cancelled) setTextContent(null);
      });

    return () => {
      cancelled = true;
    };
  }, [blobUrl, kind, variant]);

  if (kind === "image") {
    return (
      <div className={variant === "modal" ? "flex justify-center" : "w-full h-full flex items-center justify-center"}>
        <img
          src={blobUrl}
          alt={fileName}
          className={
            variant === "modal"
              ? "max-h-[72vh] max-w-full object-contain rounded-lg shadow-sm"
              : "max-h-full max-w-full object-contain rounded-lg"
          }
        />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <iframe
        src={blobUrl}
        title={fileName}
        className={
          variant === "modal"
            ? "w-full h-[72vh] min-h-[320px] rounded-xl border border-gray-200 bg-white"
            : "w-full h-full min-h-[140px] rounded-xl border border-gray-200 bg-white"
        }
      />
    );
  }

  if (kind === "text") {
    return (
      <pre
        className={
          variant === "modal"
            ? "max-h-[72vh] overflow-auto rounded-xl bg-white border border-gray-200 p-4 text-[12px] text-dash-dark whitespace-pre-wrap break-words"
            : "max-h-[140px] overflow-hidden rounded-xl bg-white border border-gray-200 p-3 text-[10px] text-dash-dark whitespace-pre-wrap break-words line-clamp-6"
        }
      >
        {textContent ?? "Loading text preview…"}
      </pre>
    );
  }

  return null;
}
