import { BRAND } from "@/lib/brand";
import { orderWorkDate } from "@/lib/delivery-schedule";
import type { ExportOrder } from "@/lib/export/order-rows";
import {
  classifyDailyOrder,
  completedOnReportDate,
  type DailyOrderBucket,
} from "@/lib/services/daily-operations-report";
import {
  daysBetweenDates,
  formatExportDate,
  formatExportDateTime,
} from "@/lib/export/report-dates";

const BUCKET_LABELS: Record<DailyOrderBucket, string> = {
  scheduled: "Scheduled today",
  waiting: "Waiting / in progress",
  completed_today: "Completed today",
  delayed: "Delayed",
  partial: "Partial delivery",
};

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

function proofEmployee(order: ExportOrder, phase: string): string {
  return order.proofs?.find((p) => p.phase === phase)?.employeeName ?? "";
}

function isComplete(order: ExportOrder): boolean {
  return order.status === "delivered" || order.status === "cancelled";
}

function isPartial(order: ExportOrder): boolean {
  if (order.status === "partially_delivered") return true;
  const shipment = "shipment" in order ? order.shipment : undefined;
  return Boolean(shipment?.hasPartialShipments || shipment?.isPartialLoad);
}

function bucketLabel(order: ExportOrder, reportDate: string): string {
  const buckets = classifyDailyOrder(order, reportDate);
  if (buckets.length === 0) return "In report";
  return buckets.map((b) => BUCKET_LABELS[b]).join(" · ");
}

