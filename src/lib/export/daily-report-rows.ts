import { orderWorkDate } from "@/lib/delivery-schedule";
import type { ExportOrder } from "@/lib/export/order-rows";
import {
  daysBetweenDates,
  formatExportDate,
  formatExportDateTime,
} from "@/lib/export/report-dates";

function staffMember(
  order: ExportOrder,
  role: "group_leader" | "picker" | "driver"
) {
  if (role === "picker") {
    const p = order.staff?.picker;
    return p
      ? { name: p.employeeName, assignedAt: p.assignedAt ?? "" }
      : { name: "", assignedAt: "" };
  }
  if (role === "driver") {
    const d =
      order.staff?.driver ??
      (order.assignment?.driverName
        ? { employeeName: order.assignment.driverName, assignedAt: "" }
        : null);
    return d
      ? {
          name: d.employeeName,
          assignedAt: "assignedAt" in d ? (d.assignedAt ?? "") : "",
        }
      : { name: "", assignedAt: "" };
  }
  const fromStaff = order.staff?.staff?.find((s) => s.role === role);
  if (fromStaff) {
    return {
      name: fromStaff.employeeName,
      assignedAt: fromStaff.assignedAt ?? "",
    };
  }
  const gl = order.staff?.groupLeader;
  if (gl) {
    return { name: gl.employeeName, assignedAt: gl.assignedAt ?? "" };
  }
  return { name: "", assignedAt: "" };
}

function proofAt(order: ExportOrder, phase: string): string {
  const proof = order.proofs?.find((p) => p.phase === phase);
  return formatExportDateTime(proof?.capturedAt);
}

function proofEmployee(order: ExportOrder, phase: string): string {
  return order.proofs?.find((p) => p.phase === phase)?.employeeName ?? "";
}

function isComplete(order: ExportOrder): boolean {
  return order.status === "delivered" || order.status === "cancelled";
}

function isPartial(order: ExportOrder): boolean {
  if (order.status === "partially_delivered") return true;
  const shipment = "shipment" in order ? order.shipment : undefined;
  return Boolean(
    shipment?.hasPartialShipments || shipment?.isPartialLoad
  );
}

export function buildDailyOrderRows(
  orders: ExportOrder[],
  reportDate: string
) {
  return [...orders]
    .sort((a, b) =>
      a.invoiceNumber.localeCompare(b.invoiceNumber, "sq", { numeric: true })
    )
    .map((order) => {
      const workDate = orderWorkDate(order);
      const leader = staffMember(order, "group_leader");
      const picker = staffMember(order, "picker");
      const driver = staffMember(order, "driver");
      const complete = isComplete(order);
      const partial = isPartial(order);
      const delayed =
        !complete && workDate < reportDate && order.status !== "cancelled";
      const daysOverdue = delayed ? daysBetweenDates(workDate, reportDate) : 0;
      const shipment = "shipment" in order ? order.shipment : undefined;
      const departedAt =
        proofAt(order, "departed") ||
        (order.status === "in_transit" ? "In transit (manual)" : "");

      return {
        Invoice: order.invoiceNumber,
        Customer: order.customerName,
        Region: order.region ?? "",
        City: order.city ?? "",
        "Order created": formatExportDateTime(order.createdAt),
        "Work / delivery date": workDate,
        Status: order.status,
        Complete: complete ? "Yes" : "No",
        Partial: partial ? "Yes" : "No",
        "Remaining pallets":
          shipment?.remaining?.pallets ?? order.totalPallets,
        "Group leader": leader.name,
        "Leader assigned at": formatExportDateTime(leader.assignedAt),
        Picker: picker.name,
        "Picker assigned at": formatExportDateTime(picker.assignedAt),
        Driver: driver.name,
        "Driver assigned at": formatExportDateTime(driver.assignedAt),
        Truck: order.assignment?.vehicleName ?? "",
        "Plate number": order.assignment?.plateNumber ?? "",
        Round: order.assignment?.deliveryRound ?? "",
        "Truck assigned at": formatExportDateTime(
          order.assignment?.assignedAt
        ),
        "Prepared at": proofAt(order, "prepared"),
        "Prepared by": proofEmployee(order, "prepared"),
        "Loaded at": proofAt(order, "loaded"),
        "Loaded by": proofEmployee(order, "loaded"),
        "Hit the road at": departedAt,
        "Departed by": proofEmployee(order, "departed"),
        "Delivered at":
          proofAt(order, "delivered") ||
          (order.status === "delivered" ? formatExportDate(order.updatedAt) : ""),
        "Delivered by": proofEmployee(order, "delivered"),
        Delayed: delayed ? "Yes" : "No",
        "Days overdue": delayed ? daysOverdue : "",
        "Delivery stage":
          "deliveryStageLabel" in order && order.deliveryStageLabel
            ? order.deliveryStageLabel
            : order.status,
        "Total pallets": order.totalPallets,
        "Total m²": order.totalM2,
        "Total weight (kg)": order.totalWeightKg,
        "Order value (€)": order.price,
        Notes: order.notes ?? "",
      };
    });
}

