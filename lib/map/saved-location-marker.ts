import { getSavedLocationColor, getSavedLocationLabel, getSavedLocationType } from "@/lib/map/location-types";

export type SavedLocationMarkerInput = {
  name: string;
  type?: string | null;
  selected?: boolean;
};

const TYPE_ICON_PATHS: Record<string, string> = {
  office:
    "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4",
  warehouse: "M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35M22 8.35l-10-4.7-10 4.7M12 3.65V8.35M6 12h12M6 16h12",
  airport: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  railway_station: "M8 3.1V7H4v10a1 1 0 0 0 1 1h1.4a1 1 0 0 0 .95-.68l.8-2.32M8 3.1h8M16 3.1V7M8 11h8M8 15h8M8 7v8M16 7v8",
  bus_terminal: "M8 6v6M15 6v6M2 12h19.6M5 18h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z",
  seaport: "M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.5 0 2.5 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M12 3l-4 7h8l-4-7zM12 10v4",
  filling_station: "M3 22h12M5 22V7l7-3v18M19 16v6M15 12V6l4-2v12",
  client_site: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  service_center: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  distribution_center: "M10 17h4M14 3h4v4h-4zM10 21H6v-4h4zM14 3l-7 7M6 17l7 7",
  hospital: "M12 6v12M6 12h12M20 10v12H4V10l8-7 8 7z",
  school: "M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5",
  hotel: "M3 21h18M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M15 9h1M15 13h1M15 17h1",
  restaurant: "M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  government_office: "M3 21h18M6 21V7l6-4 6 4v14M10 21v-4h4v4",
  retail_store: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
  other: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(name: string, max = 24): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function renderSavedLocationTypeIconSvg(
  type: string | null | undefined,
  color: string,
  size = 14,
): string {
  const option = getSavedLocationType(type);
  const path = TYPE_ICON_PATHS[option.value] ?? TYPE_ICON_PATHS.other;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

function buildMarkerInnerHtml(input: SavedLocationMarkerInput): string {
  const option = getSavedLocationType(input.type);
  const color = option.color;
  const label = truncateLabel(input.name || option.label);
  const typeLabel = getSavedLocationLabel(input.type);
  const icon = renderSavedLocationTypeIconSvg(input.type, color, 13);
  const selectedRing = input.selected
    ? "box-shadow:0 0 0 3px rgba(9,75,92,0.35), 0 4px 14px rgba(15,23,42,0.28);"
    : "box-shadow:0 3px 10px rgba(15,23,42,0.22);";

  return `
    <div style="display:flex;flex-direction:column;align-items:center;transform-origin:bottom center;${input.selected ? "transform:scale(1.06);" : ""}">
      <div title="${escapeHtml(input.name)} · ${escapeHtml(typeLabel)}" style="display:flex;align-items:center;gap:6px;background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:999px;padding:4px 10px 4px 4px;max-width:196px;${selectedRing}">
        <span style="width:24px;height:24px;border-radius:999px;background:${color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${icon}</span>
        <span style="font:600 11px/1.2 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</span>
      </div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid #ffffff;margin-top:-1px;filter:drop-shadow(0 2px 2px rgba(15,23,42,0.12));"></div>
      <div style="width:10px;height:10px;border-radius:999px;background:${color};border:2px solid #ffffff;margin-top:1px;box-shadow:0 2px 6px rgba(15,23,42,0.25);"></div>
    </div>
  `;
}

/** HTML marker for Mapbox / overlay maps (name + type icon label). */
export function createSavedLocationMarkerElement(
  input: SavedLocationMarkerInput | string | null | undefined,
): HTMLDivElement {
  const normalized: SavedLocationMarkerInput =
    typeof input === "string" || input == null
      ? { name: getSavedLocationLabel(input), type: input ?? "other" }
      : input;

  const root = document.createElement("div");
  root.dataset.marker = "saved-location";
  root.style.cursor = "pointer";
  root.style.pointerEvents = "auto";
  root.innerHTML = buildMarkerInnerHtml(normalized);
  return root;
}

export type GoogleSavedLocationMarkerIcon = {
  url: string;
  scaledSize: { width: number; height: number };
  anchor: { x: number; y: number };
};

/** Rasterized SVG icon for native Google Maps markers. */
export function createSavedLocationMarkerGoogleIcon(
  input: SavedLocationMarkerInput,
): GoogleSavedLocationMarkerIcon {
  const option = getSavedLocationType(input.type);
  const label = truncateLabel(input.name || option.label, 28);
  const typeLabel = getSavedLocationLabel(input.type);
  const color = option.color;
  const path = TYPE_ICON_PATHS[option.value] ?? TYPE_ICON_PATHS.other;
  const width = Math.min(220, Math.max(118, label.length * 7 + 58));
  const height = 54;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.18"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <rect x="4" y="4" width="${width - 8}" height="30" rx="15" fill="#ffffff" stroke="rgba(15,23,42,0.08)"/>
        <circle cx="22" cy="19" r="12" fill="${color}"/>
        <g transform="translate(15,12)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="${path}"/>
          </svg>
        </g>
        <text x="40" y="21" fill="#0f172a" font-family="system-ui,Segoe UI,sans-serif" font-size="11" font-weight="600">${escapeHtml(label)}</text>
        <polygon points="${width / 2 - 7},34 ${width / 2 + 7},34 ${width / 2},42" fill="#ffffff"/>
        <circle cx="${width / 2}" cy="${height - 8}" r="6" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      </g>
      <title>${escapeHtml(input.name)} · ${escapeHtml(typeLabel)}</title>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: { width, height },
    anchor: { x: width / 2, y: height - 4 },
  };
}
