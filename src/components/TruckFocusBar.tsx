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
  deliveryRound: string;
  fleetRoundFilter?: boolean;
  onSelectVehicle: (vehicleId: string) => void;
  onSelectRound: (round: string) => void;
  onClearFleetRoundFilter?: () => void;
  onClear: () => void;
}

function palletsOnRound(vehicle: VehicleChip, round: number): number {
  return (
    vehicle.loads?.find((load) => load.round === round)?.totals.pallets ?? 0
  );
}

export function TruckFocusBar({
  vehicles,
  selectedVehicleId,
  deliveryRound,
  fleetRoundFilter = false,
  onSelectVehicle,
  onSelectRound,
  onClearFleetRoundFilter,
  onClear,
}: TruckFocusBarProps) {
  const round = Number(deliveryRound) || 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Delivery round
        </p>
        {!selectedVehicleId && fleetRoundFilter && onClearFleetRoundFilter && (
          <button
            type="button"
            className="text-xs text-zinc-500 underline hover:text-zinc-800"
            onClick={onClearFleetRoundFilter}
          >
            All rounds
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["1", "2", "3", "4", "5", "6"].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={deliveryRound === value}
            onClick={() => onSelectRound(value)}
            className={`inline-flex items-center rounded-md border-2 px-2.5 py-1 text-xs font-medium transition ${
              deliveryRound === value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
            }`}
          >
            R{value}
          </button>
        ))}
      </div>

      {!selectedVehicleId && fleetRoundFilter && (
        <p className="text-xs text-blue-700">
          Showing orders assigned to R{deliveryRound} on all trucks
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Focus truck
        </p>
        {selectedVehicleId && (
          <button
            type="button"
            className="text-xs text-zinc-500 underline hover:text-zinc-800"
            onClick={onClear}
          >
            Show all trucks
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {vehicles.map((vehicle) => {
          const selected = selectedVehicleId === String(vehicle.id);
          const onTruck = palletsOnRound(vehicle, round);
          const loadPct = Math.min(
            100,
            Math.round((onTruck / Math.max(vehicle.maxPallets, 1)) * 100)
          );

          return (
            <button
              key={vehicle.id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onSelectVehicle(selected ? "" : String(vehicle.id))
              }
              className={`flex w-full flex-col gap-1.5 rounded-xl border-2 p-3 text-left transition ${
                selected
                  ? "border-blue-600 bg-blue-600 text-white shadow-md"
                  : "border-zinc-200 bg-white hover:border-blue-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={`truncate font-semibold ${
                      selected ? "text-white" : "text-zinc-900"
                    }`}
                  >
                    {vehicle.name}
                  </p>
                  <p
                    className={`text-xs ${
                      selected ? "text-blue-100" : "text-zinc-500"
                    }`}
                  >
                    {vehicle.plateNumber}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    selected
                      ? "bg-white/20 text-white"
                      : loadPct >= 90
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {onTruck.toFixed(0)}/{vehicle.maxPallets}
                </span>
              </div>
              <div
                className={`h-1.5 overflow-hidden rounded-full ${
                  selected ? "bg-blue-500" : "bg-zinc-200"
                }`}
              >
                <div
                  className={`h-full rounded-full ${
                    selected ? "bg-white" : loadPct >= 90 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${loadPct}%` }}
                />
              </div>
              {vehicle.assignedDriver && (
                <p
                  className={`truncate text-[11px] ${
                    selected ? "text-blue-100" : "text-zinc-500"
                  }`}
                >
                  {vehicle.assignedDriver.name}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
