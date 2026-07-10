/** Stable truck colors for map dispatch (cycle by vehicle id). */
export const TRUCK_COLOR_PALETTE = [
  "#2563eb",
  "#dc2626",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#c026d3",
  "#16a34a",
  "#ca8a04",
] as const;

export function truckColorForVehicle(vehicleId: number): string {
  return TRUCK_COLOR_PALETTE[(vehicleId - 1) % TRUCK_COLOR_PALETTE.length]!;
}
