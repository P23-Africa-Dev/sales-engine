import { getAgentInitials } from "@/lib/tracking/map-visualization";

const CLOCK_IN_COLORS = {
  present: {
    halo: "rgba(22, 163, 74, 0.35)",
    border: "#16A34A",
    fill: "#DCFCE7",
    text: "#14532D",
  },
  late: {
    halo: "rgba(217, 119, 6, 0.35)",
    border: "#D97706",
    fill: "#FEF3C7",
    text: "#92400E",
  },
} as const;

export type ClockInMarkerOptions = {
  agentName: string;
  avatarUrl?: string | null;
  isLate?: boolean;
  selected?: boolean;
};

export function createClockInMarkerElement({
  agentName,
  avatarUrl,
  isLate = false,
  selected = false,
}: ClockInMarkerOptions): HTMLDivElement {
  const palette = isLate ? CLOCK_IN_COLORS.late : CLOCK_IN_COLORS.present;
  const root = document.createElement("div");
  root.className = "clock-in-marker";
  root.style.cssText = [
    "position:relative",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "cursor:pointer",
    selected ? "z-index:30" : "z-index:10",
    selected ? "transform:scale(1.08)" : "",
    "transition:transform 150ms ease",
  ].join(";");

  const halo = document.createElement("div");
  halo.style.cssText = [
    "position:absolute",
    "top:2px",
    "width:52px",
    "height:52px",
    "border-radius:9999px",
    `background:${palette.halo}`,
    "animation:clock-in-pulse 2.4s ease-in-out infinite",
  ].join(";");

  const avatar = document.createElement("div");
  avatar.style.cssText = [
    "position:relative",
    "width:44px",
    "height:44px",
    "border-radius:9999px",
    `border:3px solid ${palette.border}`,
    `background:${palette.fill}`,
    "overflow:hidden",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "box-shadow:0 8px 20px rgba(15,23,42,0.18)",
  ].join(";");

  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = agentName;
    img.style.cssText = "width:100%;height:100%;object-fit:cover";
    avatar.appendChild(img);
  } else {
    const initials = document.createElement("span");
    initials.textContent = getAgentInitials(agentName);
    initials.style.cssText = `font-size:13px;font-weight:700;color:${palette.text}`;
    avatar.appendChild(initials);
  }

  const badge = document.createElement("div");
  badge.style.cssText = [
    "position:absolute",
    "right:-2px",
    "bottom:-2px",
    "width:18px",
    "height:18px",
    "border-radius:9999px",
    `background:${palette.border}`,
    "border:2px solid white",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "color:white",
    "font-size:9px",
    "font-weight:700",
  ].join(";");
  badge.textContent = "⏱";

  avatar.appendChild(badge);

  const pin = document.createElement("div");
  pin.style.cssText = [
    "width:0",
    "height:0",
    "margin-top:2px",
    `border-left:7px solid transparent`,
    `border-right:7px solid transparent`,
    `border-top:10px solid ${palette.border}`,
  ].join(";");

  root.appendChild(halo);
  root.appendChild(avatar);
  root.appendChild(pin);

  return root;
}

export function createClockInMarkerGoogleIcon(isLate = false): { url: string; scaledSize: { width: number; height: number }; anchor: { x: number; y: number } } {
  const palette = isLate ? CLOCK_IN_COLORS.late : CLOCK_IN_COLORS.present;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="58" viewBox="0 0 44 58">
    <circle cx="22" cy="22" r="18" fill="${palette.fill}" stroke="${palette.border}" stroke-width="3"/>
    <text x="22" y="27" text-anchor="middle" font-size="14" font-weight="700" fill="${palette.text}">⏱</text>
    <path d="M22 40 L14 52 H30 Z" fill="${palette.border}"/>
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: 44, height: 58 },
    anchor: { x: 22, y: 52 },
  };
}
