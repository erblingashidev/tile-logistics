import { BRAND } from "@/lib/brand";

/** Shared org ids — safe for edge middleware (no DB imports). */
export const DEFAULT_ORGANIZATION_ID = 1;

/** Primary tenant — existing orders, staff, and settings stay on this org. */
export const LEGACY_AGIMI_ORGANIZATION_ID = 1;
export const LEGACY_AGIMI_SLUG = "default";
export const LEGACY_AGIMI_NAME = BRAND.name;

export function isLegacyAgimiOrganization(
  organizationId?: number | null
): boolean {
  return (
    organizationId == null || organizationId === LEGACY_AGIMI_ORGANIZATION_ID
  );
}
