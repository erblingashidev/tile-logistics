import { orderWorkDate } from "@/lib/delivery-schedule";
import type { ExportOrder } from "@/lib/export/order-rows";
import {
  completedOnReportDate,
} from "@/lib/services/daily-operations-report";
import {
  daysBetweenDates,
  formatExportDateTime,
} from "@/lib/export/report-dates";

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

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
  return formatExportDateTime(
    order.proofs?.find((p) => p.phase === phase)?.capturedAt
  );
}

function isComplete(order: ExportOrder): boolean {
  return order.status === "delivered" || order.status === "cancelled";
}

function isPartial(order: ExportOrder): boolean {
  if (order.status === "partially_delivered") return true;
  const shipment = "shipment" in order ? order.shipment : undefined;
  return Boolean(shipment?.hasPartialShipments || shipment?.isPartialLoad);
}

function proofRawAt(order: ExportOrder, phase: string): string {
  return order.proofs?.find((p) => p.phase === phase)?.capturedAt ?? "";
}

function orderDetailRow(order: ExportOrder, reportDate: string) {
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
  const deliveredRaw =
    proofRawAt(order, "delivered") ||
    (order.status === "delivered" ? order.updatedAt : "");

  return {
    Picker: picker.name || "—",
    "Group leader": leader.name || "—",
    Invoice: order.invoiceNumber,
    Customer: order.customerName,
    Region: order.region ?? "",
    City: order.city ?? "",
    Status: order.status,
    Stage:
      "deliveryStageLabel" in order && order.deliveryStageLabel
        ? order.deliveryStageLabel
        : order.status,
    Complete: complete ? "Yes" : "No",
    Partial: partial ? "Yes" : "No",
    Delayed: delayed ? "Yes" : "No",
    "Days overdue": delayed ? daysOverdue : "",
    "Order created": formatExportDateTime(order.createdAt),
    "Delivery date": workDate,
    "Picker assigned": formatExportDateTime(picker.assignedAt),
    "Leader assigned": formatExportDateTime(leader.assignedAt),
    "Truck assigned": formatExportDateTime(order.assignment?.assignedAt),
    Truck: order.assignment?.vehicleName ?? "",
    Round: order.assignment?.deliveryRound ?? "",
    "Plate number": order.assignment?.plateNumber ?? "",
    Driver: driver.name || "—",
    "Prepared at": proofAt(order, "prepared"),
    "Loaded at": proofAt(order, "loaded"),
    "Hit the road at": proofAt(order, "departed"),
    "Delivered at": formatExportDateTime(deliveredRaw),
    "Remaining pallets": shipment?.remaining?.pallets ?? order.totalPallets,
    Pallets: order.totalPallets,
    "m²": order.totalM2,
    "Weight (kg)": order.totalWeightKg,
    "Value (€)": roundMoney(order.price ?? 0),
    Notes: order.notes ?? "",
  };
}

export function buildDailyOrderRows(
  orders: ExportOrder[],
  reportDate: string
) {
  return [...orders]
    .sort((a, b) =>
      a.invoiceNumber.localeCompare(b.invoiceNumber, "sq", { numeric: true })
    )
    .map((order) => orderDetailRow(order, reportDate));
}

export function buildOrdersByPickerRows(
  orders: ExportOrder[],
  reportDate: string
) {
  return [...orders]
    .sort((a, b) => {
      const pa = staffMember(a, "picker").name || "Unassigned";
      const pb = staffMember(b, "picker").name || "Unassigned";
      const byPicker = pa.localeCompare(pb, "sq", { sensitivity: "base" });
      if (byPicker !== 0) return byPicker;
      return a.invoiceNumber.localeCompare(b.invoiceNumber, "sq", {
        numeric: true,
      });
    })
    .map((order) => orderDetailRow(order, reportDate));
}


