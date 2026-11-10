export type LocationContext = {
  name: string;
  center: [number, number]; // [lng, lat]
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  radiusKm: number;
  placeId?: string;
  address?: string;
  category?: string | null;
  /** True when the user searched a POI/brand, not just an area. */
  isBusiness?: boolean;
};

export function isInsideLocationContext(
  loc: { latitude: number; longitude: number },
  ctx: LocationContext
): boolean {
  if (ctx.bbox) {
    const [minLng, minLat, maxLng, maxLat] = ctx.bbox;
    return (
      loc.longitude >= minLng &&
      loc.longitude <= maxLng &&
      loc.latitude >= minLat &&
      loc.latitude <= maxLat
    );
  }
  return haversineKm(ctx.center[1], ctx.center[0], loc.latitude, loc.longitude) <= ctx.radiusKm;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
