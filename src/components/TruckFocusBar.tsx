"use client";

interface VehicleChip {
  id: number;
  name: string;
  plateNumber: string;
  maxPallets: number;
  assignedDriver?: { name: string } | null;
  loads?: Array<{
    round: number;
    totals: { pallets: number; weightKg: number };
  }>;
}

interface TruckFocusBarProps {
  vehicles: VehicleChip[];
  selectedVehicleId: string;
  deliveryRound?: string;
  fleetRoundFilter?: boolean;
  onSelectVehicle: (vehicleId: string) => void;
  onSelectRound?: (round: string) => void;
  onClearFleetRoundFilter?: () => void;
  onClear: () => void;
}

function palletsOnTruck(vehicle: VehicleChip): number {
  return (
    vehicle.loads?.find((load) => load.round === 1)?.totals.pallets ??
    vehicle.loads?.[0]?.totals.pallets ??
    0
  );
}

export function TruckFocusBar({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  onClear,
}: TruckFocusBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Focus truck
        </p>
        {selectedVehicleId && (
          <button
            type="button"
            className="text-xs text-zinc-500 underline hover:text-zinc-800"
            onClick={onClear}
          >
            Clear focus
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {vehicles.map((vehicle) => {
          const selected = selectedVehicleId === String(vehicle.id);
          const onTruck = palletsOnTruck(vehicle);
          const max = vehicle.maxPallets ?? 0;
          return (
            <button
              key={vehicle.id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onSelectVehicle(selected ? "" : String(vehicle.id))
              }
              className={`inline-flex min-w-[7rem] flex-col rounded-lg border-2 px-2.5 py-2 text-left transition ${
                selected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400"
              }`}
            >
              <span className="text-xs font-semibold">{vehicle.name}</span>
              <span
                className={`text-[10px] ${selected ? "text-blue-100" : "text-zinc-500"}`}
              >
                {vehicle.plateNumber}
                {vehicle.assignedDriver?.name
                  ? ` · ${vehicle.assignedDriver.name}`
                  : ""}
              </span>
              {max > 0 && (
                <span
                  className={`mt-1 text-[10px] ${selected ? "text-blue-100" : "text-zinc-500"}`}
                >
                  {onTruck.toFixed(1)} / {max} plt on truck
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
