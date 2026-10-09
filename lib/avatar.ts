import type { SyntheticEvent } from "react";

const SPACES_ORIGIN =
  process.env.NEXT_PUBLIC_SPACES_ORIGIN_URL ??
  "https://factory23-storage.lon1.digitaloceanspaces.com";

export const DEFAULT_AVATAR =
  process.env.NEXT_PUBLIC_AVATAR_DEFAULT_URL ??
  `${SPACES_ORIGIN}/avatar/default/ghost.svg`;

/**
 * DigitalOcean CDN hostnames can 404 when CDN is disabled or not yet propagated.
 * Rewrite to the direct Spaces origin so stale API URLs still load.
 */
export function normalizeSpacesAvatarUrl(url: string): string {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith(".cdn.digitaloceanspaces.com")) {
      return url;
    }

    const origin = new URL(SPACES_ORIGIN);
    parsed.hostname = origin.hostname;
    parsed.protocol = origin.protocol;

    return parsed.toString();
  } catch {
    return url.replace(
      /\.cdn\.digitaloceanspaces\.com/g,
      ".digitaloceanspaces.com",
    );
  }
}

function apiOrigin(): string {
  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

  return apiBase.replace(/\/api\/v1\/?$/, "");
}

/**
 * Normalize avatar values from API payloads into a browser-safe image src.
 * Prefers absolute Spaces URLs returned by the backend; retains legacy relative
 * path support during the storage migration cutover.
 */
export function getSafeAvatarSrc(
  rawAvatar: string | null | undefined,
): string | null {
  if (!rawAvatar) return null;

  const trimmed = rawAvatar.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) return trimmed;

  if (trimmed.startsWith("avatar/") || trimmed.startsWith("storage/")) {
    const origin = apiOrigin();

    if (trimmed.startsWith("storage/")) {
      return `${origin}/${trimmed}`;
    }

    return `${origin}/storage/${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return normalizeSpacesAvatarUrl(parsed.toString());
    }

    return null;
  } catch {
    return null;
  }
}

export function resolveAvatarSrc(
  rawAvatar: string | null | undefined,
  fallback: string = DEFAULT_AVATAR,
): string {
  return getSafeAvatarSrc(rawAvatar) ?? fallback;
}

export function onAvatarError(
  event: SyntheticEvent<HTMLImageElement, Event>,
  fallback: string = DEFAULT_AVATAR,
): void {
  const target = event.currentTarget;

  if (target.dataset.avatarFallbackApplied === "true") {
    target.style.visibility = "hidden";
    return;
  }

  target.dataset.avatarFallbackApplied = "true";
  target.src = normalizeSpacesAvatarUrl(fallback);
}
