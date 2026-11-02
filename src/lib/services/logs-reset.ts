import { eq } from "drizzle-orm";
import { getControlPlaneDb, getDb } from "@/lib/db";
import {
  activityLogs,
  adminRegisterAuditLog,
  adminRegisterSessions,
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

  /** Shift close results (closed/open register sessions); ledger lines stay, session link cleared. */
  const registerSessionsDeleted = await controlDb
    .delete(adminRegisterSessions)
    .where(eq(adminRegisterSessions.organizationId, organizationId));

  return {
    activityLogsDeleted: activityDeleted.rowsAffected ?? 0,
    registerAuditDeleted: registerAuditDeleted.rowsAffected ?? 0,
    registerSessionsDeleted: registerSessionsDeleted.rowsAffected ?? 0,
  };
}
