/**
 * Focused dispatch grouping checks — run with: npx tsx scripts/test-dispatch-grouping.ts
 */
import assert from "node:assert/strict";
import {
  clusterStopsForDispatch,
  mergeSameCityGroups,
} from "../src/lib/services/dispatch-planning";
import { rankVehiclesForLoad } from "../src/lib/dispatch/vehicles";

function assertEqual<T>(actual: T, expected: T, label: string) {
  assert.deepEqual(actual, expected, label);
}

// Prizren-area coordinates (approximate, within same municipality)
const PRIZREN_A = { lat: 42.214, lng: 20.74 };
const PRIZREN_B = { lat: 42.218, lng: 20.745 };
const PRIZREN_C = { lat: 42.211, lng: 20.735 };

// --- mergeSameCityGroups: 3 Prizren groups → 1 ---
{
  const groups = mergeSameCityGroups(
    [
      [{ id: 1, ...PRIZREN_A, region: "Prizren", city: "Prizren" }],
      [{ id: 2, ...PRIZREN_B, region: "Prizren", city: "Prizren" }],
      [{ id: 3, ...PRIZREN_C, region: "Prizren", city: "Prizren" }],
    ],
    6
  );
  assert.equal(groups.length, 1, "three same-city groups merge to one");
  assert.equal(groups[0].length, 3, "merged group has all three stops");
}

// --- clusterStopsForDispatch: same city stays on one truck ---
{
  const stops = [
    {
      id: 10,
      ...PRIZREN_A,
      region: "Prizren",
      city: "Prizren",
      totalPallets: 1,
    },
    {
      id: 11,
      ...PRIZREN_B,
      region: "Prizren",
      city: "Prizren",
      totalPallets: 2,
    },
    {
      id: 12,
      ...PRIZREN_C,
      region: "Prizren",
      city: "Prizren",
      totalPallets: 1,
    },
  ];

  let groups = clusterStopsForDispatch(stops, {
    maxOrders: 6,
    maxDistanceKm: 30,
    regionMaxDistanceKm: 45,
  });
  groups = mergeSameCityGroups(groups, 6);

  assert.equal(groups.length, 1, "all Prizren stops on one truck");
  assertEqual(
    groups[0].map((s) => s.id).sort(),
    [10, 11, 12],
    "all order ids present"
  );
}

// --- rankVehiclesForLoad: smallest fitting truck wins ---
{
  const fleet = [
    {
      id: 1,
      name: "Big",
      plateNumber: "A",
      maxPallets: 14,
      maxWeightKg: 20000,
      status: "available",
      costPerKm: 1.3,
      usedPallets: 0,
      usedWeightKg: 0,
    },
    {
      id: 2,
      name: "Small",
      plateNumber: "B",
      maxPallets: 6,
      maxWeightKg: 8000,
      status: "available",
      costPerKm: 0.9,
      usedPallets: 0,
      usedWeightKg: 0,
    },
  ];
  const ranked = rankVehiclesForLoad(fleet, 4, 1000);
  assert.equal(ranked[0]?.id, 2, "prefer smaller truck that fits");
}

console.log("All dispatch grouping checks passed.");
