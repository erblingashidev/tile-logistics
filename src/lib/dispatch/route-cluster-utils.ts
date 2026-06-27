import { distanceKm } from "@/lib/locations";

/** Max straight-line km between any two stops in a group. */
export function groupSpreadKm(
  group: Array<{ lat: number; lng: number }>
): number {
  if (group.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      max = Math.max(max, distanceKm(group[i], group[j]));
    }
  }
  return max;
}
