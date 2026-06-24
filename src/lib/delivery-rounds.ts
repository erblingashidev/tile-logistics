import { DELIVERY_ROUNDS, type DeliveryRound } from "@/lib/constants";

/** Human-readable trip labels — round = one outbound trip for a truck. */
export const DELIVERY_ROUND_LABELS: Record<DeliveryRound, string> = {
  1: "1st trip — morning run",
  2: "2nd trip — after truck returns",
  3: "3rd trip",
  4: "4th trip",
  5: "5th trip",
};

export const DELIVERY_ROUND_SHORT_LABELS: Record<DeliveryRound, string> = {
  1: "Morning",
  2: "After return",
  3: "3rd trip",
  4: "4th trip",
  5: "5th trip",
};

export function formatDeliveryRound(
  round: number,
  style: "label" | "short" | "compact" = "label"
): string {
  const r = DELIVERY_ROUNDS.includes(round as DeliveryRound)
    ? (round as DeliveryRound)
    : 1;

  if (style === "compact") {
    return `R${r}`;
  }

  const text =
    style === "short"
      ? DELIVERY_ROUND_SHORT_LABELS[r]
      : DELIVERY_ROUND_LABELS[r];

  return `Round ${r} · ${text}`;
}

export function deliveryRoundSelectOptions(): Array<{
  value: DeliveryRound;
  label: string;
}> {
  return DELIVERY_ROUNDS.map((round) => ({
    value: round,
    label: formatDeliveryRound(round),
  }));
}
