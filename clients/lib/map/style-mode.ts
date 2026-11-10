import type { StyleSpecification } from "mapbox-gl";

export type MapAppearance = "day" | "night";

export const MAPBOX_NAVIGATION_DAY_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
export const MAPBOX_NAVIGATION_NIGHT_STYLE = "mapbox://styles/mapbox/navigation-night-v1";

/**
 * Demo default: free OpenStreetMap raster tiles that need no API key.
 * Set NEXT_PUBLIC_MAP_TILES=mapbox (with a valid NEXT_PUBLIC_MAPBOX_TOKEN) to use Mapbox styles again.
 */
const USE_MAPBOX_TILES = process.env.NEXT_PUBLIC_MAP_TILES === "mapbox";

function openTilesStyle(_appearance: MapAppearance): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm-base", type: "raster", source: "osm" }],
  };
}

export function resolveMapAppearance(): MapAppearance {
  return "day";
}

export function getMapboxNavigationStyle(appearance: MapAppearance): string | StyleSpecification {
  if (!USE_MAPBOX_TILES) return openTilesStyle(appearance);
  return appearance === "night"
    ? MAPBOX_NAVIGATION_NIGHT_STYLE
    : MAPBOX_NAVIGATION_DAY_STYLE;
}
