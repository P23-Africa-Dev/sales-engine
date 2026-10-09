"use client";

import { useState } from "react";

import { getAgentInitials } from "@/lib/tracking/map-visualization";

export function AgentAvatar({
  name,
  avatarUrl,
  sizeClassName,
  initialsClassName = "text-[12px]",
  allowInitialsFallback = true,
}: {
  name: string;
  avatarUrl?: string;
  sizeClassName: string;
  initialsClassName?: string;
  allowInitialsFallback?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const initials = getAgentInitials(name);
  const showImage = !!avatarUrl && !imageFailed;

  return (
    <div
      className={`${sizeClassName} rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm bg-gray-100 flex items-center justify-center`}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          className="w-full h-full object-cover"
          alt={name || "Agent"}
          onError={() => setImageFailed(true)}
        />
      ) : initials && allowInitialsFallback ? (
        <span className={`${initialsClassName} font-bold text-gray-500`}>{initials}</span>
      ) : (
        <span aria-hidden="true" className="block w-full h-full bg-transparent" />
      )}
    </div>
  );
}
