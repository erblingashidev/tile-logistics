"use client";

import type {
  TruckRoundStatus,
  TruckWorkspaceSnapshot,
} from "@/lib/services/truck-workspace";
import { formatDeliveryRound } from "@/lib/delivery-rounds";

function statusClass(status: TruckRoundStatus, active: boolean) {
  if (active) return "border-blue-600 bg-blue-600 text-white";
  switch (status) {
    case "departed":
      return "border-blue-300 bg-blue-50 text-blue-900";
    case "ready":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "loading":
      return "border-amber-300 bg-amber-50 text-amber-900";
    default:
      return "border-zinc-200 bg-white text-zinc-600";
  }
}

interface TruckWorkspaceStatusProps {
  workspace: TruckWorkspaceSnapshot;
  activeRound?: number;
  compact?: boolean;
}

export function TruckWorkspaceStatus({
  workspace,
  activeRound,
  compact = false,
}: TruckWorkspaceStatusProps) {
  const suggested = workspace.suggestedRound;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {workspace.returningToWarehouse ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">
            Returning to warehouse
            {workspace.returningFromRound != null
              ? ` · finished round ${workspace.returningFromRound}`
              : ""}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            Prepare{" "}
            <span className="font-semibold">
              {formatDeliveryRound(workspace.prepRound, "compact")}
            </span>
            {workspace.prepOrderCount > 0
              ? ` (${workspace.prepOrderCount} order${workspace.prepOrderCount === 1 ? "" : "s"} assigned)`
              : " for the next trip"}
            . {workspace.suggestedReason}
          </p>
        </div>
      ) : null}

      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          workspace.onTheRoad
            ? "border-blue-200 bg-blue-50/80 text-blue-950"
            : "border-zinc-200 bg-zinc-50/80 text-zinc-800"
        }`}
      >
        <p className="font-medium">
          {workspace.onTheRoad
            ? `On the road · round ${workspace.onRoadRound}`
            : workspace.vehicleStatus === "returning"
              ? "Returning to warehouse"
              : "At warehouse"}
          {workspace.driverName ? (
            <span className="font-normal text-zinc-600">
              {" "}
              · Driver: {workspace.driverName}
              {workspace.driverStatus ? ` (${workspace.driverStatus})` : ""}
            </span>
          ) : null}
        </p>
        {!workspace.returningToWarehouse ? (
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            New assignments →{" "}
            <span className="font-semibold">
              {formatDeliveryRound(suggested, "compact")}
            </span>
            . {workspace.suggestedReason}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {workspace.rounds.map((round) => {
          const isSuggested = round.round === suggested;
          const isActive = activeRound === round.round;
          const isPrep =
            workspace.returningToWarehouse && round.round === workspace.prepRound;
          return (
            <div
              key={round.round}
              className={`inline-flex flex-col rounded-md border px-2 py-1 text-[11px] leading-tight ${statusClass(
                round.status,
                isActive || isSuggested || isPrep
              )}`}
              title={round.statusLabel}
            >
              <span className="font-semibold">
                R{round.round}
                {isPrep ? " · prep now" : isSuggested ? " · assign here" : ""}
              </span>
              <span className="opacity-90">
                {round.orderCount > 0
                  ? `${round.orderCount} ord · ${round.pallets.toFixed(1)} plt`
                  : "Empty"}
                {round.onTheRoad
                  ? " · on road"
                  : round.statusLabel
                    ? ` · ${round.statusLabel}`
                    : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { TruckWorkspaceSnapshot };
