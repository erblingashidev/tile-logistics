/** Platform product name — not the tenant company name. */
const platformName =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Logistics Core";

export const BRAND = {
  name: platformName,
  shortName: platformName,
  tagline: "Warehouse, fleet & delivery platform",
} as const;
