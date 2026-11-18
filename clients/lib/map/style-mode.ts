import type { StyleSpecification } from "mapbox-gl";

import { createGreenStreetStyle } from "./green-street-style";

export type MapAppearance = "day" | "night";

export const MAPBOX_NAVIGATION_DAY_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
export const MAPBOX_NAVIGATION_NIGHT_STYLE = "mapbox://styles/mapbox/navigation-night-v1";

/** Set NEXT_PUBLIC_MAP_TILES=mapbox to use the configured Mapbox navigation styles. */
const USE_MAPBOX_TILES = process.env.NEXT_PUBLIC_MAP_TILES === "mapbox";

export function resolveMapAppearance(): MapAppearance {
  return "day";
}

export function getMapboxNavigationStyle(appearance: MapAppearance): string | StyleSpecification {
  if (!USE_MAPBOX_TILES) return createGreenStreetStyle() as unknown as StyleSpecification;
  return appearance === "night"
    ? MAPBOX_NAVIGATION_NIGHT_STYLE
    : MAPBOX_NAVIGATION_DAY_STYLE;
}
