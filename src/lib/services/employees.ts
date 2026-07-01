import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  assignments,
  employees,
  orderEmployeeAssignments,
  orders,
  vehicles,
} from "@/lib/db/schema";
import {
  EMPLOYEE_ROLE_LABELS,
  EMPLOYEE_STATUSES,
  type EmployeeRole,
} from "@/lib/constants";
import { logActivity } from "@/lib/logger";
import { hashPassword } from "@/lib/auth/password";
import {
  clearEmployeeWarehouseZones,
  getEmployeeWarehouseZones,
  setEmployeeWarehouseZones,
} from "@/lib/services/warehouse-zones";
import {
  employeeCreatedMessage,
  employeeDeletedMessage,
  employeeStaffAssignedMessage,
  employeeStaffUnassignedMessage,
  employeeStatusMessage,
  employeeUpdatedMessage,
  formatStatusLabel,
} from "@/lib/log-messages";

export interface EmployeePayload {
  name: string;
  status?: string;
  roles: EmployeeRole[];
  assignedVehicleId?: number | null;
  username?: string | null;
  password?: string | null;
  notes?: string;
  warehouseZones?: string[];
}

async function enrichEmployeeRow(
  row: typeof employees.$inferSelect,
  assignments: Awaited<ReturnType<typeof getEmployeeActiveAssignments>>
) {
  const roles = parseEmployeeRoles(row.roles);
  const db = await getDb();
  let assignedVehicle: {
    id: number;
    name: string;
    plateNumber: string;
  } | null = null;
  if (row.assignedVehicleId) {
    const v = await dbOne(
      db
        .select({
          id: vehicles.id,
          name: vehicles.name,
          plateNumber: vehicles.plateNumber,
        })
        .from(vehicles)
        .where(eq(vehicles.id, row.assignedVehicleId))
    );
    assignedVehicle = v ?? null;
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    notes: row.notes,
    assignedVehicleId: row.assignedVehicleId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    roles,
    assignedVehicle,
    assignments,
    warehouseZones: await getEmployeeWarehouseZones(row.id),
    hasLogin: Boolean(row.username && row.passwordHash),
    username: row.username ?? null,
  };
}

/** Driver permanently assigned to this truck (set on Employees page). */
export async function getDriverForVehicle(vehicleId: number) {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select()
      .from(employees)
      .where(eq(employees.assignedVehicleId, vehicleId))
  );
  const driver = rows.find((e) =>
    parseEmployeeRoles(e.roles).includes("driver")
  );
  if (!driver) return null;
  return {
    id: driver.id,
    name: driver.name,
    status: driver.status,
  };
}

export function parseEmployeeRoles(rolesJson: string): EmployeeRole[] {
  try {
    const parsed = JSON.parse(rolesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is EmployeeRole => typeof r === "string" && r in EMPLOYEE_ROLE_LABELS
    );
  } catch {
    return [];
  }
}

export function serializeEmployeeRoles(roles: EmployeeRole[]): string {
  return JSON.stringify(roles);
}

