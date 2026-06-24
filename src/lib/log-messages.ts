/** Human-readable labels for activity log entries */

import { formatM2 } from "@/lib/calculations";

export type LogCategory =
  | "orders"
  | "vehicles"
  | "employees"
  | "deliveries"
  | "system";

export interface LogRecord {
  id: number;
  action: string;
  entityType: string;
  entityId?: number | null;
  category?: string | null;
  message?: string | null;
  details?: string | null;
  createdAt: string;
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function inferLogCategory(
  action: string,
  entityType: string
): LogCategory {
  if (
    action === "assign" ||
    action === "unassign" ||
    action === "assignments_clear" ||
    action === "delivery_reset" ||
    action === "assign_bundle" ||
    action === "assign_rejected" ||
    action === "staff_assign" ||
    action === "staff_unassign"
  ) {
    return "deliveries";
  }
  if (entityType === "employee") return "employees";
  if (entityType === "vehicle") return "vehicles";
  if (entityType === "order") return "orders";
  return "system";
}

export function formatLogMessage(log: LogRecord): string {
  if (log.message) return log.message;

  let details: Record<string, unknown> = {};
  if (log.details) {
    try {
      details = JSON.parse(log.details);
    } catch {
      /* ignore */
    }
  }

  const invoice = String(details.invoiceNumber ?? `#${log.entityId ?? "?"}`);
  const vehicleName = String(details.vehicleName ?? details.name ?? "vehicle");
  const plate = details.plateNumber ? ` (${details.plateNumber})` : "";
  const round = details.deliveryRound ? ` · Round ${details.deliveryRound}` : "";
  const employeeName = String(details.employeeName ?? "employee");
  const roleLabel = String(details.roleLabel ?? details.role ?? "staff");
  const totals = details.totals as
    | { totalM2?: number; totalPallets?: number }
    | undefined;

  switch (log.action) {
    case "create":
      if (log.entityType === "order") {
        return `New order ${invoice} created${details.location ? ` for ${details.location}` : ""}${totals ? ` — ${totals.totalM2 != null ? formatM2(totals.totalM2) : 0} m², ${totals.totalPallets ?? 0} pallets` : ""}.`;
      }
      if (log.entityType === "vehicle") {
        return `Vehicle ${vehicleName}${plate} added to fleet.`;
      }
      if (log.entityType === "employee") {
        return `Employee ${employeeName} added to team.`;
      }
      break;
    case "update":
      if (log.entityType === "order") {
        return `Order ${invoice} was edited.`;
      }
      if (log.entityType === "vehicle") {
        return `Vehicle ${vehicleName}${plate} details were updated.`;
      }
      if (log.entityType === "employee") {
        return `Employee ${employeeName} details were updated.`;
      }
      break;
    case "status_change":
      if (log.entityType === "employee") {
        return `${employeeName} status changed from ${formatStatusLabel(String(details.from ?? "?"))} to ${formatStatusLabel(String(details.to ?? "?"))}.`;
      }
      return `${vehicleName}${plate} status changed from ${formatStatusLabel(String(details.from ?? "?"))} to ${formatStatusLabel(String(details.to ?? "?"))}.`;
    case "delete":
      if (log.entityType === "order") {
        return `Order ${invoice} was deleted.`;
      }
      if (log.entityType === "vehicle") {
        return `Vehicle ${vehicleName} was removed from fleet.`;
      }
      if (log.entityType === "employee") {
        return `Employee ${employeeName} was removed from team.`;
      }
      break;
    case "assign":
      return `Order ${invoice} assigned to ${vehicleName}${round}.`;
    case "unassign":
      return `Order ${invoice} unassigned${round}.`;
    case "assignments_clear":
      return String(details.summary ?? `Order ${invoice} assignments cleared.`);
    case "delivery_reset":
      return String(details.summary ?? `Order ${invoice} delivery reset.`);
    case "assign_bundle":
      return String(details.summary ?? `Order ${invoice} assignment saved.`);
    case "assign_rejected":
      return `Could not assign ${invoice} to ${vehicleName}${round}: ${details.reason ?? "capacity limit"}.`;
    case "staff_assign":
      return `${employeeName} assigned as ${roleLabel} on order ${invoice}.`;
    case "staff_unassign":
      return `${employeeName} removed as ${roleLabel} from order ${invoice}.`;
  }

  return `${formatStatusLabel(log.action)} — ${log.entityType}${log.entityId ? ` #${log.entityId}` : ""}`;
}

export const LOG_CATEGORY_META: Record<
  LogCategory,
  { label: string; color: string; bg: string }
> = {
  orders: { label: "Orders", color: "text-blue-700", bg: "bg-blue-100" },
  vehicles: { label: "Vehicles", color: "text-emerald-700", bg: "bg-emerald-100" },
  employees: { label: "Employees", color: "text-orange-700", bg: "bg-orange-100" },
  deliveries: { label: "Deliveries", color: "text-violet-700", bg: "bg-violet-100" },
  system: { label: "System", color: "text-slate-700", bg: "bg-slate-100" },
};

export const LOG_ACTION_ICONS: Record<string, string> = {
  create: "＋",
  update: "✎",
  delete: "✕",
  status_change: "↻",
  assign: "→",
  unassign: "←",
  assignments_clear: "✕",
  delivery_reset: "⟲",
  assign_bundle: "⚡",
  assign_rejected: "⚠",
  staff_assign: "👤",
  staff_unassign: "↩",
};

export function orderCreatedMessage(payload: {
  invoiceNumber: string;
  customerName: string;
  location: string;
  totalM2: number;
  totalPallets: number;
  totalPieces: number;
}): string {
  return `New order ${payload.invoiceNumber} for ${payload.customerName} at ${payload.location} — ${formatM2(payload.totalM2)} m², ${payload.totalPieces} pieces, ${payload.totalPallets} pallets.`;
}

export function orderUpdatedMessage(
  invoiceNumber: string,
  changes: string[]
): string {
  if (changes.length === 0) {
    return `Order ${invoiceNumber} was saved.`;
  }
  return `Order ${invoiceNumber} edited: ${changes.join("; ")}.`;
}

export function orderDeletedMessage(invoiceNumber: string, location: string): string {
  return `Order ${invoiceNumber} (${location}) was deleted.`;
}

export function vehicleCreatedMessage(
  name: string,
  plateNumber: string,
  maxPallets: number,
  maxWeightKg: number
): string {
  return `${name} (${plateNumber}) added — max ${maxPallets} pallets, ${maxWeightKg} kg recommended load.`;
}

export function vehicleStatusMessage(
  name: string,
  plateNumber: string,
  from: string,
  to: string
): string {
  return `${name} (${plateNumber}) marked as ${formatStatusLabel(to)} (was ${formatStatusLabel(from)}).`;
}

export function vehicleUpdatedMessage(name: string, plateNumber: string, changes: string[]): string {
  if (changes.length === 0) return `${name} (${plateNumber}) was updated.`;
  return `${name} (${plateNumber}) updated: ${changes.join("; ")}.`;
}

export function vehicleDeletedMessage(name: string, plateNumber: string): string {
  return `${name} (${plateNumber}) removed from fleet.`;
}

export function employeeCreatedMessage(
  name: string,
  roles: string[]
): string {
  return `${name} joined the team${roles.length ? ` as ${roles.join(", ")}` : ""}.`;
}

export function employeeStatusMessage(
  name: string,
  from: string,
  to: string
): string {
  return `${name} marked as ${formatStatusLabel(to)} (was ${formatStatusLabel(from)}).`;
}

export function employeeUpdatedMessage(name: string, changes: string[]): string {
  if (changes.length === 0) return `${name} was updated.`;
  return `${name} updated: ${changes.join("; ")}.`;
}

export function employeeDeletedMessage(name: string): string {
  return `${name} removed from team.`;
}

export function employeeStaffAssignedMessage(
  invoiceNumber: string,
  employeeName: string,
  role: string,
  roleLabel: string
): string {
  return `${employeeName} assigned as ${roleLabel} on order ${invoiceNumber}.`;
}

export function employeeStaffUnassignedMessage(
  invoiceNumber: string,
  employeeName: string,
  roleLabel: string
): string {
  return `${employeeName} removed as ${roleLabel} from order ${invoiceNumber}.`;
}

export function orderAssignedMessage(
  invoiceNumber: string,
  vehicleName: string,
  plateNumber: string,
  round: number,
  weightWarningIgnored?: boolean,
  pickerName?: string | null,
  driverName?: string | null
): string {
  const extra = weightWarningIgnored ? " (proceeded despite weight recommendation)" : "";
  const staffParts: string[] = [];
  if (pickerName) staffParts.push(`prepared by ${pickerName}`);
  if (driverName) staffParts.push(`driver ${driverName}`);
  const staff = staffParts.length ? ` · ${staffParts.join(", ")}` : "";
  return `${invoiceNumber} loaded on ${vehicleName} (${plateNumber}) — delivery round ${round}${staff}${extra}.`;
}

export function orderUnassignedMessage(
  invoiceNumber: string,
  round?: number
): string {
  return round
    ? `${invoiceNumber} removed from delivery round ${round}.`
    : `${invoiceNumber} was unassigned from its vehicle.`;
}

export function orderAssignmentsClearedMessage(
  invoiceNumber: string,
  cleared: string[]
): string {
  if (cleared.length === 0) {
    return `${invoiceNumber} had no assignments to clear.`;
  }
  return `${invoiceNumber} cleared: ${cleared.join(", ")}.`;
}

export function orderDeliveryResetMessage(invoiceNumber: string): string {
  return `${invoiceNumber} delivery reset — assignments and proof steps removed.`;
}

export function orderAssignBundleMessage(
  invoiceNumber: string,
  vehicleName: string,
  pickerName?: string | null
): string {
  return pickerName
    ? `${invoiceNumber} assigned to ${vehicleName} with picker ${pickerName}.`
    : `${invoiceNumber} assigned to ${vehicleName}.`;
}

export function assignRejectedMessage(
  invoiceNumber: string,
  vehicleName: string,
  reason: string
): string {
  return `Assignment blocked for ${invoiceNumber} on ${vehicleName}: ${reason}`;
}

export function deliveryProofMessage(
  invoiceNumber: string,
  phaseLabel: string,
  employeeName: string
): string {
  return `${invoiceNumber}: ${phaseLabel} recorded by ${employeeName}.`;
}

export function orderStatusChangeMessage(
  invoiceNumber: string,
  from: string,
  to: string,
  actorName: string
): string {
  return `${invoiceNumber} status ${formatStatusLabel(from)} → ${formatStatusLabel(to)} (${actorName}).`;
}
