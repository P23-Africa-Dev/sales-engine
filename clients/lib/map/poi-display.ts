import { resolvePoiStyle, type PoiResult } from "@/lib/map/overpass-search";
import type { PlaceSuggestion, RetrievedPlace } from "@/lib/utils/place-search";

export const GOOGLE_SEARCH_PIN_COLOR = "#EA4335";

export function inferIsBusiness(suggestion: PlaceSuggestion): boolean {
  if (suggestion.category) return true;
  if (suggestion.featureType === "poi") return true;
  return false;
}

export function buildPoiFromSearch(
  place: RetrievedPlace,
  suggestion: PlaceSuggestion,
): PoiResult {
  const category = suggestion.category ?? "business";
  const style = resolvePoiStyle(category);

  return {
    id: suggestion.id,
    lat: place.lat,
    lng: place.lng,
    name: place.name,
    category,
    categoryLabel: style.label,
    categoryColor: style.color,
    address: place.address || undefined,
  };
}

export function buildCategoryDotSvg(color: string, size = 12): string {
  const radius = size / 2 - 1;
  const center = size / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${center}" cy="${center}" r="${radius + 1}" fill="#ffffff"/>` +
    `<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}"/>` +
    `</svg>`
  );
}

export function buildSearchFocusPinSvg(color = GOOGLE_SEARCH_PIN_COLOR): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">` +
    `<path d="M16 2C9.37 2 4 7.37 4 14c0 10.5 12 26 12 26s12-15.5 12-26C28 7.37 22.63 2 16 2z" ` +
    `fill="${color}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="16" cy="14" r="6" fill="#ffffff" opacity="0.95"/>` +
    `</svg>`
  );
}

export function resolvePoiForSearchSelection(
  ctx: {
    placeId?: string;
    name: string;
    address?: string;
    category?: string | null;
    center: [number, number];
    isBusiness?: boolean;
  },
  viewportPois: PoiResult[],
  place?: RetrievedPlace | null,
  suggestion?: PlaceSuggestion | null,
): PoiResult | null {
  if (!ctx.isBusiness) return null;

  if (ctx.placeId) {
    const matched = viewportPois.find((poi) => poi.id === ctx.placeId);
    if (matched) return matched;
  }

  if (place && suggestion) {
    return buildPoiFromSearch(place, suggestion);
  }

  const category = ctx.category ?? "business";
  const style = resolvePoiStyle(category);

  return {
    id: ctx.placeId ?? `search-${ctx.center.join(",")}`,
    lat: ctx.center[1],
    lng: ctx.center[0],
    name: ctx.name,
    category,
    categoryLabel: style.label,
    categoryColor: style.color,
    address: ctx.address,
  };
}