async function getEmployeeActiveAssignments(employeeId: number) {
  const db = await getDb();

  const staffRows = await dbAll(
    db
      .select({
        orderId: orderEmployeeAssignments.orderId,
        role: orderEmployeeAssignments.role,
        assignedAt: orderEmployeeAssignments.assignedAt,
        invoiceNumber: orders.invoiceNumber,
        customerName: orders.customerName,
        orderStatus: orders.status,
        region: orders.region,
        vehicleName: vehicles.name,
        plateNumber: vehicles.plateNumber,
        deliveryRound: assignments.deliveryRound,
      })
      .from(orderEmployeeAssignments)
      .innerJoin(orders, eq(orderEmployeeAssignments.orderId, orders.id))
      .leftJoin(assignments, eq(assignments.orderId, orders.id))
      .leftJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
      .where(eq(orderEmployeeAssignments.employeeId, employeeId))
  );

  const driverRows = await dbAll(
    db
      .select({
        orderId: assignments.orderId,
        role: sql<string>`'driver'`,
        assignedAt: assignments.assignedAt,
        invoiceNumber: orders.invoiceNumber,
        customerName: orders.customerName,
        orderStatus: orders.status,
        region: orders.region,
        deliveryRound: assignments.deliveryRound,
        vehicleName: vehicles.name,
        plateNumber: vehicles.plateNumber,
      })
      .from(assignments)
      .innerJoin(orders, eq(assignments.orderId, orders.id))
      .innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
      .where(eq(assignments.driverEmployeeId, employeeId))
  );

  type AssignmentRow = (typeof staffRows)[number];
  const merged = new Map<string, AssignmentRow>();

  for (const row of [...staffRows, ...driverRows]) {
    const key = `${row.orderId}-${row.role}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
      continue;
    }
    merged.set(key, {
      ...prev,
      assignedAt:
        row.assignedAt > prev.assignedAt ? row.assignedAt : prev.assignedAt,
      vehicleName: row.vehicleName ?? prev.vehicleName,
      plateNumber: row.plateNumber ?? prev.plateNumber,
      deliveryRound: row.deliveryRound ?? prev.deliveryRound,
    });
  }

  return [...merged.values()].sort((a, b) =>
    b.assignedAt.localeCompare(a.assignedAt)
  );
}

export async function listEmployees(roleFilter?: EmployeeRole) {
  const db = await getDb();
  const rows = await dbAll(
    db.select().from(employees).orderBy(desc(employees.updatedAt))
  );
  const enriched = await Promise.all(
    rows.map(async (e) =>
      enrichEmployeeRow(e, await getEmployeeActiveAssignments(e.id))
    )
  );
  return enriched.filter((e) => !roleFilter || e.roles.includes(roleFilter));
}

export async function getEmployee(id: number) {
  const db = await getDb();
  const row = await dbOne(
    db.select().from(employees).where(eq(employees.id, id))
  );
  if (!row) return null;
  return enrichEmployeeRow(row, await getEmployeeActiveAssignments(id));
}

export async function listEmployeesByRole(role: EmployeeRole) {
  const all = await listEmployees(role);
  return all.filter((e) => e.roles.includes(role));
}

export async function createEmployee(payload: EmployeePayload) {
  const db = await getDb();
  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(employees)
      .values({
        name: payload.name,
        status: payload.status ?? "available",
        roles: serializeEmployeeRoles(payload.roles),
        username: payload.username?.trim().toLowerCase() || null,
        passwordHash: payload.password
          ? hashPassword(payload.password)
          : null,
        notes: payload.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: employees.id })
  );

  if (!inserted) throw new Error("Failed to create employee");

  const id = inserted.id;
  if (
    payload.assignedVehicleId &&
    payload.roles.includes("driver")
  ) {
    await setDriverVehicle(id, payload.assignedVehicleId);
  }
  if (payload.roles.includes("group_leader")) {
    await setEmployeeWarehouseZones(
      id,
      payload.warehouseZones ?? [],
      payload.name
    );
  } else {
    await clearEmployeeWarehouseZones(id);
  }
  await logActivity(
    "create",
    "employee",
    id,
    employeeCreatedMessage(
      payload.name,
      payload.roles.map((r) => EMPLOYEE_ROLE_LABELS[r])
    ),
    {
      category: "employees",
      details: { name: payload.name, roles: payload.roles },
    }
  );
  return getEmployee(id);
}

async function setDriverVehicle(employeeId: number, vehicleId: number | null) {
  const db = await getDb();
  const now = new Date().toISOString();
  if (vehicleId) {
    await db
      .update(employees)
      .set({ assignedVehicleId: null, updatedAt: now })
      .where(eq(employees.assignedVehicleId, vehicleId));
  }
  await db
    .update(employees)
    .set({ assignedVehicleId: vehicleId, updatedAt: now })
    .where(eq(employees.id, employeeId));
}

export async function updateEmployee(id: number, payload: Partial<EmployeePayload>) {
  const db = await getDb();
  const existing = await getEmployee(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextRoles = payload.roles ?? existing.roles;
  const nextStatus = payload.status ?? existing.status;
  const isDriver = nextRoles.includes("driver");
  const passwordHash =
    payload.password != null && payload.password !== ""
      ? hashPassword(payload.password)
      : undefined;

  await db
    .update(employees)
    .set({
      name: payload.name ?? existing.name,
      status: nextStatus,
      roles: serializeEmployeeRoles(nextRoles),
      notes: payload.notes ?? existing.notes,
      username:
        payload.username !== undefined
          ? payload.username?.trim().toLowerCase() || null
          : existing.username,
      ...(passwordHash ? { passwordHash } : {}),
      updatedAt: now,
    })
    .where(eq(employees.id, id));

  if (payload.assignedVehicleId !== undefined) {
    await setDriverVehicle(id, isDriver ? payload.assignedVehicleId : null);
  } else if (payload.roles && !isDriver) {
    await setDriverVehicle(id, null);
  }

  if (payload.roles) {
    if (nextRoles.includes("group_leader")) {
      await setEmployeeWarehouseZones(
        id,
        payload.warehouseZones ?? existing.warehouseZones ?? [],
        existing.name
      );
    } else {
      await clearEmployeeWarehouseZones(id);
    }
  } else if (payload.warehouseZones && nextRoles.includes("group_leader")) {
    await setEmployeeWarehouseZones(
      id,
      payload.warehouseZones,
      existing.name
    );
  }

  if (payload.status != null && payload.status !== existing.status) {
    await logActivity(
      "status_change",
      "employee",
      id,
      employeeStatusMessage(existing.name, existing.status, nextStatus),
      {
        category: "employees",
        details: { name: existing.name, from: existing.status, to: nextStatus },
      }
    );
  }

  const changes: string[] = [];
  if (payload.name && payload.name !== existing.name) {
    changes.push(`name → ${payload.name}`);
  }
  if (payload.roles) {
    const added = payload.roles.filter((r) => !existing.roles.includes(r));
    const removed = existing.roles.filter((r) => !payload.roles!.includes(r));
    if (added.length) changes.push(`roles added: ${added.map((r) => EMPLOYEE_ROLE_LABELS[r]).join(", ")}`);
    if (removed.length) changes.push(`roles removed: ${removed.map((r) => EMPLOYEE_ROLE_LABELS[r]).join(", ")}`);
  }
  if (payload.notes != null && payload.notes !== (existing.notes ?? "")) {
    changes.push("notes updated");
  }
  if (payload.assignedVehicleId !== undefined) {
    if (payload.assignedVehicleId) {
      const v = await dbOne(
        db
          .select({ name: vehicles.name, plateNumber: vehicles.plateNumber })
          .from(vehicles)
          .where(eq(vehicles.id, payload.assignedVehicleId))
      );
      changes.push(
        v
          ? `assigned truck → ${v.name} (${v.plateNumber})`
          : "truck assignment updated"
      );
    } else {
      changes.push("truck unassigned");
    }
  }
  if (payload.warehouseZones && nextRoles.includes("group_leader")) {
    changes.push(`warehouse zones → ${payload.warehouseZones.join(", ") || "none"}`);
  }

  if (changes.length > 0) {
    await logActivity(
      "update",
      "employee",
      id,
      employeeUpdatedMessage(existing.name, changes),
      { category: "employees", details: { changes } }
    );
  }

  return getEmployee(id);
}

export async function deleteEmployee(id: number) {
  const db = await getDb();
  const existing = await getEmployee(id);
  if (!existing) return false;
  await db.delete(employees).where(eq(employees.id, id));
  await logActivity(
    "delete",
    "employee",
    id,
    employeeDeletedMessage(existing.name),
    { category: "employees", details: { name: existing.name } }
  );
  return true;
}

export async function updateEmployeeStatus(id: number, status: string) {
  return updateEmployee(id, { status });
}

export async function updateEmployeeStatusSelf(
  employeeId: number,
  status: string
) {
  if (!EMPLOYEE_STATUSES.includes(status as (typeof EMPLOYEE_STATUSES)[number])) {
    return { ok: false as const, error: "Invalid status" };
  }
  const employee = await updateEmployee(employeeId, { status });
  if (!employee) return { ok: false as const, error: "Employee not found" };
  return { ok: true as const, employee };
}

export async function getEmployeeByUsername(username: string) {
  const db = await getDb();
  const row = await dbOne(
    db
      .select()
      .from(employees)
      .where(eq(employees.username, username.trim().toLowerCase()))
  );
  if (!row) return null;
  return enrichEmployeeRow(row, await getEmployeeActiveAssignments(row.id));
}

export async function getOrderStaff(orderId: number) {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        id: orderEmployeeAssignments.id,
        role: orderEmployeeAssignments.role,
        assignedAt: orderEmployeeAssignments.assignedAt,
        employeeId: employees.id,
        employeeName: employees.name,
        employeeStatus: employees.status,
      })
      .from(orderEmployeeAssignments)
      .innerJoin(employees, eq(orderEmployeeAssignments.employeeId, employees.id))
      .where(eq(orderEmployeeAssignments.orderId, orderId))
  );

  const vehicleAssign = await dbOne(
    db
      .select({
        vehicleId: assignments.vehicleId,
        driverEmployeeId: assignments.driverEmployeeId,
        deliveryRound: assignments.deliveryRound,
        vehicleName: vehicles.name,
        plateNumber: vehicles.plateNumber,
      })
      .from(assignments)
      .innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
      .where(eq(assignments.orderId, orderId))
  );

  let driverFromVehicle = null;
  const linkedDriverId =
    vehicleAssign?.driverEmployeeId ??
    (vehicleAssign?.vehicleId
      ? (await getDriverForVehicle(vehicleAssign.vehicleId))?.id
      : null);
  if (linkedDriverId && vehicleAssign) {
    const driver = await dbOne(
      db
        .select()
        .from(employees)
        .where(eq(employees.id, linkedDriverId))
    );
    if (driver) {
      driverFromVehicle = {
        role: "driver" as const,
        employeeId: driver.id,
        employeeName: driver.name,
        employeeStatus: driver.status,
        deliveryRound: vehicleAssign.deliveryRound,
        vehicleName: vehicleAssign.vehicleName,
        plateNumber: vehicleAssign.plateNumber,
      };
    }
  }

  const staff = rows.map((r) => ({
    role: r.role as EmployeeRole,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    employeeStatus: r.employeeStatus,
    assignedAt: r.assignedAt,
  }));

  const hasDriverInStaff = staff.some((s) => s.role === "driver");
  if (driverFromVehicle && !hasDriverInStaff) {
    staff.push({
      role: "driver",
      employeeId: driverFromVehicle.employeeId,
      employeeName: driverFromVehicle.employeeName,
      employeeStatus: driverFromVehicle.employeeStatus,
      assignedAt: "",
    });
  }

  return {
    staff,
    picker: staff.find((s) => s.role === "picker") ?? null,
    driver:
      driverFromVehicle ??
      staff.find((s) => s.role === "driver") ??
      null,
  };
}

export async function assignEmployeeToOrder(
  orderId: number,
  employeeId: number,
  role: EmployeeRole
) {
  const db = await getDb();
  const order = await dbOne(
    db.select().from(orders).where(eq(orders.id, orderId))
  );
  if (!order) return { ok: false as const, error: "Order not found" };

  const employee = await getEmployee(employeeId);
  if (!employee) return { ok: false as const, error: "Employee not found" };
  if (!employee.roles.includes(role)) {
    return {
      ok: false as const,
      error: `${employee.name} does not have the ${EMPLOYEE_ROLE_LABELS[role]} role`,
    };
  }

  const now = new Date().toISOString();
  const existing = await dbOne(
    db
      .select()
      .from(orderEmployeeAssignments)
      .where(
        and(
          eq(orderEmployeeAssignments.orderId, orderId),
          eq(orderEmployeeAssignments.role, role)
        )
      )
  );

  if (existing) {
    await db
      .update(orderEmployeeAssignments)
      .set({ employeeId, assignedAt: now })
      .where(eq(orderEmployeeAssignments.id, existing.id));
  } else {
    await db
      .insert(orderEmployeeAssignments)
      .values({ orderId, employeeId, role, assignedAt: now });
  }

  if (employee.status === "available") {
    await db
      .update(employees)
      .set({ status: "busy", updatedAt: now })
      .where(eq(employees.id, employeeId));
  }

  await logActivity(
    "staff_assign",
    "order",
    orderId,
    employeeStaffAssignedMessage(
      order.invoiceNumber,
      employee.name,
      role,
      EMPLOYEE_ROLE_LABELS[role]
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        employeeId,
        employeeName: employee.name,
        role,
        roleLabel: EMPLOYEE_ROLE_LABELS[role],
      },
    }
  );

  return { ok: true as const, order: { ...order, staff: await getOrderStaff(orderId) } };
}

export async function unassignEmployeeFromOrder(orderId: number, role: EmployeeRole) {
  const db = await getDb();
  const order = await dbOne(
    db.select().from(orders).where(eq(orders.id, orderId))
  );
  if (!order) return null;

  const existing = await dbOne(
    db
      .select({
        assignment: orderEmployeeAssignments,
        employeeName: employees.name,
      })
      .from(orderEmployeeAssignments)
      .innerJoin(employees, eq(orderEmployeeAssignments.employeeId, employees.id))
      .where(
        and(
          eq(orderEmployeeAssignments.orderId, orderId),
          eq(orderEmployeeAssignments.role, role)
        )
      )
  );

  if (!existing) return getOrderStaff(orderId);

  await db
    .delete(orderEmployeeAssignments)
    .where(eq(orderEmployeeAssignments.id, existing.assignment.id));

  await logActivity(
    "staff_unassign",
    "order",
    orderId,
    employeeStaffUnassignedMessage(
      order.invoiceNumber,
      existing.employeeName,
      EMPLOYEE_ROLE_LABELS[role]
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        role,
        employeeName: existing.employeeName,
      },
    }
  );

  return getOrderStaff(orderId);
}

export { formatStatusLabel, EMPLOYEE_ROLE_LABELS };
