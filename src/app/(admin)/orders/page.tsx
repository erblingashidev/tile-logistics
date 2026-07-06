"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { LocationPicker } from "@/components/LocationPicker";
import {
  type AssignmentDraft,
} from "@/components/OrderAssignmentPanel";
import { TruckFocusBar } from "@/components/TruckFocusBar";
import { SmartDispatchPanel } from "@/components/SmartDispatchPanel";
import { OrderListCard } from "@/components/OrderListCard";
import {
  OrderBoardView,
  type OrderBoardViewMode,
} from "@/components/OrderBoardView";
import { InvoiceImportPanel,
  type InvoiceImportFormState,
} from "@/components/InvoiceImportPanel";
import { InvoiceNumberField } from "@/components/InvoiceNumberField";
import { ProductSearchField } from "@/components/ProductSearchField";
import { Badge, Button, Card, Input, Select, Alert, PageSection, LoadingState } from "@/components/ui";
import {
  type OrderDisplayStage,
} from "@/lib/order-display";
import {
  calculateOrderTotals,
  calculateTileLine,
  calculateWeightLine,
  formatM2,
  tileSpecOptionsForItem,
  type OrderItemInput,
} from "@/lib/calculations";
import {
  calculateLineLogistics,
  isUsablePalletSpec,
  productToOrderItemDefaults,
  type ProductPalletSpec,
} from "@/lib/product-pallet-spec";
import { readJsonListWithError } from "@/lib/api/read-json-list";
import {
  ORDER_UNITS,
  ORDER_UNIT_LABELS,
  inferOrderUnitFromProductName,
  normalizeOrderUnit,
  type OrderUnit,
} from "@/lib/constants";
import {
  DELIVERY_TIME_PREFERENCE_LABELS,
  DELIVERY_TIME_PREFERENCES,
} from "@/lib/delivery-schedule";
import { deliveryRoundSelectOptions, formatDeliveryRound } from "@/lib/delivery-rounds";
import { isOrderUrgent } from "@/lib/order-priority";
import { KOSOVO_MUNICIPALITIES } from "@/lib/locations";
import type { ProductRecord } from "@/lib/services/products";

interface OrderItem {
  unit: OrderUnit;
  productId?: number;
  productEan?: string;
  catalogStatus?: string;
  productName?: string;
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number;
  thicknessOverride?: boolean;
  quantityM2?: number;
  weightKg?: number;
  lengthM?: number;
  manualPallets?: number;
  manualPieces?: number;
  catalogPallet?: ProductPalletSpec | null;
}

interface Order {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  region?: string | null;
  locationId?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  price: number;
  orderDate: string;
  requestedDeliveryDate?: string | null;
  deliveryTimePreference?: string | null;
  status: string;
  loadStatus?: "pending" | "loaded" | "load_skipped";
  loadNotes?: string | null;
  deliveryStage?: OrderDisplayStage;
  deliveryStageLabel?: string;
  notes?: string | null;
  salesAgentName?: string | null;
  priority?: string | null;
  totalM2: number;
  totalPieces: number;
  totalPallets: number;
  totalWeightKg: number;
  items: Array<{
    unit: string;
    productEan?: string | null;
    productName?: string | null;
    quantityM2?: number | null;
    lengthM?: number | null;
    pieceCount?: number | null;
    palletCount?: number | null;
    weightKg?: number | null;
    tileWidthCm?: number | null;
    tileHeightCm?: number | null;
    tileThicknessCm?: number | null;
    calculatedPieces?: number | null;
    calculatedPallets?: number | null;
  }>;
  assignment?: {
    vehicleId: number;
    vehicleName: string;
    plateNumber?: string;
    deliveryRound: number;
    driverName?: string | null;
  } | null;
  staff?: {
    picker?: { employeeId: number; employeeName: string } | null;
    driver?: { employeeId: number; employeeName: string } | null;
    staff?: Array<{ role: string; employeeName: string }>;
  };
  proofs?: Array<{
    phase: string;
    employeeName: string;
    capturedAt: string;
    photoUrl?: string | null;
  }>;
}

interface Vehicle {
  id: number;
  name: string;
  plateNumber: string;
  maxPallets: number;
  maxWeightKg: number;
  status: string;
  assignedDriver?: { id: number; name: string } | null;
  loads?: Array<{
    round: number;
    totals: { pallets: number; weightKg: number };
  }>;
}

interface EmployeeOption {
  id: number;
  name: string;
  status: string;
  roles: string[];
}

const emptyItem = (): OrderItem => ({
  unit: "m2",
  productName: "",
  tileWidthCm: 60,
  tileHeightCm: 120,
  quantityM2: 0,
});