function waitingLabel(order: ExportOrder): string {
  if (isComplete(order)) return "Done";
  const stage =
    "deliveryStageLabel" in order && order.deliveryStageLabel
      ? order.deliveryStageLabel
      : order.status;
  return stage;
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
        Category: bucketLabel(order, reportDate),
        Invoice: order.invoiceNumber,
        Customer: order.customerName,
        Region: order.region ?? "",
        City: order.city ?? "",
        "Order created": formatExportDateTime(order.createdAt),
        "Work / delivery date": workDate,
        "Waiting status": waitingLabel(order),
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
          (order.status === "delivered"
            ? formatExportDateTime(order.updatedAt)
            : ""),
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

const PROOF_LABELS: Record<string, string> = {
  prepared: "Marked prepared",
  loaded: "Loaded on truck",
  load_skipped: "Could not load",
  departed: "Hit the road",
  arrived: "Arrived at customer",
  delivered: "Delivered (complete)",
  partial_delivery: "Partial delivery",
};

export function buildActivityLogRows(
  orders: ExportOrder[],
  reportDate: string
) {
  const events: Array<Record<string, string | number>> = [];

  for (const order of orders) {
    const base = {
      Invoice: order.invoiceNumber,
      Customer: order.customerName,
      Region: order.region ?? "",
    };

    if (order.createdAt?.startsWith(reportDate)) {
      events.push({
        ...base,
        Time: formatExportDateTime(order.createdAt),
        Event: "Order created",
        Person: "",
        Detail: `Value €${order.price ?? 0}`,
      });
    }

    if (order.assignment?.assignedAt?.startsWith(reportDate)) {
      events.push({
        ...base,
        Time: formatExportDateTime(order.assignment.assignedAt),
        Event: "Truck assigned",
        Person: order.assignment.driverName ?? "",
        Detail: `${order.assignment.vehicleName ?? ""} · R${order.assignment.deliveryRound ?? 1}`,
      });
    }

    for (const member of [
      order.staff?.groupLeader,
      order.staff?.picker,
      ...(order.staff?.staff ?? []),
    ]) {
      if (!member?.assignedAt?.startsWith(reportDate)) continue;
      const role =
        "role" in member && member.role
          ? String(member.role).replace("_", " ")
          : member === order.staff?.picker
            ? "picker"
            : member === order.staff?.groupLeader
              ? "group leader"
              : "staff";
      events.push({
        ...base,
        Time: formatExportDateTime(member.assignedAt),
        Event: `${role} assigned`,
        Person: member.employeeName,
        Detail: "",
      });
    }

    for (const proof of order.proofs ?? []) {
      if (!proof.capturedAt?.startsWith(reportDate)) continue;
      events.push({
        ...base,
        Time: formatExportDateTime(proof.capturedAt),
        Event: PROOF_LABELS[proof.phase] ?? proof.phase,
        Person: proof.employeeName ?? "",
        Detail: [
          proof.sentPallets != null ? `${proof.sentPallets} plt` : "",
          proof.notes ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }

  return events.sort((a, b) =>
    String(a.Time).localeCompare(String(b.Time), "sq")
  );
}

function buildStaffPerformanceRows(
  orders: ExportOrder[],
  reportDate: string,
  role: "group_leader" | "picker"
): Record<string, string | number>[] {
  type Bucket = { name: string; orders: ExportOrder[] };
  const buckets = new Map<string, Bucket>();
  const roleLabel = role === "group_leader" ? "Group leader" : "Picker";

  for (const order of orders) {
    const member = staffMember(order, role);
    const name =
      member.name ||
      (role === "picker" ? "Unassigned picker" : "Unassigned leader");
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
      let partial = 0;
      let completedToday = 0;
      let valueCompleted = 0;
      let valueWaiting = 0;
      let valueTotal = 0;
      const hoursToRoad: number[] = [];

      for (const order of staffOrders) {
        const workDate = orderWorkDate(order);
        const complete = isComplete(order);
        const price = order.price ?? 0;
        valueTotal += price;

        if (complete) {
          completed += 1;
          valueCompleted += price;
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
        if (completedOnReportDate(order, reportDate)) completedToday += 1;

        const assignedAt = staffMember(order, role).assignedAt;
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

      return {
        [roleLabel]: name,
        "Orders assigned": staffOrders.length,
        Completed: completed,
        "Completed today": completedToday,
        "Still waiting": waiting,
        Delayed: delayed,
        Partial: partial,
        "Value completed (€)": Math.round(valueCompleted * 100) / 100,
        "Value waiting (€)": Math.round(valueWaiting * 100) / 100,
        "Total value (€)": Math.round(valueTotal * 100) / 100,
        "Avg hours assign → road":
          hoursToRoad.length > 0
            ? (
                hoursToRoad.reduce((a, b) => a + b, 0) / hoursToRoad.length
              ).toFixed(1)
            : "",
      };
    });
}

export function buildGroupLeaderSummaryRows(
  orders: ExportOrder[],
  reportDate: string
): Record<string, string | number>[] {
  return buildStaffPerformanceRows(orders, reportDate, "group_leader");
}

export function buildPickerSummaryRows(
  orders: ExportOrder[],
  reportDate: string
): Record<string, string | number>[] {
  return buildStaffPerformanceRows(orders, reportDate, "picker");
}

export function buildExecutiveDashboardRows(
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
  const money = (n: number) => Math.round(n * 100) / 100;

  return [
    { Section: BRAND.shortName, Metric: "Daily Operations Report", Value: "" },
    { Section: "", Metric: "Report date", Value: reportDate },
    { Section: "", Metric: "Generated", Value: generatedAt },
    { Section: "", Metric: "", Value: "" },
    { Section: "PIPELINE", Metric: "Orders in this report", Value: stats.total },
    {
      Section: "",
      Metric: "Still waiting / in progress",
      Value: stats.waiting,
    },
    {
      Section: "",
      Metric: "Completed (in report)",
      Value: stats.completed,
    },
    {
      Section: "",
      Metric: "Completed today",
      Value: stats.completedToday,
    },
    { Section: "", Metric: "Scheduled for this date", Value: stats.scheduled },
    { Section: "", Metric: "Delayed (overdue)", Value: stats.delayed },
    { Section: "", Metric: "Partial deliveries", Value: stats.partial },
    { Section: "", Metric: "", Value: "" },
    {
      Section: "VALUE (€)",
      Metric: "Total pipeline value",
      Value: money(stats.totalValue),
    },
    {
      Section: "",
      Metric: "Value still waiting",
      Value: money(stats.waitingValue),
    },
    {
      Section: "",
      Metric: "Value completed (in report)",
      Value: money(stats.completedValue),
    },
    {
      Section: "",
      Metric: "Value completed today",
      Value: money(stats.completedTodayValue),
    },
    { Section: "", Metric: "", Value: "" },
    {
      Section: "WORKSHEETS",
      Metric: "All orders",
      Value: "Full detail + assignment & road timestamps",
    },
    {
      Section: "",
      Metric: "Waiting",
      Value: "Orders not yet delivered",
    },
    {
      Section: "",
      Metric: "Completed today",
      Value: "Delivered on this date",
    },
    {
      Section: "",
      Metric: "Activity log",
      Value: "Assignments & milestones this day",
    },
    {
      Section: "",
      Metric: "Group leaders / Pickers",
      Value: "Performance & value per person",
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
    { Metric: "Orders in report", Value: orders.length },
    { Metric: "Still waiting", Value: waiting },
    { Metric: "Completed", Value: complete },
    { Metric: "Partial deliveries", Value: partial },
    { Metric: "Delayed (overdue)", Value: delayed },
    {
      Metric: "Total value (€)",
      Value: Math.round(totalValue * 100) / 100,
    },
  ];
}
