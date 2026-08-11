import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import {
  assignments,
  employees,
  orderEmployeeAssignments,
  orderItems,
  orders,
  vehicles,
} from "@/lib/db/schema";
import type { EmployeeRole } from "@/lib/constants";
import {
  computeOrderDisplayStage,
  ORDER_STAGE_LABELS,
} from "@/lib/order-display";
import { computeShipmentProgress } from "@/lib/shipment-progress";
import { listDeliveryProofsBatch } from "@/lib/services/delivery-proofs";
import { parseEmployeeRoles } from "@/lib/services/employees";
import { loadStatusFromProofs } from "@/lib/services/load-coordination";
import type { LinkedOrderSummary } from "@/lib/services/order-delivery-links";

type OrderRow = typeof orders.$inferSelect;

type AssignmentRow = {
  orderId: number;
  id: number;
  deliveryRound: number;
  assignedAt: string | null;
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  driverEmployeeId: number | null;
};

type StaffAssignmentRow = {
  orderId: number;
  role: string;
  assignedAt: string | null;
  employeeId: number;
  employeeName: string;
  employeeStatus: string;
};

function buildStaffSnapshot(
  orderId: number,
  staffRows: StaffAssignmentRow[],
  assignment: AssignmentRow | null,
  driverByVehicleId: Map<number, { id: number; name: string; status: string }>,
  driverNameById: Map<number, string>
) {
  const rows = staffRows.filter((row) => row.orderId === orderId);
  const staff = rows.map((r) => ({
    role: r.role as EmployeeRole,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    employeeStatus: r.employeeStatus,
    assignedAt: r.assignedAt ?? "",
  }));

  let driverFromVehicle: {
    role: "driver";
    employeeId: number;
    employeeName: string;
    employeeStatus: string;
    deliveryRound: number;
    vehicleName: string;
    plateNumber: string;
  } | null = null;

  if (assignment) {
    const linkedDriverId =
      assignment.driverEmployeeId ??
      driverByVehicleId.get(assignment.vehicleId)?.id ??
      null;
    if (linkedDriverId) {
      const driverName =
        driverNameById.get(linkedDriverId) ??
        driverByVehicleId.get(assignment.vehicleId)?.name ??
        "";
      const driverStatus =
        driverByVehicleId.get(assignment.vehicleId)?.status ?? "active";
      driverFromVehicle = {
        role: "driver",
        employeeId: linkedDriverId,
        employeeName: driverName,
        employeeStatus: driverStatus,
        deliveryRound: assignment.deliveryRound,
        vehicleName: assignment.vehicleName,
        plateNumber: assignment.plateNumber,
      };
    }
  }

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
    groupLeader: staff.find((s) => s.role === "group_leader") ?? null,
    driver:
      driverFromVehicle ?? staff.find((s) => s.role === "driver") ?? null,
  };
}

function buildAssignmentSnapshot(
  assignment: AssignmentRow | null,
  driverByVehicleId: Map<number, { id: number; name: string; status: string }>,
  driverNameById: Map<number, string>
) {
  if (!assignment) return null;

  const driverId =
    assignment.driverEmployeeId ??
    driverByVehicleId.get(assignment.vehicleId)?.id ??
    null;
  const driverName = driverId ? driverNameById.get(driverId) ?? null : null;

  return {
    id: assignment.id,
    deliveryRound: assignment.deliveryRound,
    assignedAt: assignment.assignedAt,
    vehicleId: assignment.vehicleId,
    vehicleName: assignment.vehicleName,
    plateNumber: assignment.plateNumber,
    driverEmployeeId: assignment.driverEmployeeId,
    driverName,
  };
}

