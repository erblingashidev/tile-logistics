import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import { employees, orders } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import {
  isSalesAdmin,
  isSalesStaff,
} from "@/lib/employee-categories";
import {
  listEmployees,
  parseEmployeeRoles,
} from "@/lib/services/employees";
import { listOrders } from "@/lib/services/orders";
import { listStockSummary } from "@/lib/services/stock";

export function normalizePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseReferentiFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Referenti:\s*([^·\n]+)/i);
  return match?.[1]?.trim() ?? null;
}

export async function matchSalesEmployeeByAgentName(
  agentName: string
): Promise<number | null> {
  const target = normalizePersonName(agentName);
  if (!target) return null;

  const db = await getDb();
  const all = await dbAll(db.select().from(employees));

  for (const row of all) {
    const roles = parseEmployeeRoles(row.roles);
    if (!roles.some((r) => r === "sales_agent" || r === "sales_admin")) {
      continue;
    }
    if (normalizePersonName(row.name) === target) {
      return row.id;
    }
  }

  return null;
}

export async function resolveSalesOwnership(input: {
  salesAgentName?: string | null;
  salesEmployeeId?: number | null;
}) {
  let salesEmployeeId = input.salesEmployeeId ?? null;
  const salesAgentName = input.salesAgentName?.trim() || null;

  if (!salesEmployeeId && salesAgentName) {
    salesEmployeeId = await matchSalesEmployeeByAgentName(salesAgentName);
  }

  return { salesEmployeeId, salesAgentName };
}

export async function listSalesAgentsForAdmin(adminEmployeeId: number) {
  const db = await getDb();
  const directReports = await dbAll(
    db
      .select({ id: employees.id, name: employees.name, roles: employees.roles })
      .from(employees)
      .where(eq(employees.managerEmployeeId, adminEmployeeId))
  );

  const agents = directReports.filter((row) =>
    parseEmployeeRoles(row.roles).includes("sales_agent")
  );

  if (agents.length > 0) return agents;

  const all = await listEmployees();
  return all
    .filter((e) => e.roles.includes("sales_agent"))
    .map((e) => ({ id: e.id, name: e.name, roles: JSON.stringify(e.roles) }));
}

export type SalesPortalOrderFilters = {
  search?: string;
  hideDelivered?: boolean;
  salesAgentId?: number;
};

function assertSalesPortalAccess(session: SessionUser) {
  if (session.role === "employee" && isSalesStaff(session.roles)) return true;
  return false;
}

export async function listOrdersForSalesPortal(
  session: SessionUser,
  filters: SalesPortalOrderFilters = {}
) {
  if (!assertSalesPortalAccess(session)) {
    throw new Error("Forbidden");
  }

  if (session.role !== "employee") {
    throw new Error("Forbidden");
  }

  const listFilters: Parameters<typeof listOrders>[0] = {
    search: filters.search,
    hideDelivered: filters.hideDelivered,
  };

  if (isSalesAdmin(session.roles)) {
    if (filters.salesAgentId != null && Number.isFinite(filters.salesAgentId)) {
      listFilters.salesEmployeeId = filters.salesAgentId;
    }
    const rows = await listOrders(listFilters);
    return enrichSalesOrderRows(rows);
  }

  const rows = await listOrders(listFilters);
  const owned = rows.filter(
    (order) =>
      order.salesEmployeeId === session.employeeId ||
      (order.salesAgentName &&
        normalizePersonName(order.salesAgentName) ===
          normalizePersonName(session.name))
  );
  return enrichSalesOrderRows(owned);
}

async function enrichSalesOrderRows<
  T extends {
    salesEmployeeId?: number | null;
    salesAgentName?: string | null;
    notes?: string | null;
  },
>(rows: T[]) {
  const db = await getDb();
  const ids = [
    ...new Set(
      rows
        .map((row) => row.salesEmployeeId)
        .filter((id): id is number => id != null)
    ),
  ];

  const nameById = new Map<number, string>();
  if (ids.length > 0) {
    const agentRows = await dbAll(
      db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(inArray(employees.id, ids))
    );
    for (const row of agentRows) {
      nameById.set(row.id, row.name);
    }
  }

  return rows.map((row) => ({
    ...row,
    salesAgentDisplayName:
      (row.salesEmployeeId != null
        ? nameById.get(row.salesEmployeeId)
        : null) ??
      row.salesAgentName ??
      parseReferentiFromNotes(row.notes),
  }));
}

export async function listStockForSalesPortal(session: SessionUser) {
  if (!assertSalesPortalAccess(session)) {
    throw new Error("Forbidden");
  }
  return listStockSummary();
}

export async function backfillOrderSalesOwnership() {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        id: orders.id,
        notes: orders.notes,
        salesEmployeeId: orders.salesEmployeeId,
        salesAgentName: orders.salesAgentName,
      })
      .from(orders)
  );

  for (const row of rows) {
    if (row.salesEmployeeId != null && row.salesAgentName) continue;

    const referenti =
      row.salesAgentName ?? parseReferentiFromNotes(row.notes ?? null);
    if (!referenti && row.salesEmployeeId == null) continue;

    const resolved = await resolveSalesOwnership({
      salesAgentName: referenti,
      salesEmployeeId: row.salesEmployeeId,
    });

    if (
      resolved.salesEmployeeId === row.salesEmployeeId &&
      resolved.salesAgentName === row.salesAgentName
    ) {
      continue;
    }

    await db
      .update(orders)
      .set({
        salesEmployeeId: resolved.salesEmployeeId,
        salesAgentName: resolved.salesAgentName,
      })
      .where(eq(orders.id, row.id));
  }
}
