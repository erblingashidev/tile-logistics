/** Shared org ids — safe for edge middleware (no DB imports). */
export const DEFAULT_ORGANIZATION_ID = 1;

/** Org id for the original AGIMI tenant (same URL pattern as every other company: /agimi/…). */
export const LEGACY_AGIMI_ORGANIZATION_ID = 1;
export const LEGACY_AGIMI_SLUG = "agimi";
export const LEGACY_AGIMI_NAME = "AGIMI COM SHPK";

export function isLegacyAgimiOrganization(
  organizationId?: number | null
): boolean {
  return (
    organizationId == null || organizationId === LEGACY_AGIMI_ORGANIZATION_ID
  );
}
