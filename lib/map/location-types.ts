import {
  Building,
  Building2,
  Bus,
  Factory,
  Fuel,
  GraduationCap,
  Hospital,
  Hotel,
  Landmark,
  MapPin,
  Plane,
  Ship,
  Store,
  TrainFront,
  Truck,
  Utensils,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type SavedLocationTypeOption = {
  value: string;
  label: string;
  icon: LucideIcon;
  /** Hex color used for marker rendering. */
  color: string;
};

export const SAVED_LOCATION_TYPES: SavedLocationTypeOption[] = [
  { value: "office", label: "Office", icon: Building2, color: "#2563EB" },
  { value: "warehouse", label: "Warehouse", icon: Warehouse, color: "#B45309" },
  { value: "airport", label: "Airport", icon: Plane, color: "#0EA5E9" },
  { value: "railway_station", label: "Railway Station", icon: TrainFront, color: "#7C3AED" },
  { value: "bus_terminal", label: "Bus Terminal", icon: Bus, color: "#D97706" },
  { value: "seaport", label: "Seaport", icon: Ship, color: "#0891B2" },
  { value: "filling_station", label: "Filling Station", icon: Fuel, color: "#DC2626" },
  { value: "client_site", label: "Customer Site", icon: MapPin, color: "#16A34A" },
  { value: "service_center", label: "Service Center", icon: Wrench, color: "#4B5563" },
  { value: "distribution_center", label: "Distribution Center", icon: Truck, color: "#9333EA" },
  { value: "hospital", label: "Hospital", icon: Hospital, color: "#E11D48" },
  { value: "school", label: "School", icon: GraduationCap, color: "#0D9488" },
  { value: "hotel", label: "Hotel", icon: Hotel, color: "#CA8A04" },
  { value: "restaurant", label: "Restaurant", icon: Utensils, color: "#EA580C" },
  { value: "government_office", label: "Government Office", icon: Landmark, color: "#1D4ED8" },
  { value: "retail_store", label: "Retail Store", icon: Store, color: "#DB2777" },
  { value: "other", label: "Other", icon: Building, color: "#64748B" },
];

const TYPE_MAP: Record<string, SavedLocationTypeOption> = SAVED_LOCATION_TYPES.reduce(
  (acc, option) => {
    acc[option.value] = option;
    return acc;
  },
  {} as Record<string, SavedLocationTypeOption>
);

const FALLBACK: SavedLocationTypeOption = TYPE_MAP.other ?? {
  value: "other",
  label: "Other",
  icon: Factory,
  color: "#64748B",
};

export function getSavedLocationType(type: string | null | undefined): SavedLocationTypeOption {
  if (!type) return FALLBACK;
  return TYPE_MAP[type] ?? FALLBACK;
}

export function getSavedLocationLabel(type: string | null | undefined): string {
  return getSavedLocationType(type).label;
}

export function getSavedLocationColor(type: string | null | undefined): string {
  return getSavedLocationType(type).color;
}

/**
 * Builds a DOM marker element for Mapbox/Google custom markers.
 * @deprecated Use `createSavedLocationMarkerElement` from `@/lib/map/saved-location-marker`.
 */
export { createSavedLocationMarkerElement } from "@/lib/map/saved-location-marker";
