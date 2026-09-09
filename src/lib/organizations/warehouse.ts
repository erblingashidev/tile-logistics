import {
  LEGACY_AGIMI_WAREHOUSE,
  type CompanyWarehouse,
} from "@/lib/company-profile";
import type { LocationEntry } from "@/lib/locations/kosovo-locations";
import { LEGACY_AGIMI_ORGANIZATION_ID } from "@/lib/organizations/constants";
import { searchLocations } from "@/lib/locations";

export { LEGACY_AGIMI_WAREHOUSE };

export const DEFAULT_WAREHOUSE_COORDS = {
  lat: 42.6629,
  lng: 21.1655,
  city: "Prishtinë",
} as const;

export function companyWarehouseToLocationEntry(
  organizationId: number,
  warehouse: CompanyWarehouse
): LocationEntry {
  return {
    id: `org-${organizationId}-warehouse`,
    name: warehouse.name,
    city: warehouse.city ?? "",
    region: warehouse.city ?? "",
    type: "warehouse",
    lat: warehouse.lat,
    lng: warehouse.lng,
  };
}

/** Guess map coordinates from city / address text when lat/lng are not provided. */
export function inferWarehouseCoordinates(input: {
  city?: string;
  address?: string;
}): { lat: number; lng: number; city?: string } {
  const query = [input.city, input.address].filter(Boolean).join(" ").trim();
  if (query) {
    const match = searchLocations(query, 1)[0];
    if (match) {
      return { lat: match.lat, lng: match.lng, city: match.city };
    }
  }
  return { ...DEFAULT_WAREHOUSE_COORDS };
}

export function warehouseOsmUrl(
  warehouse: { lat: number; lng: number },
  zoom = 17
): string {
  return `https://www.openstreetmap.org/?mlat=${warehouse.lat}&mlon=${warehouse.lng}#map=${zoom}/${warehouse.lat}/${warehouse.lng}`;
}

export function resolveProfileWarehouse(
  organizationId: number,
  warehouse?: CompanyWarehouse
): CompanyWarehouse {
  if (warehouse?.name && Number.isFinite(warehouse.lat) && Number.isFinite(warehouse.lng)) {
    return warehouse;
  }
  if (organizationId === LEGACY_AGIMI_ORGANIZATION_ID) {
    return { ...LEGACY_AGIMI_WAREHOUSE };
  }
  return {
    name: "Main warehouse",
    address: warehouse?.address ?? "",
    city: warehouse?.city ?? DEFAULT_WAREHOUSE_COORDS.city,
    lat: warehouse?.lat ?? DEFAULT_WAREHOUSE_COORDS.lat,
    lng: warehouse?.lng ?? DEFAULT_WAREHOUSE_COORDS.lng,
  };
}