function parseReferentiFromNotes(notes?: string | null): string {
  const match = notes?.match(/Referenti:\s*([^·\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

function buildOrderNotes(salesAgent: string, customerPhone: string): string | undefined {
  const parts = [
    salesAgent.trim() ? `Referenti: ${salesAgent.trim()}` : null,
    customerPhone.trim() ? `Phone: ${customerPhone.trim()}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    minM2: "",
    maxM2: "",
    minPallets: "",
    region: "",
    employeeId: "",
    pickerId: "",
    driverId: "",
    search: "",
    hideDelivered: "true",
    vehicleId: "",
    deliveryRound: "1",
    vehicleScope: "workspace" as "workspace" | "on_truck" | "unassigned",
  });
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [expandedAssignId, setExpandedAssignId] = useState<number | null>(null);
  const [orderViewMode, setOrderViewMode] = useState<
    "cards" | OrderBoardViewMode
  >("list");
  const [assignmentFilter, setAssignmentFilter] = useState<
    "all" | "assigned" | "unassigned"
  >("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    invoiceNumber: "",
    customerName: "",
    customerPhone: "",
    salesAgent: "",
    region: "",
    location: "",
    locationId: "" as string | undefined,
    city: "" as string | undefined,
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    price: "",
    orderDate: new Date().toISOString().slice(0, 10),
    requestedDeliveryDate: "",
    deliveryTimePreference: "flexible" as "flexible" | "morning" | "afternoon",
    priority: "normal" as "normal" | "urgent",
    items: [emptyItem()] as OrderItem[],
  });
  const [assignState, setAssignState] = useState<
    Record<number, AssignmentDraft>
  >({});
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(
    new Set()
  );
  const [transferVehicleId, setTransferVehicleId] = useState("");
  const [transferRound, setTransferRound] = useState("1");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const [ordersRes, vehiclesRes, employeesRes] = await Promise.all([
        fetch(`/api/orders?${params}`, { cache: "no-store" }),
        fetch("/api/vehicles", { cache: "no-store" }),
        fetch("/api/employees", { cache: "no-store" }),
      ]);

      const ordersPayload = await readJsonListWithError<Order>(ordersRes);
      const vehiclesPayload = await readJsonListWithError<Vehicle>(vehiclesRes);
      const employeesPayload = await readJsonListWithError<EmployeeOption>(
        employeesRes
      );

      setOrders(ordersPayload.data);
      setVehicles(vehiclesPayload.data);
      setEmployees(employeesPayload.data);

      const loadError =
        ordersPayload.error ?? vehiclesPayload.error ?? employeesPayload.error;
      setError(loadError ?? "");

      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vehicleId = params.get("vehicleId");
    const deliveryRound = params.get("deliveryRound");
    if (vehicleId) {
      setFilters((f) => ({
        ...f,
        vehicleId,
        deliveryRound: deliveryRound ?? f.deliveryRound,
        vehicleScope: "workspace",
      }));
    }
  }, []);

  useEffect(() => {
    setAssignState((prev) => {
      const next = { ...prev };
      const focusId = filters.vehicleId ? Number(filters.vehicleId) : null;
      const focusRound = Number(filters.deliveryRound) || 1;

      for (const order of orders) {
        const onTruck = order.assignment;
        if (onTruck) {
          const current = prev[order.id];
          if (!current?.vehicleId) {
            next[order.id] = {
              vehicleId: String(onTruck.vehicleId),
              round: String(onTruck.deliveryRound),
              pickerId:
                current?.pickerId ??
                (order.staff?.picker?.employeeId
                  ? String(order.staff.picker.employeeId)
                  : ""),
            };
          }
        } else if (focusId != null) {
          next[order.id] = {
            vehicleId: filters.vehicleId,
            round: filters.deliveryRound || "1",
            pickerId: prev[order.id]?.pickerId ?? "",
          };
        }
      }
      return next;
    });

    if (filters.vehicleId) {
      setTransferVehicleId(filters.vehicleId);
      setTransferRound(filters.deliveryRound || "1");
    }
  }, [orders, filters.vehicleId, filters.deliveryRound]);

  const preview = calculateOrderTotals(form.items as OrderItemInput[]);

  async function saveOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.region) {
      setError("Select a region for delivery.");
      return;
    }
    const payload = {
      ...form,
      price: Number(form.price) || 0,
      region: form.region,
      location: form.location.trim() || form.region,
      locationId: form.locationId || undefined,
      city: form.city,
      lat: form.lat,
      lng: form.lng,
      requestedDeliveryDate: form.requestedDeliveryDate.trim() || null,
      deliveryTimePreference: form.deliveryTimePreference,
      priority: form.priority,
      salesAgentName: form.salesAgent.trim() || undefined,
      notes: buildOrderNotes(form.salesAgent, form.customerPhone),
      items: form.items,
    };
    const url = editingId ? `/api/orders/${editingId}` : "/api/orders";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to save order");
      return;
    }
    setShowForm(false);
    setEditingId(null);
    setForm({
      invoiceNumber: "",
      customerName: "",
      customerPhone: "",
      salesAgent: "",
      region: "",
      location: "",
      locationId: undefined,
      city: undefined,
      lat: undefined,
      lng: undefined,
      price: "",
      orderDate: new Date().toISOString().slice(0, 10),
      requestedDeliveryDate: "",
      deliveryTimePreference: "flexible" as "flexible" | "morning" | "afternoon",
      priority: "normal" as "normal" | "urgent",
      items: [emptyItem()],
    });
    load();
  }

  function startEdit(order: Order) {
    setEditingId(order.id);
    setForm({
      invoiceNumber: order.invoiceNumber,
      customerName: order.customerName,
      customerPhone:
        order.notes?.match(/Phone:\s*([^\s·]+)/)?.[1]?.trim() ?? "",
      salesAgent:
        order.salesAgentName?.trim() || parseReferentiFromNotes(order.notes),
      region: order.region ?? "",
      location: order.location,
      locationId: order.locationId ?? undefined,
      city: order.city ?? undefined,
      lat: order.lat ?? undefined,
      lng: order.lng ?? undefined,
      price: String(order.price),
      orderDate: order.orderDate,
      requestedDeliveryDate: order.requestedDeliveryDate ?? "",
      deliveryTimePreference:
        (order.deliveryTimePreference as "flexible" | "morning" | "afternoon") ??
        "flexible",
      priority: isOrderUrgent(order) ? "urgent" : "normal",
      items:
        order.items.length > 0
          ? order.items.map((i) => {
              const unit = normalizeOrderUnit(i.unit);
              const w = i.tileWidthCm ?? 60;
              const h = i.tileHeightCm ?? 60;
              const m2 = i.quantityM2 ?? 0;
              const item: OrderItem = {
                unit,
                productEan: i.productEan ?? undefined,
                productName: i.productName ?? "",
                tileWidthCm: w,
                tileHeightCm: h,
                tileThicknessCm: i.tileThicknessCm ?? undefined,
                thicknessOverride: i.tileThicknessCm != null,
                quantityM2: m2,
                weightKg: i.weightKg ?? 0,
              };

              if (unit === "m2") {
                const line = calculateTileLine(w, h, m2, tileSpecOptionsForItem(item));
                const hasManualPallets =
                  i.palletCount != null && i.palletCount !== line.calculatedPallets;
                const hasManualPieces =
                  i.pieceCount != null && i.pieceCount !== line.calculatedPieces;
                item.manualPallets = hasManualPallets
                  ? (i.palletCount ?? undefined)
                  : undefined;
                item.manualPieces = hasManualPieces
                  ? (i.pieceCount ?? undefined)
                  : undefined;
              } else if (unit === "kg") {
                const weightLine = calculateWeightLine(
                  i.weightKg ?? 0,
                  i.productName ?? ""
                );
                const hasManualPieces =
                  i.pieceCount != null &&
                  i.pieceCount !== weightLine.calculatedPieces;
                item.manualPieces = hasManualPieces
                  ? (i.pieceCount ?? undefined)
                  : undefined;
              } else if (unit === "meter") {
                item.lengthM = i.lengthM ?? undefined;
              } else {
                item.manualPieces = i.pieceCount ?? undefined;
              }

              return item;
            })
          : [emptyItem()],
    });
    setShowForm(true);
  }

  async function deleteOrder(id: number) {
    if (!confirm("Delete this order?")) return;
    await fetch(`/api/orders/${id}`, { method: "DELETE" });
    load();
  }

  async function bulkClearSelected(scope?: {
    truck?: boolean;
    picker?: boolean;
    driver?: boolean;
    helpers?: boolean;
  }) {
    const ids = [...selectedOrderIds];
    if (ids.length === 0) {
      setError("Select orders first (checkboxes).");
      return;
    }
    const anyProgress = orders.some(
      (o) =>
        selectedOrderIds.has(o.id) &&
        (o.proofs?.length ?? 0) > 0
    );
    let adminPin: string | undefined;
    if (anyProgress) {
      const pin = window.prompt(
        "Some selected orders have delivery progress.\nEnter admin PIN:"
      );
      if (!pin?.trim()) return;
      adminPin = pin.trim();
    }
    if (
      !confirm(`Clear assignments on ${ids.length} order(s)?`)
    ) {
      return;
    }
    setError("");
    const res = await fetch("/api/orders/bulk-clear-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderIds: ids,
        scope: scope ?? {
          truck: true,
          picker: true,
          driver: true,
          helpers: true,
        },
        adminPin,
      }),
    });
    const data = await res.json();
    if (!res.ok && data.results) {
      const failed = data.results.filter((r: { ok: boolean }) => !r.ok);
      setError(`${failed.length} order(s) could not be cleared.`);
    } else if (!res.ok) {
      setError(data.error ?? "Bulk clear failed");
      return;
    } else {
      setWarning(`Cleared assignments on ${data.clearedCount ?? ids.length} orders`);
      setTimeout(() => setWarning(""), 3000);
    }
    setSelectedOrderIds(new Set());
    load();
  }

  async function bulkTransferToTruck(
    ignoreWeightWarning = false,
    ignoreCraneRule = false
  ) {
    const ids = [...selectedOrderIds];
    if (ids.length === 0) {
      setError("Select orders first (checkboxes).");
      return;
    }
    if (!transferVehicleId) {
      setError("Choose the truck to transfer to.");
      return;
    }
    const target = vehicles.find((v) => v.id === Number(transferVehicleId));
    if (
      !confirm(
        `Transfer ${ids.length} order(s) to ${target?.name ?? "truck"} (round ${transferRound})?\n\nPicker assignments are kept unless you clear them separately.`
      )
    ) {
      return;
    }
    setError("");
    const res = await fetch("/api/orders/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderIds: ids,
        vehicleId: Number(transferVehicleId),
        deliveryRound: Number(transferRound) || 1,
        preservePicker: true,
        ignoreWeightWarning,
        ignoreCraneRule,
      }),
    });
    const data = await res.json();
    if (res.status === 422 && data.results) {
      if (
        confirm(
          `${data.results.find((r: { error?: string }) => r.error)?.error ?? "Weight warning"}\n\nTransfer anyway?`
        )
      ) {
        await bulkTransferToTruck(true, ignoreCraneRule);
      }
      return;
    }
    if (res.status === 409 && data.results?.some((r: { requiresCrane?: boolean }) => r.requiresCrane)) {
      if (
        confirm(
          "One or more orders need the crane truck.\n\nOverride and transfer anyway?"
        )
      ) {
        await bulkTransferToTruck(ignoreWeightWarning, true);
      }
      return;
    }
    if (!res.ok) {
      const failed = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      setError(
        failed[0]?.error ??
          data.error ??
          `Transfer failed (${failed.length} order(s))`
      );
      return;
    }
    setWarning(
      `Transferred ${data.transferred ?? ids.length} order(s) to ${data.vehicleName ?? "truck"}`
    );
    setTimeout(() => setWarning(""), 4000);
    setSelectedOrderIds(new Set());
    load();
  }

  async function bulkAssignToFocusTruck() {
    if (!filters.vehicleId) {
      setError("Choose a focus truck first.");
      return;
    }
    const ids = [...selectedOrderIds].filter((id) => {
      const order = orders.find((o) => o.id === id);
      if (!order) return false;
      if (order.assignment?.vehicleId === Number(filters.vehicleId)) {
        return false;
      }
      return true;
    });
    if (ids.length === 0) {
      setError("Select unassigned orders (or orders on another truck) to assign.");
      return;
    }
    const truck = vehicles.find((v) => String(v.id) === filters.vehicleId);
    if (
      !confirm(
        `Assign ${ids.length} order(s) to ${truck?.name ?? "truck"} · round ${filters.deliveryRound}?`
      )
    ) {
      return;
    }
    setError("");
    const res = await fetch("/api/orders/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderIds: ids,
        vehicleId: Number(filters.vehicleId),
        deliveryRound: Number(filters.deliveryRound) || 1,
        preservePicker: true,
        ignoreWeightWarning: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? data.results?.[0]?.error ?? "Assign failed");
      return;
    }
    setWarning(
      `Assigned ${data.transferred ?? ids.length} order(s) to ${truck?.name ?? "truck"}`
    );
    setTimeout(() => setWarning(""), 4000);
    setSelectedOrderIds(new Set());
    load();
  }

  async function quickAssignOrderToFocus(order: Order) {
    if (!filters.vehicleId) {
      setError("Choose a focus truck first.");
      return;
    }
    if (
      order.assignment?.vehicleId === Number(filters.vehicleId) &&
      order.assignment?.deliveryRound === focusRound
    ) {
      return;
    }
    setError("");
    const res = await fetch(`/api/orders/${order.id}/assign-bundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: Number(filters.vehicleId),
        deliveryRound: focusRound,
        pickerId: null,
        autoAssignTeam: true,
        ignoreWeightWarning: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not assign order");
      return;
    }
    setWarning(`Assigned ${order.invoiceNumber} → ${focusVehicle?.name ?? "truck"}`);
    setTimeout(() => setWarning(""), 3000);
    load();
  }

  const pickers = employees.filter((e) => e.roles.includes("picker"));
  const drivers = employees.filter((e) => e.roles.includes("driver"));

  const focusVehicle = vehicles.find(
    (v) => String(v.id) === filters.vehicleId
  );
  const focusRound = Number(filters.deliveryRound) || 1;
  const focusLoad = focusVehicle?.loads?.find((l) => l.round === focusRound);
  const ordersOnFocusTruck = orders.filter(
    (o) =>
      o.assignment?.vehicleId === Number(filters.vehicleId) &&
      o.assignment?.deliveryRound === focusRound
  );
  const focusPalletsOnTruck = ordersOnFocusTruck.reduce(
    (s, o) => s + o.totalPallets,
    0
  );
  const focusPalletsRemaining = focusVehicle
    ? Math.max(0, focusVehicle.maxPallets - focusPalletsOnTruck)
    : 0;

  const assignedCount = orders.filter((o) => o.assignment).length;
  const unassignedCount = orders.length - assignedCount;
  const visibleOrders = orders.filter((order) => {
    if (assignmentFilter === "assigned") return Boolean(order.assignment);
    if (assignmentFilter === "unassigned") return !order.assignment;
    return true;
  });

  function openAssignPanel(orderId: number) {
    setExpandedAssignId((current) => (current === orderId ? null : orderId));
  }

  function openFormFromInvoice(importForm: InvoiceImportFormState) {
    setEditingId(null);
    setError("");
    setForm({
      invoiceNumber: importForm.invoiceNumber,
      customerName: importForm.customerName,
      customerPhone: importForm.customerPhone ?? "",
      salesAgent: importForm.salesAgent ?? "",
      region: importForm.region,
      location: importForm.location,
      locationId: importForm.locationId || undefined,
      city: importForm.city || undefined,
      lat: importForm.lat,
      lng: importForm.lng,
      price: importForm.price,
      orderDate: importForm.orderDate,
      requestedDeliveryDate: importForm.requestedDeliveryDate,
      deliveryTimePreference: importForm.deliveryTimePreference,
      priority: "normal" as "normal" | "urgent",
      items: importForm.items.map((item) => ({
        unit: normalizeOrderUnit(item.unit),
        productEan: item.productEan,
        productName: item.productName ?? "",
        tileWidthCm: item.tileWidthCm ?? 60,
        tileHeightCm: item.tileHeightCm ?? 120,
        quantityM2: item.quantityM2 ?? 0,
        weightKg: item.weightKg ?? 0,
        lengthM: item.lengthM ?? 0,
        manualPieces: item.manualPieces,
      })),
    });
    setShowForm(true);
  }

  async function suggestUrgentRoute(order: Order) {
    setError("");
    const res = await fetch(`/api/dispatch/urgent?orderId=${order.id}`);
    const data = await res.json();
    if (!res.ok || !data.options?.length) {
      setError(data.error ?? "No nearby route found for this urgent order");
      return;
    }
    const best = data.options[0] as {
      vehicleId: number;
      vehicleName: string;
      deliveryRound: number;
      reasons: string[];
      almostReady?: boolean;
    };
    const label = `${best.vehicleName} · R${best.deliveryRound}${
      best.almostReady ? " (almost ready)" : ""
    }`;
    if (
      !confirm(
        `Best match: ${label}\n\n${best.reasons[0] ?? ""}\n\nAssign now?`
      )
    ) {
      return;
    }
    const assignRes = await fetch("/api/dispatch/urgent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        vehicleId: best.vehicleId,
        deliveryRound: best.deliveryRound,
      }),
    });
    const assignData = await assignRes.json();
    if (!assignRes.ok) {
      setError(assignData.error ?? "Could not assign urgent order");
      return;
    }
    setWarning(`Urgent ${order.invoiceNumber} → ${label}`);
    load();
  }

  return (
    <AppShell
      title="Orders"
      description="Invoices, truck assignment, and delivery tracking."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowForm(true)}>New order</Button>
          <Button
            variant="secondary"
            onClick={() => {
              const params = new URLSearchParams({ type: "orders" });
              Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
              window.open(`/api/export?${params}`, "_blank");
            }}
          >
            Export Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              window.open("/api/export?type=locations", "_blank")
            }
          >
            Export by Location
          </Button>
          <Link
            href="/dispatch"
            className="inline-flex items-center justify-center rounded border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Dispatch board
          </Link>
        </div>
      </div>

      {warning && (
        <div className="mb-4">
          <Alert tone="warning">{warning}</Alert>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <PageSection title="Truck workspace">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50/80 to-white p-4">
          <p className="mb-3 text-sm text-zinc-500">
            Click a truck to focus the list — then assign orders with one click per
            truck chip on each card.
          </p>
          <TruckFocusBar
            vehicles={vehicles}
            selectedVehicleId={filters.vehicleId}
            deliveryRound={filters.deliveryRound}
            onSelectVehicle={(vehicleId) =>
              setFilters({
                ...filters,
                vehicleId,
                vehicleScope: vehicleId ? filters.vehicleScope : "workspace",
              })
            }
            onSelectRound={(deliveryRound) =>
              setFilters({ ...filters, deliveryRound })
            }
            onClear={() =>
              setFilters({
                ...filters,
                vehicleId: "",
                vehicleScope: "workspace",
              })
            }
          />
          {filters.vehicleId && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Show:</span>
              {(
                [
                  ["workspace", "On truck + available"],
                  ["on_truck", "On truck only"],
                  ["unassigned", "Available only"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filters.vehicleScope === value}
                  onClick={() =>
                    setFilters({ ...filters, vehicleScope: value })
                  }
                  className={`inline-flex items-center rounded-md border-2 px-2.5 py-1 text-xs font-medium transition ${
                    filters.vehicleScope === value
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {focusVehicle && (
            <div className="mt-4 rounded-lg border border-blue-100 bg-white/80 px-3 py-2 text-sm">
              <p className="font-medium text-zinc-900">
                {focusVehicle.name} ({focusVehicle.plateNumber}) ·{" "}
                {formatDeliveryRound(focusRound, "short")}
              </p>
              <p className="mt-1 text-zinc-600">
                Load: {focusPalletsOnTruck.toFixed(1)} / {focusVehicle.maxPallets}{" "}
                pallets · {ordersOnFocusTruck.length} order
                {ordersOnFocusTruck.length !== 1 ? "s" : ""} on truck ·{" "}
                {focusPalletsRemaining.toFixed(1)} plt free
                {focusLoad
                  ? ` · ${focusLoad.totals.weightKg.toFixed(0)} kg on truck`
                  : ""}
              </p>
              {focusVehicle.assignedDriver && (
                <p className="text-xs text-zinc-500">
                  Driver: {focusVehicle.assignedDriver.name}
                </p>
              )}
            </div>
          )}
        </Card>
      </PageSection>

      <PageSection title="Filters">
        <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Input
            label="From date"
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              setFilters({ ...filters, dateFrom: e.target.value })
            }
          />
          <Input
            label="To date"
            type="date"
            value={filters.dateTo}
            onChange={(e) =>
              setFilters({ ...filters, dateTo: e.target.value })
            }
          />
          <Input
            label="Min m²"
            type="number"
            value={filters.minM2}
            onChange={(e) =>
              setFilters({ ...filters, minM2: e.target.value })
            }
          />
          <Input
            label="Min pallets"
            type="number"
            value={filters.minPallets}
            onChange={(e) =>
              setFilters({ ...filters, minPallets: e.target.value })
            }
          />
          <Input
            label="Region"
            list="order-region-filter"
            value={filters.region}
            onChange={(e) =>
              setFilters({ ...filters, region: e.target.value })
            }
          />
          <datalist id="order-region-filter">
            {KOSOVO_MUNICIPALITIES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <Select
            label="Employee"
            value={filters.employeeId}
            onChange={(e) =>
              setFilters({ ...filters, employeeId: e.target.value })
            }
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Select
            label="Picker"
            value={filters.pickerId}
            onChange={(e) =>
              setFilters({ ...filters, pickerId: e.target.value })
            }
          >
            <option value="">All pickers</option>
            {pickers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Select
            label="Driver"
            value={filters.driverId}
            onChange={(e) =>
              setFilters({ ...filters, driverId: e.target.value })
            }
          >
            <option value="">All drivers</option>
            {drivers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Input
            label="Search"
            placeholder="Invoice, name..."
            value={filters.search}
            onChange={(e) =>
              setFilters({ ...filters, search: e.target.value })
            }
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={filters.hideDelivered === "true"}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  hideDelivered: e.target.checked ? "true" : "",
                })
              }
              className="rounded border-zinc-300"
            />
            Hide completed deliveries
          </label>
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-200 ring-1 ring-amber-300" />
              In transit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-200 ring-1 ring-green-300" />
              Delivered
            </span>
            <Button variant="secondary" className="text-xs" onClick={load}>
              Refresh now
            </Button>
            {loading && (
              <span className="animate-pulse text-xs text-zinc-500">Loading…</span>
            )}
            {lastRefreshed && !loading && (
              <span>Updated {lastRefreshed.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
        </Card>
      </PageSection>

      <InvoiceImportPanel
        onOpenForm={openFormFromInvoice}
        onCreated={load}
        onError={setError}
        onWarning={setWarning}
      />

      {showForm && (
        <Card className="mb-6 p-4">
          <h3 className="mb-4 text-sm font-semibold text-zinc-900">
            {editingId ? "Edit Order" : "New Order / Invoice"}
          </h3>
          <form onSubmit={saveOrder} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InvoiceNumberField
                required
                value={form.invoiceNumber}
                onChange={(invoiceNumber) =>
                  setForm({ ...form, invoiceNumber })
                }
              />
              <Input
                label="Customer name"
                required
                value={form.customerName}
                onChange={(e) =>
                  setForm({ ...form, customerName: e.target.value })
                }
              />
              <Input
                label="Customer phone"
                value={form.customerPhone}
                onChange={(e) =>
                  setForm({ ...form, customerPhone: e.target.value })
                }
                placeholder="045/669985"
              />
              <Input
                label="Referenti Juaj"
                value={form.salesAgent}
                onChange={(e) =>
                  setForm({ ...form, salesAgent: e.target.value })
                }
                placeholder="Sales agent from invoice"
              />
              <LocationPicker
                region={form.region}
                locationDetail={form.location}
                locationId={form.locationId}
                onChange={(loc) =>
                  setForm({
                    ...form,
                    region: loc.region,
                    location: loc.locationDetail,
                    locationId: loc.id,
                    city: loc.city,
                    lat: loc.lat,
                    lng: loc.lng,
                  })
                }
              />
              <Input
                label="Price"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <Input
                label="Order date"
                type="date"
                value={form.orderDate}
                onChange={(e) =>
                  setForm({ ...form, orderDate: e.target.value })
                }
              />
              <Input
                label="Requested delivery date (optional)"
                type="date"
                min={form.orderDate}
                value={form.requestedDeliveryDate}
                onChange={(e) =>
                  setForm({ ...form, requestedDeliveryDate: e.target.value })
                }
              />
              <Select
                label="Delivery time preference"
                value={form.deliveryTimePreference}
                onChange={(e) =>
                  setForm({
                    ...form,
                    deliveryTimePreference: e.target
                      .value as typeof form.deliveryTimePreference,
                  })
                }
              >
                {DELIVERY_TIME_PREFERENCES.map((pref) => (
                  <option key={pref} value={pref}>
                    {DELIVERY_TIME_PREFERENCE_LABELS[pref]}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 rounded border border-red-100 bg-red-50/50 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.priority === "urgent"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      priority: e.target.checked ? "urgent" : "normal",
                    })
                  }
                />
                <span className="font-medium text-red-800">Urgent delivery</span>
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Products</h4>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      items: [emptyItem(), ...form.items],
                    })
                  }
                >
                  + Add product
                </Button>
              </div>
              {form.items.map((item, idx) => {
                const unit = normalizeOrderUnit(item.unit);
                const w = item.tileWidthCm ?? 60;
                const h = item.tileHeightCm ?? 60;
                const m2 = item.quantityM2 ?? 0;
                const specOptions = tileSpecOptionsForItem(item);
                const lineCalc =
                  unit === "m2" && isUsablePalletSpec(item.catalogPallet)
                    ? calculateLineLogistics(m2, item.catalogPallet!, {
                        manualPieces: item.manualPieces,
                        manualPallets: item.manualPallets,
                      })
                    : unit === "m2"
                      ? calculateTileLine(w, h, m2, specOptions)
                      : null;
                const weightCalc =
                  unit === "kg"
                    ? calculateWeightLine(item.weightKg ?? 0, item.productName ?? "")
                    : null;

                return (
                <div
                  key={idx}
                  className="space-y-3 rounded-lg border border-slate-200 p-3"
                >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ProductSearchField
                    productName={item.productName ?? ""}
                    productEan={item.productEan}
                    productId={item.productId}
                    catalogStatus={item.catalogStatus}
                    onDraftChange={(draft) => {
                      const items = [...form.items];
                      const inferred = inferOrderUnitFromProductName(draft.productName);
                      items[idx] = {
                        ...items[idx],
                        productId: draft.productId,
                        productEan: draft.productEan,
                        productName: draft.productName,
                        catalogStatus: draft.catalogStatus,
                        unit: inferred ?? items[idx].unit,
                      };
                      setForm({ ...form, items });
                    }}
                    onSelect={(product: ProductRecord) => {
                      const items = [...form.items];
                      items[idx] = {
                        ...items[idx],
                        ...productToOrderItemDefaults(product),
                      };
                      if (normalizeOrderUnit(product.unit) === "kg" && product.unitWeightKg) {
                        items[idx].weightKg = items[idx].weightKg ?? 0;
                      }
                      setForm({ ...form, items });
                    }}
                  />
                  <Select
                    label="Unit"
                    value={unit}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[idx] = {
                        ...items[idx],
                        unit: e.target.value as OrderUnit,
                      };
                      setForm({ ...form, items });
                    }}
                  >
                    {ORDER_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {ORDER_UNIT_LABELS[u]}
                      </option>
                    ))}
                  </Select>
                  {unit === "m2" ? (
                    <>
                      <Input
                        label="Width (cm)"
                        type="number"
                        value={item.tileWidthCm ?? 60}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].tileWidthCm = Number(e.target.value);
                          setForm({ ...form, items });
                        }}
                      />
                      <Input
                        label="Length (cm)"
                        type="number"
                        value={item.tileHeightCm ?? 60}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].tileHeightCm = Number(e.target.value);
                          setForm({ ...form, items });
                        }}
                      />
                      {!item.thicknessOverride ? (
                        <div className="flex items-end">
                          <button
                            type="button"
                            className="text-xs text-zinc-500 underline hover:text-zinc-800"
                            onClick={() => {
                              const items = [...form.items];
                              items[idx].thicknessOverride = true;
                              setForm({ ...form, items });
                            }}
                          >
                            Add tile height manually (optional)
                          </button>
                        </div>
                      ) : (
                        <Input
                          label="Height (mm)"
                          type="number"
                          step="0.1"
                          value={
                            item.tileThicknessCm != null
                              ? Math.round(item.tileThicknessCm * 1000) / 10
                              : ""
                          }
                          onChange={(e) => {
                            const items = [...form.items];
                            const mm = e.target.value;
                            items[idx].tileThicknessCm = mm
                              ? Number(mm) / 10
                              : undefined;
                            setForm({ ...form, items });
                          }}
                        />
                      )}
                      <Input
                        label="Quantity (m²)"
                        type="number"
                        step="0.01"
                        value={item.quantityM2 ?? 0}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].quantityM2 = Number(e.target.value);
                          setForm({ ...form, items });
                        }}
                      />
                      <Input
                        label={`Your pallets (calc. ${lineCalc?.calculatedPallets ?? 0})`}
                        type="number"
                        step="0.01"
                        placeholder={String(lineCalc?.calculatedPallets ?? 0)}
                        value={item.manualPallets ?? ""}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].manualPallets = e.target.value
                            ? Number(e.target.value)
                            : undefined;
                          setForm({ ...form, items });
                        }}
                      />
                      <Input
                        label={`Your pieces (calc. ${lineCalc?.calculatedPieces ?? 0})`}
                        type="number"
                        placeholder={String(lineCalc?.calculatedPieces ?? 0)}
                        value={item.manualPieces ?? ""}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].manualPieces = e.target.value
                            ? Number(e.target.value)
                            : undefined;
                          setForm({ ...form, items });
                        }}
                      />
                    </>
                  ) : unit === "kg" ? (
                    <>
                      <Input
                        label="Total weight (kg)"
                        type="number"
                        step="0.1"
                        value={item.weightKg ?? 0}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].weightKg = Number(e.target.value);
                          setForm({ ...form, items });
                        }}
                      />
                      <Input
                        label={`Your pieces (calc. ${weightCalc?.calculatedPieces ?? 0})`}
                        type="number"
                        placeholder={String(weightCalc?.calculatedPieces ?? 0)}
                        value={item.manualPieces ?? ""}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].manualPieces = e.target.value
                            ? Number(e.target.value)
                            : undefined;
                          setForm({ ...form, items });
                        }}
                      />
                    </>
                  ) : unit === "meter" ? (
                    <Input
                      label="Length (meters)"
                      type="number"
                      step="0.01"
                      value={item.lengthM ?? 0}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx].lengthM = Number(e.target.value);
                        setForm({ ...form, items });
                      }}
                    />
                  ) : (
                    <>
                      <Input
                        label="Quantity (pieces)"
                        type="number"
                        value={item.manualPieces ?? ""}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].manualPieces = e.target.value
                            ? Number(e.target.value)
                            : undefined;
                          setForm({ ...form, items });
                        }}
                      />
                      <Input
                        label="Weight (kg) — optional"
                        type="number"
                        step="0.1"
                        value={item.weightKg ?? ""}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].weightKg = e.target.value
                            ? Number(e.target.value)
                            : undefined;
                          setForm({ ...form, items });
                        }}
                      />
                    </>
                  )}
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        setForm({
                          ...form,
                          items: form.items.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                  {lineCalc && (
                    <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                      <p className="font-medium text-zinc-800">
                        {"label" in lineCalc
                          ? `${lineCalc.label} (catalog pallet)`
                          : (lineCalc as ReturnType<typeof calculateTileLine>).standardLabel}
                      </p>
                      <p className="mt-1">
                        Calculated: {lineCalc.calculatedPieces} pieces,{" "}
                        {lineCalc.calculatedPallets} pallets (
                        {lineCalc.m2PerPallet.toFixed(2)} m²/pallet ·{" "}
                        {lineCalc.piecesPerPallet} pcs/pallet · ~
                        {lineCalc.kgPerPallet} kg/pallet).
                        {"truckPalletSlots" in lineCalc &&
                        lineCalc.truckPalletSlots !== lineCalc.palletCount ? (
                          <> · {lineCalc.truckPalletSlots} truck slot(s)</>
                        ) : null}
                        {"weightKg" in lineCalc && lineCalc.weightKg > 0 ? (
                          <> · ~{lineCalc.weightKg.toFixed(0)} kg for this line</>
                        ) : null}
                      </p>
                    </div>
                  )}
                  {weightCalc && (
                    <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                      <p className="font-medium text-zinc-800">
                        Weight-based quantity
                      </p>
                      <p className="mt-1">
                        {weightCalc.unitWeightKg != null
                          ? `Pack size ${weightCalc.unitWeightKg} kg from name · calculated ${weightCalc.calculatedPieces} pieces for ${weightCalc.totalWeightKg} kg total.`
                          : weightCalc.note ??
                            "Enter pack weight in the product name (e.g. 25 kg)."}
                      </p>
                    </div>
                  )}
                </div>
              );
              })}
            </div>

            <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              Calculated totals: {formatM2(preview.totalM2)} m² ·{" "}
              {preview.totalPieces} pieces · {preview.totalPallets} pallets
              {(preview.totalTruckPalletSlots ?? preview.totalPallets) >
              preview.totalPallets
                ? ` (${preview.totalTruckPalletSlots} truck slots)`
                : ""}{" "}
              · ~{preview.totalWeightKg.toFixed(0)} kg
            </div>

            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {selectedOrderIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-violet-50 px-4 py-2">
            <span className="text-sm font-medium text-violet-900">
              {selectedOrderIds.size} selected
            </span>
            {filters.vehicleId && (
              <Button
                variant="secondary"
                className="text-xs"
                onClick={() => bulkAssignToFocusTruck()}
              >
                Assign to {focusVehicle?.name ?? "truck"}
              </Button>
            )}
            <Button
              variant="secondary"
              className="text-xs"
              onClick={() => bulkClearSelected()}
            >
              Clear all assignments
            </Button>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => bulkClearSelected({ truck: true })}
            >
              Clear trucks only
            </Button>
            <select
              className="rounded border border-violet-200 bg-white px-2 py-1 text-xs"
              value={transferVehicleId}
              onChange={(e) => setTransferVehicleId(e.target.value)}
              aria-label="Transfer to truck"
            >
              <option value="">
                {filters.vehicleId
                  ? `Transfer to other truck…`
                  : "Transfer to truck…"}
              </option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.plateNumber})
                </option>
              ))}
            </select>
            <select
              className="rounded border border-violet-200 bg-white px-2 py-1 text-xs"
              value={transferRound}
              onChange={(e) => setTransferRound(e.target.value)}
              aria-label="Delivery round"
            >
              {deliveryRoundSelectOptions().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              className="text-xs"
              disabled={!transferVehicleId}
              onClick={() => bulkTransferToTruck()}
            >
              Transfer selected
            </Button>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => setSelectedOrderIds(new Set())}
            >
              Deselect
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                aria-label="Select all orders"
                checked={
                  visibleOrders.length > 0 &&
                  visibleOrders.every((o) => selectedOrderIds.has(o.id))
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedOrderIds(
                      new Set(visibleOrders.map((o) => o.id))
                    );
                  } else {
                    setSelectedOrderIds(new Set());
                  }
                }}
              />
              Select all
            </label>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["list", "List"],
                  ["grid", "Grid"],
                  ["cards", "Cards"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setOrderViewMode(mode)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    orderViewMode === mode
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["unassigned", "Open"],
                  ["assigned", "Assigned"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAssignmentFilter(value)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    assignmentFilter === value
                      ? value === "assigned"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : value === "unassigned"
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <p className="font-medium text-zinc-700">
              {visibleOrders.length} shown · {assignedCount} assigned ·{" "}
              {unassignedCount} open
            </p>
            {lastRefreshed && (
              <p>Updated {lastRefreshed.toLocaleTimeString()}</p>
            )}
          </div>
        </div>
        <div className="max-h-[min(72vh,880px)] overflow-y-auto overscroll-y-contain bg-zinc-50/40 p-3 sm:p-4">
          {loading && orders.length === 0 ? (
            <LoadingState title="Loading orders…" />
          ) : visibleOrders.length === 0 ? (
            <p className="py-8 text-center text-slate-500">
              {orders.length === 0
                ? "No orders yet."
                : "No orders match this filter."}
            </p>
          ) : orderViewMode === "cards" ? (
            <div className="space-y-4">
            {visibleOrders.map((order) => {
              const draft: AssignmentDraft = assignState[order.id] ?? {
                vehicleId: filters.vehicleId ?? "",
                round: filters.deliveryRound || "1",
                pickerId: "",
              };
              const onFocusTruck =
                Boolean(filters.vehicleId) &&
                order.assignment?.vehicleId === Number(filters.vehicleId) &&
                order.assignment?.deliveryRound === focusRound;
              const availableForFocus =
                Boolean(filters.vehicleId) && !order.assignment;

              return (
                <OrderListCard
                  key={order.id}
                  order={order}
                  selected={selectedOrderIds.has(order.id)}
                  expanded={expandedOrderId === order.id}
                  highlightFocus={onFocusTruck}
                  highlightAvailable={availableForFocus}
                  preferredVehicleId={filters.vehicleId || undefined}
                  focusVehicleName={focusVehicle?.name}
                  focusDeliveryRound={filters.deliveryRound}
                  draft={draft}
                  vehicles={vehicles}
                  pickers={pickers}
                  onSelectChange={(checked) => {
                    const next = new Set(selectedOrderIds);
                    if (checked) next.add(order.id);
                    else next.delete(order.id);
                    setSelectedOrderIds(next);
                  }}
                  onToggleExpand={() =>
                    setExpandedOrderId(
                      expandedOrderId === order.id ? null : order.id
                    )
                  }
                  onEdit={() => startEdit(order)}
                  onDelete={() => deleteOrder(order.id)}
                  onDraftChange={(next) =>
                    setAssignState((prev) => ({ ...prev, [order.id]: next }))
                  }
                  onSaved={load}
                  onError={setError}
                  onWarning={(msg) => {
                    setWarning(msg);
                    setTimeout(() => setWarning(""), 3000);
                  }}
                  onSuggestUrgentRoute={() => suggestUrgentRoute(order)}
                  onQuickAssignToFocus={
                    filters.vehicleId &&
                    !(
                      order.assignment?.vehicleId ===
                        Number(filters.vehicleId) &&
                      order.assignment?.deliveryRound === focusRound
                    )
                      ? () => quickAssignOrderToFocus(order)
                      : undefined
                  }
                />
              );
            })}
            </div>
          ) : (
            <OrderBoardView
              mode={orderViewMode}
              orders={visibleOrders}
              selectedOrderIds={selectedOrderIds}
              expandedAssignId={expandedAssignId}
              assignState={assignState}
              vehicles={vehicles}
              pickers={pickers}
              preferredVehicleId={filters.vehicleId || undefined}
              focusVehicleName={focusVehicle?.name}
              focusDeliveryRound={filters.deliveryRound}
              focusRound={focusRound}
              focusVehicleId={filters.vehicleId || undefined}
              onSelectChange={(orderId, checked) => {
                const next = new Set(selectedOrderIds);
                if (checked) next.add(orderId);
                else next.delete(orderId);
                setSelectedOrderIds(next);
              }}
              onToggleAssign={openAssignPanel}
              onEdit={(boardOrder) => {
                const full = visibleOrders.find((o) => o.id === boardOrder.id);
                if (full) startEdit(full);
              }}
              onDelete={deleteOrder}
              onDraftChange={(orderId, next) =>
                setAssignState((prev) => ({ ...prev, [orderId]: next }))
              }
              onSaved={load}
              onError={setError}
              onWarning={(msg) => {
                setWarning(msg);
                setTimeout(() => setWarning(""), 3000);
              }}
              onQuickAssignToFocus={(boardOrder) => {
                const full = visibleOrders.find((o) => o.id === boardOrder.id);
                if (full) void quickAssignOrderToFocus(full);
              }}
            />
          )}
        </div>
      </Card>

      <SmartDispatchPanel
        regionFilter={filters.region || undefined}
        onApplied={load}
        onError={setError}
        onWarning={setWarning}
      />
    </AppShell>
  );
}
