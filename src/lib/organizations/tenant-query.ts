import { eq, type Column, type SQL } from "drizzle-orm";
import { resolveTenantOrganizationId } from "@/lib/organizations/tenant-context";

/** Drizzle condition: row belongs to the current tenant (from session / headers). */
export async function forCurrentOrganization(
  organizationIdColumn: Column
): Promise<SQL> {
  const orgId = await resolveTenantOrganizationId();
  return eq(organizationIdColumn, orgId);
}
