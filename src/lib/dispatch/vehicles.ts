import { distanceFromWarehouse, distanceKm } from "@/lib/locations";

export interface DispatchVehicle {
  id: number;
  name: string;
  plateNumber: string;
  maxPallets: number;
  maxWeightKg: number;
  status: string;
  notes?: string | null;
  costPerKm: number;
  usedPallets: number;
  usedWeightKg: number;
}

/** Relative €/km by truck size — used only for ranking, not billing. */
export function vehicleCostPerKm(vehicle: {
  name: string;
  maxPallets: number;
}): number {
  if (vehicle.maxPallets >= 14) return 1.3;
  if (vehicle.maxPallets >= 10) return 1.15;
  if (vehicle.maxPallets >= 7) return 1.05;
  return 0.9;
}

export function remainingPalletCapacity(v: DispatchVehicle): number {
  return Math.max(0, v.maxPallets - v.usedPallets);
}

export function remainingWeightCapacity(v: DispatchVehicle): number {
  return Math.max(0, v.maxWeightKg - v.usedWeightKg);
}

export function vehicleFitsPallets(
  v: DispatchVehicle,
  pallets: number
): boolean {
  return pallets <= remainingPalletCapacity(v);
}

/** Pallet capacity is hard; kg is advisory (same as manual assign). */
export function vehicleFitsLoad(
  v: DispatchVehicle,
  pallets: number,
  _weightKg: number
): boolean {
  return vehicleFitsPallets(v, pallets);
}

export function vehicleEligibleForRecommendation(
  v: DispatchVehicle,
  pallets: number,
  weightKg: number
): boolean {
  if (v.status !== "available") return false;
  return vehicleFitsLoad(v, pallets, weightKg);
}

/**
 * Rank trucks by capacity fit only:
 * smallest truck that fits → least wasted pallet slots → lower cost/km.
 */
export function rankVehiclesForLoad(
  vehicles: DispatchVehicle[],
  pallets: number,
  weightKg: number
): DispatchVehicle[] {
  return vehicles
    .filter((v) => vehicleEligibleForRecommendation(v, pallets, weightKg))
    .sort((a, b) => {
      if (a.maxPallets !== b.maxPallets) return a.maxPallets - b.maxPallets;
      const wasteA = remainingPalletCapacity(a) - pallets;
      const wasteB = remainingPalletCapacity(b) - pallets;
      if (wasteA !== wasteB) return wasteA - wasteB;
      return a.costPerKm - b.costPerKm;
    });
}

export function explainNoTruckCapacity(
  fleet: DispatchVehicle[],
  pallets: number
): string {
  const available = fleet.filter((v) => v.status === "available");
  if (available.length === 0) return "No available trucks this round";
  const withRoom = available.filter((v) => vehicleFitsPallets(v, pallets));
  if (withRoom.length === 0) {
    return `All trucks are full this round — need ${pallets} pallet space`;
  }
  return "No truck capacity";
}

export function estimateRouteCostKm(
  vehicle: DispatchVehicle,
  stops: Array<{ lat: number; lng: number }>
): { totalKm: number; costScore: number } {
  if (stops.length === 0) return { totalKm: 0, costScore: 0 };

  let totalKm = distanceFromWarehouse(stops[0]);
  for (let i = 1; i < stops.length; i++) {
    totalKm += distanceKm(stops[i - 1], stops[i]);
  }
  totalKm += distanceFromWarehouse(stops[stops.length - 1]);

  return {
    totalKm: Math.round(totalKm * 10) / 10,
    costScore: Math.round(totalKm * vehicle.costPerKm * 10) / 10,
  };
}
