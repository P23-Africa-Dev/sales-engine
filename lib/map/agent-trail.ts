import { getAgentInitials } from "@/lib/tracking/map-visualization";

/**
 * Distinct, high-contrast trail colors. Each actively tracked agent gets a
 * deterministic color (keyed by user id) shared by their route line and
 * moving avatar so multiple agents are easy to tell apart on the map.
 */
const AGENT_TRAIL_PALETTE = [
  "#E11D48", // rose
  "#7C3AED", // violet
  "#0284C7", // sky blue
  "#16A34A", // green
  "#D97706", // amber
  "#DB2777", // pink
  "#0D9488", // teal
  "#4F46E5", // indigo
  "#65A30D", // lime
  "#C026D3", // fuchsia
  "#B91C1C", // dark red
  "#1D4ED8", // blue
] as const;

export function agentTrailColor(userId: number): string {
  const index = Math.abs(Math.trunc(userId)) % AGENT_TRAIL_PALETTE.length;
  return AGENT_TRAIL_PALETTE[index];
}

export type LiveAgentMarkerOptions = {
  agentName: string;
  avatarUrl?: string | null;
  color: string;
  selected?: boolean;
};

type LiveAgentMarkerHandle = {
  element: HTMLDivElement;
  update: (options: LiveAgentMarkerOptions) => void;
};

/**
 * DOM element for the moving live-position avatar (Mapbox custom marker).
 * Circular avatar ring in the agent's trail color with a soft pulse, visually
 * distinct from the static clock-in marker that stays at the start point.
 */
export function createLiveAgentMarkerElement(
  options: LiveAgentMarkerOptions,
): LiveAgentMarkerHandle {
  const root = document.createElement("div");
  root.className = "live-agent-marker";
  root.style.cssText = [
    "position:relative",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "cursor:pointer",
    "will-change:transform",
  ].join(";");

  const pulse = document.createElement("div");
  pulse.style.cssText = [
    "position:absolute",
    "width:46px",
    "height:46px",
    "border-radius:9999px",
    "animation:clock-in-pulse 2.4s ease-in-out infinite",
  ].join(";");

  const avatar = document.createElement("div");
  avatar.style.cssText = [
    "position:relative",
    "width:36px",
    "height:36px",
    "border-radius:9999px",
    "overflow:hidden",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:#ffffff",
    "box-shadow:0 6px 16px rgba(15,23,42,0.28)",
    "transition:border-color 200ms ease, transform 150ms ease",
  ].join(";");

  const content = document.createElement("div");
  content.style.cssText = [
    "width:100%",
    "height:100%",
    "display:flex",
    "align-items:center",
    "justify-content:center",
  ].join(";");
  avatar.appendChild(content);

  const heading = document.createElement("div");
  heading.style.cssText = [
    "position:absolute",
    "right:-3px",
    "bottom:-3px",
    "width:14px",
    "height:14px",
    "border-radius:9999px",
    "border:2px solid #ffffff",
  ].join(";");
  avatar.appendChild(heading);

  root.appendChild(pulse);
  root.appendChild(avatar);

  let renderedAvatarUrl: string | null | undefined;
  let renderedName = "";

  const update = (next: LiveAgentMarkerOptions) => {
    pulse.style.background = hexToRgba(next.color, 0.3);
    avatar.style.border = `3px solid ${next.color}`;
    heading.style.background = next.color;
    root.style.zIndex = next.selected ? "40" : "20";
    avatar.style.transform = next.selected ? "scale(1.12)" : "scale(1)";

    if (next.avatarUrl !== renderedAvatarUrl || next.agentName !== renderedName) {
      renderedAvatarUrl = next.avatarUrl;
      renderedName = next.agentName;
      content.replaceChildren();
      if (next.avatarUrl) {
        const img = document.createElement("img");
        img.src = next.avatarUrl;
        img.alt = next.agentName;
        img.style.cssText = "width:100%;height:100%;object-fit:cover";
        content.appendChild(img);
      } else {
        const initials = document.createElement("span");
        initials.textContent = getAgentInitials(next.agentName) ?? "•";
        initials.style.cssText = `font-size:12px;font-weight:700;color:${next.color}`;
        content.appendChild(initials);
      }
    }
  };

  update(options);

  return { element: root, update };
}

/**
 * SVG icon for the moving live-position marker on the classic Google Maps
 * Marker API (which cannot host arbitrary DOM like Mapbox can).
 */
export function createLiveAgentGoogleIcon(
  color: string,
  initials: string,
  selected = false,
): { url: string; scaledSize: { width: number; height: number }; anchor: { x: number; y: number } } {
  const size = selected ? 46 : 40;
  const half = size / 2;
  const radius = half - 4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${half}" cy="${half}" r="${half - 1}" fill="${hexToRgba(color, 0.25)}"/>
    <circle cx="${half}" cy="${half}" r="${radius}" fill="#ffffff" stroke="${color}" stroke-width="3"/>
    <text x="${half}" y="${half + 4}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="${color}">${escapeXml(initials)}</text>
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size },
    anchor: { x: half, y: half },
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      default: return "&quot;";
    }
  });
}

export type LngLat = [number, number];

/**
 * Animates a marker between positions so live updates glide instead of
 * teleporting. Returns a cancel function.
 */
export function animateMarkerMove(
  from: LngLat,
  to: LngLat,
  durationMs: number,
  onFrame: (position: LngLat) => void,
): () => void {
  if (from[0] === to[0] && from[1] === to[1]) {
    onFrame(to);
    return () => {};
  }

  let rafId: number | null = null;
  const startedAt = performance.now();

  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  const step = (now: number) => {
    const t = Math.min(1, (now - startedAt) / durationMs);
    const eased = easeInOut(t);
    onFrame([
      from[0] + (to[0] - from[0]) * eased,
      from[1] + (to[1] - from[1]) * eased,
    ]);
    if (t < 1) {
      rafId = requestAnimationFrame(step);
    }
  };

  rafId = requestAnimationFrame(step);
  return () => {
    if (rafId != null) cancelAnimationFrame(rafId);
  };
}
