export const RETURN_CONDITIONS = ["untouched", "chipped", "broken"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  untouched: "Untouched",
  chipped: "Chipped",
  broken: "Broken",
};

export function isReturnCondition(value: string): value is ReturnCondition {
  return (RETURN_CONDITIONS as readonly string[]).includes(value);
}

/** Warehouse bin for returned stock by condition. */
export function returnLocationCode(condition: ReturnCondition): string {
  if (condition === "untouched") return "RETURNS-SELLABLE";
  return "RETURNS-DAMAGED";
}