export async function enrichOrdersForList(
  rows: OrderRow[],
  linkMap: Map<number, LinkedOrderSummary[]>
) {
  if (rows.length === 0) return [];

  const orderIds = rows.map((row) => row.id);
  const db = await getDb();

  const [proofsByOrder, assignmentRows, staffRows, itemRows] = await Promise.all([
    listDeliveryProofsBatch(orderIds),
    dbAll(
      db
        .select({
          orderId: assignments.orderId,
          id: assignments.id,
          deliveryRound: assignments.deliveryRound,
          assignedAt: assignments.assignedAt,
          vehicleId: assignments.vehicleId,
          vehicleName: vehicles.name,
          plateNumber: vehicles.plateNumber,
          driverEmployeeId: assignments.driverEmployeeId,
        })
        .from(assignments)
        .innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
        .where(inArray(assignments.orderId, orderIds))
        .orderBy(desc(assignments.assignedAt))
    ) as Promise<AssignmentRow[]>,
    dbAll(
      db
        .select({
          orderId: orderEmployeeAssignments.orderId,
          role: orderEmployeeAssignments.role,
          assignedAt: orderEmployeeAssignments.assignedAt,
          employeeId: employees.id,
          employeeName: employees.name,
          employeeStatus: employees.status,
        })
        .from(orderEmployeeAssignments)
        .innerJoin(
          employees,
          eq(orderEmployeeAssignments.employeeId, employees.id)
        )
        .where(inArray(orderEmployeeAssignments.orderId, orderIds))
    ) as Promise<StaffAssignmentRow[]>,
    dbAll(
      db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    ),
  ]);

  const assignmentByOrderId = new Map<number, AssignmentRow>();
  for (const row of assignmentRows) {
    if (!assignmentByOrderId.has(row.orderId)) {
      assignmentByOrderId.set(row.orderId, row);
    }
  }

  const vehicleIds = [
    ...new Set(assignmentRows.map((row) => row.vehicleId)),
  ];
  const explicitDriverIds = [
    ...new Set(
      assignmentRows
        .map((row) => row.driverEmployeeId)
        .filter((id): id is number => id != null)
    ),
  ];

  const vehicleDriverRows =
    vehicleIds.length > 0
      ? await dbAll(
          db
            .select({
              id: employees.id,
              name: employees.name,
              status: employees.status,
              roles: employees.roles,
              assignedVehicleId: employees.assignedVehicleId,
            })
            .from(employees)
            .where(inArray(employees.assignedVehicleId, vehicleIds))
        )
      : [];

  const driverByVehicleId = new Map<
    number,
    { id: number; name: string; status: string }
  >();
  for (const row of vehicleDriverRows) {
    if (row.assignedVehicleId == null) continue;
    if (!parseEmployeeRoles(row.roles).includes("driver")) continue;
    if (!driverByVehicleId.has(row.assignedVehicleId)) {
      driverByVehicleId.set(row.assignedVehicleId, {
        id: row.id,
        name: row.name,
        status: row.status,
      });
    }
  }

  const driverNameById = new Map<number, string>();
  for (const row of vehicleDriverRows) {
    driverNameById.set(row.id, row.name);
  }
  if (explicitDriverIds.length > 0) {
    const namedDrivers = await dbAll(
      db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(inArray(employees.id, explicitDriverIds))
    );
    for (const row of namedDrivers) {
      driverNameById.set(row.id, row.name);
    }
  }

  const itemsByOrderId = new Map<number, (typeof itemRows)[number][]>();
  for (const item of itemRows) {
    const list = itemsByOrderId.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrderId.set(item.orderId, list);
  }

  return rows.map((order) => {
    try {
      const proofs = proofsByOrder.get(order.id) ?? [];
      const deliveryStage = computeOrderDisplayStage(
        order.status,
        proofs.map((p) => p.phase)
      );
      const assignmentRow = assignmentByOrderId.get(order.id) ?? null;
      const { prepStatus, loadStatus, notes } = loadStatusFromProofs(proofs);

      return {
        ...order,
        customerHasForklift: Boolean(order.customerHasForklift),
        assignment: buildAssignmentSnapshot(
          assignmentRow,
          driverByVehicleId,
          driverNameById
        ),
        staff: buildStaffSnapshot(
          order.id,
          staffRows,
          assignmentRow,
          driverByVehicleId,
          driverNameById
        ),
        proofs,
        deliveryStage,
        deliveryStageLabel: ORDER_STAGE_LABELS[deliveryStage],
        shipment: computeShipmentProgress(order, proofs),
        prepStatus,
        loadStatus,
        loadNotes: notes,
        canMarkLoaded: false,
        loadBlockedReason: null,
        deliveryLinks: linkMap.get(order.id) ?? [],
        items: itemsByOrderId.get(order.id) ?? [],
      };
    } catch (err) {
      console.error("[enrichOrdersForList] failed for order", order.id, err);
      const deliveryStage = computeOrderDisplayStage(order.status, []);
      return {
        ...order,
        customerHasForklift: Boolean(order.customerHasForklift),
        assignment: null,
        staff: { staff: [], picker: null, driver: null, groupLeader: null },
        proofs: [],
        deliveryStage,
        deliveryStageLabel: ORDER_STAGE_LABELS[deliveryStage],
        prepStatus: "pending" as const,
        loadStatus: "pending" as const,
        loadNotes: null,
        canMarkLoaded: false,
        loadBlockedReason: null,
        deliveryLinks: linkMap.get(order.id) ?? [],
        items: [],
      };
    }
  });
}