export function buildPickerPerformanceRows(
  orders: ExportOrder[],
  reportDate: string
): Record<string, string | number>[] {
  type Bucket = { name: string; orders: ExportOrder[] };
  const buckets = new Map<string, Bucket>();

  for (const order of orders) {
    const picker = staffMember(order, "picker");
    const name = picker.name || "Unassigned";
    const bucket = buckets.get(name) ?? { name, orders: [] };
    bucket.orders.push(order);
    buckets.set(name, bucket);
  }

  return [...buckets.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "sq"))
    .map(({ name, orders: pickerOrders }) => {
      let completed = 0;
      let waiting = 0;
      let delayed = 0;
      let partial = 0;
      let completedToday = 0;
      let assignedToday = 0;
      let valueCompleted = 0;
      let valueCompletedToday = 0;
      let valueWaiting = 0;
      let firstAssigned = "";
      let lastCompleted = "";

      for (const order of pickerOrders) {
        const workDate = orderWorkDate(order);
        const complete = isComplete(order);
        const price = order.price ?? 0;
        const pickerAssigned = staffMember(order, "picker").assignedAt;

        if (pickerAssigned) {
          if (!firstAssigned || pickerAssigned < firstAssigned) {
            firstAssigned = pickerAssigned;
          }
          if (pickerAssigned.startsWith(reportDate)) assignedToday += 1;
        }

        if (complete) {
          completed += 1;
          valueCompleted += price;
          const deliveredAt =
            proofRawAt(order, "delivered") ||
            (order.status === "delivered" ? order.updatedAt : "");
          if (deliveredAt) {
            if (!lastCompleted || deliveredAt > lastCompleted) {
              lastCompleted = deliveredAt;
            }
          }
        } else if (order.status !== "cancelled") {
          waiting += 1;
          valueWaiting += price;
        }

        if (
          !complete &&
          workDate < reportDate &&
          order.status !== "cancelled"
        ) {
          delayed += 1;
        }
        if (isPartial(order)) partial += 1;
        if (completedOnReportDate(order, reportDate)) {
          completedToday += 1;
          valueCompletedToday += price;
        }
      }

      return {
        Picker: name,
        Orders: pickerOrders.length,
        "Assigned today": assignedToday,
        Completed: completed,
        "Completed today": completedToday,
        Waiting: waiting,
        Delayed: delayed,
        Partial: partial,
        "Value completed (€)": roundMoney(valueCompleted),
        "Value completed today (€)": roundMoney(valueCompletedToday),
        "Value waiting (€)": roundMoney(valueWaiting),
        "First assigned": formatExportDateTime(firstAssigned),
        "Last completed": formatExportDateTime(lastCompleted),
      };
    });
}

export function buildPickerSummaryRows(
  orders: ExportOrder[],
  reportDate: string
): Record<string, string | number>[] {
  return buildPickerPerformanceRows(orders, reportDate);
}

function buildStaffPerformanceRows(
  orders: ExportOrder[],
  reportDate: string,
  role: "group_leader" | "picker"
): Record<string, string | number>[] {
  if (role === "picker") {
    return buildPickerPerformanceRows(orders, reportDate);
  }

  type Bucket = { name: string; orders: ExportOrder[] };
  const buckets = new Map<string, Bucket>();
  const roleLabel = "Group leader";

  for (const order of orders) {
    const member = staffMember(order, role);
    const name = member.name || "Unassigned leader";
    const bucket = buckets.get(name) ?? { name, orders: [] };
    bucket.orders.push(order);
    buckets.set(name, bucket);
  }

  return [...buckets.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "sq"))
    .map(({ name, orders: staffOrders }) => {
      let completed = 0;
      let waiting = 0;
      let delayed = 0;
      let valueCompleted = 0;

      for (const order of staffOrders) {
        const workDate = orderWorkDate(order);
        const complete = isComplete(order);
        const price = order.price ?? 0;
        if (complete) {
          completed += 1;
          valueCompleted += price;
        } else if (order.status !== "cancelled") {
          waiting += 1;
        }
        if (
          !complete &&
          workDate < reportDate &&
          order.status !== "cancelled"
        ) {
          delayed += 1;
        }
      }

      return {
        [roleLabel]: name,
        Orders: staffOrders.length,
        Completed: completed,
        Waiting: waiting,
        Delayed: delayed,
        "Value completed (€)": roundMoney(valueCompleted),
      };
    });
}

export function buildGroupLeaderSummaryRows(
  orders: ExportOrder[],
  reportDate: string
): Record<string, string | number>[] {
  return buildStaffPerformanceRows(orders, reportDate, "group_leader");
}

export function buildReportSummaryRows(
  reportDate: string,
  stats: {
    total: number;
    waiting: number;
    completed: number;
    completedToday: number;
    delayed: number;
    partial: number;
    scheduled: number;
    waitingValue: number;
    completedValue: number;
    completedTodayValue: number;
    totalValue: number;
  },
  generatedAt: string
) {
  return [
    { Metric: "Report date", Value: reportDate },
    { Metric: "Generated", Value: generatedAt },
    { Metric: "Orders", Value: stats.total },
    { Metric: "Waiting", Value: stats.waiting },
    { Metric: "Completed", Value: stats.completed },
    { Metric: "Completed today", Value: stats.completedToday },
    { Metric: "Scheduled", Value: stats.scheduled },
    { Metric: "Delayed", Value: stats.delayed },
    { Metric: "Partial", Value: stats.partial },
    { Metric: "Total value (€)", Value: roundMoney(stats.totalValue) },
    { Metric: "Value waiting (€)", Value: roundMoney(stats.waitingValue) },
    { Metric: "Value completed (€)", Value: roundMoney(stats.completedValue) },
    {
      Metric: "Value completed today (€)",
      Value: roundMoney(stats.completedTodayValue),
    },
  ];
}

export function buildDailySummaryRows(
  orders: ExportOrder[],
  reportDate: string
) {
  const complete = orders.filter(isComplete).length;
  const waiting = orders.filter(
    (o) => !isComplete(o) && o.status !== "cancelled"
  ).length;
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
    { Metric: "Waiting", Value: waiting },
    { Metric: "Completed", Value: complete },
    { Metric: "Partial", Value: partial },
    { Metric: "Delayed", Value: delayed },
    { Metric: "Total value (€)", Value: roundMoney(totalValue) },
  ];
}
