import { distanceFromWarehouse } from "@/lib/locations";

export interface DispatchVehicle {
  id: number;
  name: string;
  plateNumber: string;
  maxPallets: number;
  maxWeightKg: number;
  status: string;
  notes?: string | null;
  hasCrane: boolean;
  costPerKm: number;
  usedPallets: number;
  usedWeightKg: number;
}

/** Relative €/km — crane is most expensive; sprinter cheapest. */
export function vehicleCostPerKm(vehicle: {
  name: string;
  maxPallets: number;
  maxWeightKg: number;
  notes?: string | null;
}): number {
  const name = vehicle.name.toLowerCase();
  const notes = vehicle.notes?.toLowerCase() ?? "";
  if (
    name.includes("crane") ||
    name.includes("krani") ||
    notes.includes("crane") ||
    notes.includes("krani")
  ) {
    return 2.4;
  }
  if (name.includes("sprinter")) return 0.85;
  if (name.includes("iveco")) return 1.05;
  if (name.includes("daf")) return 1.15;
  if (name.includes("atego")) return 1.2;
  return 1.1;
}

/** DAF is linehaul — do not auto-assign below this pallet count. */
export const DAF_MIN_PALLETS = 7;

export function isDafTruck(vehicle: { name: string }): boolean {
  return vehicle.name.toLowerCase().includes("daf");
}

export function dafMinPalletsForLoad(vehicle: { name: string }): number | null {
  if (!isDafTruck(vehicle)) return null;
  return DAF_MIN_PALLETS;
}

export function remainingPalletCapacity(v: DispatchVehicle): number {
  return Math.max(0, v.maxPallets - v.usedPallets);
}

export function remainingWeightCapacity(v: DispatchVehicle): number {
  return Math.max(0, v.maxWeightKg - v.usedWeightKg);
}

/** Crane trucks — name or notes (Krani = crane in Albanian). */
export function vehicleHasCrane(vehicle: {
  name: string;
  notes?: string | null;
}): boolean {
  const n = vehicle.name.toLowerCase();
  const notes = vehicle.notes?.toLowerCase() ?? "";
  return (
    n.includes("crane") ||
    n.includes("krani") ||
    notes.includes("crane") ||
    notes.includes("krani")
  );
}

function matchesCraneNeed(v: DispatchVehicle, requiresCrane: boolean): boolean {
  return requiresCrane ? v.hasCrane : !v.hasCrane;
}

export function vehicleFitsPallets(
  v: DispatchVehicle,
  pallets: number
): boolean {
  return pallets <= remainingPalletCapacity(v);
}

/** Pallet capacity is enforced; kg is advisory (same as manual assign). */
export function vehicleFitsLoad(
  v: DispatchVehicle,
  pallets: number,
  _weightKg: number
): boolean {
  return vehicleFitsPallets(v, pallets);
}

export interface RankVehiclesOptions {
  /** Use DAF when no other truck fits, even below DAF_MIN_PALLETS. */
  allowDafBelowMin?: boolean;
}

/** Skip DAF for small loads when any smaller truck can take the order. */
export function vehicleEligibleForRecommendation(
  v: DispatchVehicle,
  pallets: number,
  weightKg: number,
  requiresCrane: boolean,
  options?: RankVehiclesOptions
): boolean {
  if (v.status !== "available") return false;
  if (!vehicleFitsLoad(v, pallets, weightKg)) return false;
  if (!matchesCraneNeed(v, requiresCrane)) return false;

  const dafMin = dafMinPalletsForLoad(v);
  if (
    dafMin != null &&
    pallets < dafMin &&
    !options?.allowDafBelowMin
  ) {
    return false;
  }

  return true;
}

/** Prefer right-sized trucks; crane only when required. DAF reserved for 7+ pallets. */
export function rankVehiclesForLoad(
  vehicles: DispatchVehicle[],
  pallets: number,
  weightKg: number,
  requiresCrane: boolean,
  options?: RankVehiclesOptions
): DispatchVehicle[] {
  const available = vehicles.filter((v) =>
    vehicleEligibleForRecommendation(v, pallets, weightKg, requiresCrane, options)
  );

  if (requiresCrane) {
    return available.sort((a, b) => a.costPerKm - b.costPerKm);
  }

  return available.sort((a, b) => {
    // Smallest truck class first (Sprinter before Iveco before DAF).
    if (a.maxPallets !== b.maxPallets) return a.maxPallets - b.maxPallets;
    const wasteA = remainingPalletCapacity(a) - pallets;
    const wasteB = remainingPalletCapacity(b) - pallets;
    if (wasteA !== wasteB) return wasteA - wasteB;
    return a.costPerKm - b.costPerKm;
  });
}

export function explainNoStandardTruckCapacity(
  fleet: DispatchVehicle[],
  pallets: number
): string {
  const standard = fleet.filter((v) => !v.hasCrane && v.status === "available");
  const withPalletRoom = standard.filter((v) => vehicleFitsPallets(v, pallets));

  if (withPalletRoom.length === 0) {
    return `All standard trucks are full this round — need ${pallets} pallet space`;
  }

  const onlyDaf = withPalletRoom.every((v) => isDafTruck(v));
  if (onlyDaf && pallets < DAF_MIN_PALLETS) {
    return `Only DAF has pallet room left, but this load is ${pallets} plt (DAF reserved for ${DAF_MIN_PALLETS}+)`;
  }

  return "No standard truck capacity";
}

export function estimateRouteCostKm(
  vehicle: DispatchVehicle,
  stops: Array<{ lat: number; lng: number }>
): { totalKm: number; costScore: number } {
  if (stops.length === 0) return { totalKm: 0, costScore: 0 };

  let totalKm = distanceFromWarehouse(stops[0]);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    totalKm += R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  totalKm += distanceFromWarehouse(stops[stops.length - 1]);

  return {
    totalKm: Math.round(totalKm * 10) / 10,
    costScore: Math.round(totalKm * vehicle.costPerKm * 10) / 10,
  };
}
