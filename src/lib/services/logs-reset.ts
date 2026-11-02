import { eq } from "drizzle-orm";
import { getControlPlaneDb, getDb } from "@/lib/db";
import {
  activityLogs,
  adminRegisterAuditLog,
} from "@/lib/db/schema";

export async function clearOrganizationLogs(organizationId: number) {
  const tenantDb = await getDb();
  const controlDb = await getControlPlaneDb();

  const activityDeleted = await tenantDb
    .delete(activityLogs)
    .where(eq(activityLogs.organizationId, organizationId));

  const registerAuditDeleted = await controlDb
    .delete(adminRegisterAuditLog)
    .where(eq(adminRegisterAuditLog.organizationId, organizationId));

  return {
    activityLogsDeleted: activityDeleted.rowsAffected ?? 0,
    registerAuditDeleted: registerAuditDeleted.rowsAffected ?? 0,
  };
}
