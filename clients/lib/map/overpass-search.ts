export type PoiResult = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  category: string;
  categoryLabel: string;
  categoryColor: string;
  address?: string;
  phone?: string;
  openingHours?: string;
};

const CATEGORY_STYLES: Record<string, { label: string; color: string }> = {
  restaurant:       { label: 'Restaurant',       color: '#EA580C' },
  cafe:             { label: 'Café',              color: '#D97706' },
  fast_food:        { label: 'Fast Food',         color: '#F59E0B' },
  bar:              { label: 'Bar',               color: '#7C3AED' },
  pub:              { label: 'Pub',               color: '#6D28D9' },
  food_court:       { label: 'Food Court',        color: '#B45309' },
  bank:             { label: 'Bank',              color: '#2563EB' },
  atm:              { label: 'ATM',               color: '#1D4ED8' },
  fuel:             { label: 'Filling Station',   color: '#DC2626' },
  pharmacy:         { label: 'Pharmacy',          color: '#16A34A' },
  hospital:         { label: 'Hospital',          color: '#E11D48' },
  clinic:           { label: 'Clinic',            color: '#BE185D' },
  doctors:          { label: 'Clinic',            color: '#BE185D' },
  school:           { label: 'School',            color: '#0D9488' },
  college:          { label: 'College',           color: '#0891B2' },
  university:       { label: 'University',        color: '#0891B2' },
  hotel:            { label: 'Hotel',             color: '#CA8A04' },
  guest_house:      { label: 'Guest House',       color: '#A16207' },
  marketplace:      { label: 'Market',            color: '#059669' },
  place_of_worship: { label: 'Place of Worship',  color: '#6366F1' },
  post_office:      { label: 'Post Office',       color: '#0891B2' },
  police:           { label: 'Police Station',    color: '#1E3A5F' },
  supermarket:      { label: 'Supermarket',       color: '#059669' },
  convenience:      { label: 'Convenience Store', color: '#16A34A' },
  clothes:          { label: 'Clothing Store',    color: '#DB2777' },
  electronics:      { label: 'Electronics',       color: '#0284C7' },
  mobile_phone:     { label: 'Phone Store',       color: '#0284C7' },
  bakery:           { label: 'Bakery',            color: '#D97706' },
  butcher:          { label: 'Butcher',           color: '#B45309' },
  company:          { label: 'Company',           color: '#4B5563' },
  government:       { label: 'Government Office', color: '#1D4ED8' },
  financial:        { label: 'Financial Office',  color: '#2563EB' },
  mall:             { label: 'Shopping Mall',     color: '#0891B2' },
};

const DEFAULT_STYLE = { label: 'Business', color: '#EF4444' };

export function resolvePoiStyle(category: string): { label: string; color: string } {
  return CATEGORY_STYLES[category] ?? DEFAULT_STYLE;
}

export function isBboxTooLarge(bbox: [number, number, number, number]): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return (maxLng - minLng) * (maxLat - minLat) > 0.5;
}

export const BBOX_TOO_LARGE_MSG =
  'Area too large. Try a more specific place — a district, neighbourhood, or street.';

export async function fetchBusinessesInBbox(
  bbox: [number, number, number, number],
  limit = 80
): Promise<PoiResult[]> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;

  const query = [
    '[out:json][timeout:15];',
    '(',
    `node["name"]["shop"](${bboxStr});`,
    `node["name"]["amenity"](${bboxStr});`,
    `node["name"]["office"](${bboxStr});`,
    `node["name"]["tourism"](${bboxStr});`,
    ');',
    `out body ${limit};`,
  ].join('');

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      elements?: Array<{ id: number; lat: number; lon: number; tags: Record<string, string> }>;
    };

    return (data.elements ?? [])
      .filter((el) => el.lat && el.lon && el.tags?.name)
      .map((el) => {
        const cat =
          el.tags.amenity ??
          el.tags.shop ??
          el.tags.office ??
          el.tags.tourism ??
          'business';
        const style = resolvePoiStyle(cat);
        const addrParts = [
          el.tags['addr:housenumber'],
          el.tags['addr:street'],
          el.tags['addr:city'],
        ].filter(Boolean);
        return {
          id: String(el.id),
          lat: el.lat,
          lng: el.lon,
          name: el.tags.name,
          category: cat,
          categoryLabel: style.label,
          categoryColor: style.color,
          address: addrParts.length > 0 ? addrParts.join(', ') : undefined,
          phone: el.tags.phone ?? el.tags['contact:phone'] ?? undefined,
          openingHours: el.tags.opening_hours ?? undefined,
        };
      });
  } catch {
    return [];
  }
}

export async function fetchBusinessesNearPoint(
  lat: number,
  lng: number,
  radiusM = 3000,
  limit = 80
): Promise<PoiResult[]> {
  const around = `around:${radiusM},${lat},${lng}`;
  const query = [
    '[out:json][timeout:15];',
    '(',
    `node["name"]["shop"](${around});`,
    `node["name"]["amenity"](${around});`,
    `node["name"]["office"](${around});`,
    `node["name"]["tourism"](${around});`,
    ');',
    `out body ${limit};`,
  ].join('');

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      elements?: Array<{ id: number; lat: number; lon: number; tags: Record<string, string> }>;
    };

    return (data.elements ?? [])
      .filter((el) => el.lat && el.lon && el.tags?.name)
      .map((el) => {
        const cat =
          el.tags.amenity ??
          el.tags.shop ??
          el.tags.office ??
          el.tags.tourism ??
          'business';
        const style = resolvePoiStyle(cat);
        const addrParts = [
          el.tags['addr:housenumber'],
          el.tags['addr:street'],
          el.tags['addr:city'],
        ].filter(Boolean);
        return {
          id: String(el.id),
          lat: el.lat,
          lng: el.lon,
          name: el.tags.name,
          category: cat,
          categoryLabel: style.label,
          categoryColor: style.color,
          address: addrParts.length > 0 ? addrParts.join(', ') : undefined,
          phone: el.tags.phone ?? el.tags['contact:phone'] ?? undefined,
          openingHours: el.tags.opening_hours ?? undefined,
        };
      });
  } catch {
    return [];
  }
}
