"use client";

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
import { getSavedLocationType } from "@/lib/map/location-types";

const ICON_BY_TYPE: Record<string, LucideIcon> = {
  office: Building2,
  warehouse: Warehouse,
  airport: Plane,
  railway_station: TrainFront,
  bus_terminal: Bus,
  seaport: Ship,
  filling_station: Fuel,
  client_site: MapPin,
  service_center: Wrench,
  distribution_center: Truck,
  hospital: Hospital,
  school: GraduationCap,
  hotel: Hotel,
  restaurant: Utensils,
  government_office: Landmark,
  retail_store: Store,
  other: Building,
};

export function SavedLocationTypeIcon({
  type,
  size = 16,
  className,
}: {
  type?: string | null;
  size?: number;
  className?: string;
}) {
  const option = getSavedLocationType(type);
  const Icon = ICON_BY_TYPE[option.value] ?? Factory;
  return <Icon size={size} className={className} aria-hidden />;
}