export function buildGroupLeaderSummaryRows(
  orders: ExportOrder[],
  reportDate: string
): Record<string, string | number>[] {
  type Bucket = {
    leader: string;
    orders: ExportOrder[];
  };
  const buckets = new Map<string, Bucket>();

  for (const order of orders) {
    const leader = staffMember(order, "group_leader").name || "Unassigned leader";
    const bucket = buckets.get(leader) ?? { leader, orders: [] };
    bucket.orders.push(order);
    buckets.set(leader, bucket);
  }

  return [...buckets.values()]
    .sort((a, b) => a.leader.localeCompare(b.leader, "sq"))
    .map(({ leader, orders: leaderOrders }) => {
      let completed = 0;
      let inProgress = 0;
      let delayed = 0;
      let partial = 0;
      let onTime = 0;
      const hoursToRoad: number[] = [];

      for (const order of leaderOrders) {
        const workDate = orderWorkDate(order);
        const complete = isComplete(order);
        const isDelayed =
          !complete && workDate < reportDate && order.status !== "cancelled";

        if (complete) completed += 1;
        else inProgress += 1;
        if (isDelayed) delayed += 1;
        if (isPartial(order)) partial += 1;
        if (complete && !isDelayed) onTime += 1;

        const assignedAt = staffMember(order, "group_leader").assignedAt;
        const departed = order.proofs?.find((p) => p.phase === "departed")
          ?.capturedAt;
        if (assignedAt && departed) {
          const ms =
            new Date(departed).getTime() - new Date(assignedAt).getTime();
          if (Number.isFinite(ms) && ms >= 0) {
            hoursToRoad.push(ms / (60 * 60 * 1000));
          }
        }
      }

      const avgHours =
        hoursToRoad.length > 0
          ? (
              hoursToRoad.reduce((a, b) => a + b, 0) / hoursToRoad.length
            ).toFixed(1)
          : "";

      return {
        "Group leader": leader,
        "Orders on report": leaderOrders.length,
        Completed: completed,
        "In progress": inProgress,
        Delayed: delayed,
        Partial: partial,
        "Completed on time": onTime,
        "Avg hours assign → road": avgHours,
      };
    });
}

export function buildDailySummaryRows(
  orders: ExportOrder[],
  reportDate: string
) {
  const complete = orders.filter(isComplete).length;
  const partial = orders.filter(isPartial).length;
  const delayed = orders.filter((order) => {
    const workDate = orderWorkDate(order);
    return (
      !isComplete(order) &&
      workDate < reportDate &&
      order.status !== "cancelled"
    );
  }).length;
  const totalValue = orders.reduce((sum, o) => sum + (o.price ?? 0), 0);

  return [
    { Metric: "Report date", Value: reportDate },
    { Metric: "Orders", Value: orders.length },
    { Metric: "Completed", Value: complete },
    { Metric: "In progress", Value: orders.length - complete },
    { Metric: "Partial deliveries", Value: partial },
    { Metric: "Delayed (overdue)", Value: delayed },
    {
      Metric: "Total order value (€)",
      Value: Math.round(totalValue * 100) / 100,
    },
  ];
}
