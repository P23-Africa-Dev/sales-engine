export type MapAppearance = "day" | "night";

export const MAPBOX_NAVIGATION_DAY_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
export const MAPBOX_NAVIGATION_NIGHT_STYLE = "mapbox://styles/mapbox/navigation-night-v1";

export function resolveMapAppearance(): MapAppearance {
  return "day";
}

export function getMapboxNavigationStyle(appearance: MapAppearance): string {
  return appearance === "night"
    ? MAPBOX_NAVIGATION_NIGHT_STYLE
    : MAPBOX_NAVIGATION_DAY_STYLE;
}
