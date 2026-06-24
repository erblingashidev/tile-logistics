"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LocationPicker } from "@/components/LocationPicker";
import { OrderInvoice } from "@/components/OrderInvoice";
import {
  OrderAssignmentPanel,
  type AssignmentDraft,
} from "@/components/OrderAssignmentPanel";
import { SmartDispatchPanel } from "@/components/SmartDispatchPanel";
import {
  InvoiceImportPanel,
  type InvoiceImportFormState,
} from "@/components/InvoiceImportPanel";
import { Badge, Button, Card, Input, Select, Alert, PageSection, tableClass } from "@/components/ui";
import {
  orderListRowClass,
  orderStageBadgeTone,
  type OrderDisplayStage,
} from "@/lib/order-display";
import {
  calculateOrderTotals,
  calculateTileLine,
  formatM2,
  tileSpecOptionsForItem,
} from "@/lib/calculations";
import {
  DELIVERY_TIME_PREFERENCE_LABELS,
  DELIVERY_TIME_PREFERENCES,
  formatDeliverySchedule,
  deliveryScheduleBadgeTone,
  isOrderReadyToShip,
} from "@/lib/delivery-schedule";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import { KOSOVO_MUNICIPALITIES } from "@/lib/locations";

interface OrderItem {
  productType: "tile" | "adhesive";
  productName?: string;
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number;
  thicknessOverride?: boolean;
  quantityM2?: number;
  weightKg?: number;
  manualPallets?: number;
  manualPieces?: number;
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
  totalM2: number;
  totalPieces: number;
  totalPallets: number;
  totalWeightKg: number;
  items: Array<{
    productType: string;
    productName?: string | null;
    quantityM2?: number | null;
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
}

interface EmployeeOption {
  id: number;
  name: string;
  status: string;
  roles: string[];
}

const emptyItem = (): OrderItem => ({
  productType: "tile",
  productName: "",
  tileWidthCm: 60,
  tileHeightCm: 120,
  quantityM2: 0,
});

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
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
  });
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    invoiceNumber: "",
    customerName: "",
    customerPhone: "",
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
    items: [emptyItem()] as OrderItem[],
  });
  const [assignState, setAssignState] = useState<
    Record<number, AssignmentDraft>
  >({});
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(
    new Set()
  );
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    const [ordersRes, vehiclesRes, employeesRes] = await Promise.all([
      fetch(`/api/orders?${params}`, { cache: "no-store" }),
      fetch("/api/vehicles", { cache: "no-store" }),
      fetch("/api/employees", { cache: "no-store" }),
    ]);
    setOrders(await ordersRes.json());
    setVehicles(await vehiclesRes.json());
    setEmployees(await employeesRes.json());
    setLastRefreshed(new Date());
  }, [filters]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    setAssignState((prev) => {
      const next = { ...prev };
      for (const order of orders) {
        if (!order.assignment) continue;
        const current = prev[order.id];
        if (!current?.vehicleId) {
          next[order.id] = {
            vehicleId: String(order.assignment.vehicleId),
            round: String(order.assignment.deliveryRound),
            pickerId:
              current?.pickerId ??
              (order.staff?.picker?.employeeId
                ? String(order.staff.picker.employeeId)
                : ""),
          };
        }
      }
      return next;
    });
  }, [orders]);

  const preview = calculateOrderTotals(form.items);

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
      notes: form.customerPhone.trim()
        ? `Phone: ${form.customerPhone.trim()}`
        : undefined,
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
      items:
        order.items.length > 0
          ? order.items.map((i) => {
              const w = i.tileWidthCm ?? 60;
              const h = i.tileHeightCm ?? 60;
              const m2 = i.quantityM2 ?? 0;
              const item: OrderItem = {
                productType: i.productType as "tile" | "adhesive",
                productName: i.productName ?? "",
                tileWidthCm: w,
                tileHeightCm: h,
                tileThicknessCm: i.tileThicknessCm ?? undefined,
                thicknessOverride: i.tileThicknessCm != null,
                quantityM2: m2,
                weightKg: i.weightKg ?? 0,
              };
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

  const pickers = employees.filter((e) => e.roles.includes("picker"));
  const drivers = employees.filter((e) => e.roles.includes("driver"));

  function openFormFromInvoice(importForm: InvoiceImportFormState) {
    setEditingId(null);
    setError("");
    setForm({
      invoiceNumber: importForm.invoiceNumber,
      customerName: importForm.customerName,
      customerPhone: importForm.customerPhone ?? "",
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
      items: importForm.items.map((item) => ({
        productType: item.productType,
        productName: item.productName ?? "",
        tileWidthCm: item.tileWidthCm ?? 60,
        tileHeightCm: item.tileHeightCm ?? 120,
        quantityM2: item.quantityM2 ?? 0,
      })),
    });
    setShowForm(true);
  }

  return (
    <AppShell title="Orders">
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
        </div>
        <p className="text-sm text-zinc-500">
          Pallet/piece values show system calculations — enter your own if
          different.
        </p>
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
              <span className="h-3 w-3 rounded-sm bg-amber-200 ring-1 ring-amber-300" />
              Assigned / on the way
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-green-200 ring-1 ring-green-300" />
              Arrived / delivered
            </span>
            <Button variant="secondary" className="text-xs" onClick={load}>
              Refresh now
            </Button>
            {lastRefreshed && (
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
              <Input
                label="Invoice #"
                required
                value={form.invoiceNumber}
                onChange={(e) =>
                  setForm({ ...form, invoiceNumber: e.target.value })
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
            </div>
            <p className="text-xs text-zinc-500">
              Leave delivery date empty to ship as soon as the order is ready.
              Set a date when the customer wants delivery days later (e.g. in 3
              days). Time preference is optional — use morning when they ask for
              an early slot.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Products</h4>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      items: [...form.items, emptyItem()],
                    })
                  }
                >
                  + Add product
                </Button>
              </div>
              {form.items.map((item, idx) => {
                const w = item.tileWidthCm ?? 60;
                const h = item.tileHeightCm ?? 60;
                const m2 = item.quantityM2 ?? 0;
                const specOptions = tileSpecOptionsForItem(item);
                const lineCalc =
                  item.productType === "tile"
                    ? calculateTileLine(w, h, m2, specOptions)
                    : null;

                return (
                <div
                  key={idx}
                  className="space-y-3 rounded-lg border border-slate-200 p-3"
                >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Select
                    label="Type"
                    value={item.productType}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[idx] = {
                        ...items[idx],
                        productType: e.target.value as "tile" | "adhesive",
                      };
                      setForm({ ...form, items });
                    }}
                  >
                    <option value="tile">Tile (m² + dimensions)</option>
                    <option value="adhesive">Adhesive (kg)</option>
                  </Select>
                  {item.productType === "tile" ? (
                    <>
                      <Input
                        label="Product name"
                        value={item.productName ?? ""}
                        onChange={(e) => {
                          const items = [...form.items];
                          items[idx].productName = e.target.value;
                          setForm({ ...form, items });
                        }}
                      />
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
                          label="Height (mm) — optional"
                          type="number"
                          step="0.1"
                          hint="Only if non-standard — adjusts pallet calculation"
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
                  ) : (
                    <Input
                      label="Weight (kg) — advisory for vehicle load"
                      type="number"
                      step="0.1"
                      value={item.weightKg ?? 0}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx].weightKg = Number(e.target.value);
                        setForm({ ...form, items });
                      }}
                    />
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
                        {lineCalc.standardLabel}
                      </p>
                      <p className="mt-1">
                        Calculated: {lineCalc.calculatedPieces} pieces,{" "}
                        {lineCalc.calculatedPallets} pallets (
                        {lineCalc.m2PerPallet.toFixed(2)} m²/pallet ·{" "}
                        {lineCalc.piecesPerPallet} pcs/pallet · ~
                        {lineCalc.kgPerPallet} kg/pallet).
                      </p>
                      {lineCalc.note && (
                        <p className="mt-1 text-zinc-500">{lineCalc.note}</p>
                      )}
                    </div>
                  )}
                </div>
              );
              })}
            </div>

            <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              Calculated totals: {formatM2(preview.totalM2)} m² ·{" "}
              {preview.totalPieces} pieces · {preview.totalPallets} pallets · ~
              {preview.totalWeightKg.toFixed(0)} kg
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
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => setSelectedOrderIds(new Set())}
            >
              Deselect
            </Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={
                      orders.length > 0 &&
                      selectedOrderIds.size === orders.length
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedOrderIds(new Set(orders.map((o) => o.id)));
                      } else {
                        setSelectedOrderIds(new Set());
                      }
                    }}
                  />
                </th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Products</th>
                <th>Region</th>
                <th>Date</th>
                <th>Delivery</th>
                <th>m²</th>
                <th>Pieces</th>
                <th>Pallets</th>
                <th>Kg</th>
                <th>Price</th>
                <th>Status</th>
                <th>Assign</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const stage = (order.deliveryStage ??
                  order.status) as OrderDisplayStage;
                const isComplete =
                  stage === "delivered" || stage === "arrived";
                const hasAnyAssignment = Boolean(
                  order.assignment ||
                    order.staff?.picker ||
                    order.staff?.staff?.some((s) =>
                      ["driver", "unloader"].includes(s.role)
                    )
                );
                const hasProgress = (order.proofs?.length ?? 0) > 0;
                const draft: AssignmentDraft = assignState[order.id] ?? {
                  vehicleId: "",
                  round: "1",
                  pickerId: "",
                };

                return (
                <Fragment key={order.id}>
                <tr
                  className={`border-b align-top ${orderListRowClass(stage)}`}
                >
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.has(order.id)}
                      onChange={(e) => {
                        const next = new Set(selectedOrderIds);
                        if (e.target.checked) next.add(order.id);
                        else next.delete(order.id);
                        setSelectedOrderIds(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-3 font-medium">
                    {order.invoiceNumber}
                  </td>
                  <td className="px-2 py-3">{order.customerName}</td>
                  <td className="max-w-[240px] px-2 py-3">
                    {order.items.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <ul className="space-y-1 text-xs leading-snug">
                        {order.items.map((item, idx) => (
                          <li key={idx}>
                            <span className="font-medium text-zinc-900">
                              {item.productName?.trim() ||
                                (item.productType === "tile"
                                  ? "Tile"
                                  : "Adhesive")}
                            </span>
                            {item.tileWidthCm && item.tileHeightCm ? (
                              <span className="text-zinc-500">
                                {" "}
                                · {item.tileWidthCm}×{item.tileHeightCm} cm
                              </span>
                            ) : null}
                            {item.quantityM2 != null ? (
                              <span className="text-zinc-600">
                                {" "}
                                · {formatM2(item.quantityM2)} m²
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {order.region ?? order.city ?? "—"}
                  </td>
                  <td className="px-2 py-3">{order.orderDate}</td>
                  <td className="px-2 py-3">
                    <Badge tone={deliveryScheduleBadgeTone(order)}>
                      {formatDeliverySchedule(order)}
                    </Badge>
                    {!isOrderReadyToShip(order) && (
                      <p className="mt-1 text-[10px] text-amber-700">
                        Not in dispatch until{" "}
                        {order.requestedDeliveryDate}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-3">{formatM2(order.totalM2)}</td>
                  <td className="px-2 py-3">{order.totalPieces}</td>
                  <td className="px-2 py-3">{order.totalPallets}</td>
                  <td className="px-2 py-3">
                    {order.totalWeightKg.toFixed(0)}
                  </td>
                  <td className="px-2 py-3">{order.price.toFixed(2)}</td>
                  <td className="px-2 py-3">
                    <Badge tone={orderStageBadgeTone(stage)}>
                      {order.deliveryStageLabel ??
                        order.status.replace(/_/g, " ")}
                    </Badge>
                    {order.proofs && order.proofs.length > 0 && (
                      <p className="mt-1 text-xs text-zinc-600">
                        {order.proofs.length} proof step
                        {order.proofs.length !== 1 ? "s" : ""} recorded
                      </p>
                    )}
                    {order.loadStatus === "loaded" && (
                      <p className="mt-1 text-xs text-green-700">✓ Loaded on truck</p>
                    )}
                    {order.loadStatus === "load_skipped" && (
                      <p className="mt-1 text-xs text-red-700">
                        ✗ Not loaded
                        {order.loadNotes ? `: ${order.loadNotes}` : ""}
                      </p>
                    )}
                    {order.loadStatus === "pending" && order.assignment && (
                      <p className="mt-1 text-xs text-amber-700">
                        ○ Waiting for loader
                      </p>
                    )}
                    {order.assignment && (
                      <p className="mt-1 text-xs text-slate-500">
                        {order.assignment.vehicleName} ·{" "}
                        {formatDeliveryRound(order.assignment.deliveryRound, "short")}
                        {order.assignment.driverName &&
                          ` · ${order.assignment.driverName}`}
                      </p>
                    )}
                    {order.staff?.picker && (
                      <p className="mt-1 text-xs text-slate-500">
                        Picker: {order.staff.picker.employeeName}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {isComplete ? (
                      <p className="text-xs text-green-700">
                        {stage === "delivered"
                          ? "Delivery complete"
                          : "Arrived at customer"}
                      </p>
                    ) : (
                      <OrderAssignmentPanel
                        orderId={order.id}
                        invoiceNumber={order.invoiceNumber}
                        hasAssignment={hasAnyAssignment}
                        hasProgress={hasProgress}
                        draft={draft}
                        vehicles={vehicles}
                        pickers={pickers}
                        onDraftChange={(next) =>
                          setAssignState({ ...assignState, [order.id]: next })
                        }
                        onSaved={load}
                        onError={setError}
                        onWarning={(msg) => {
                          setWarning(msg);
                          setTimeout(() => setWarning(""), 3000);
                        }}
                      />
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() =>
                          setExpandedOrderId(
                            expandedOrderId === order.id ? null : order.id
                          )
                        }
                      >
                        {expandedOrderId === order.id ? "Hide" : "Details"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() => startEdit(order)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-xs text-red-600"
                        onClick={() => deleteOrder(order.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedOrderId === order.id && (
                  <tr key={`${order.id}-details`} className="border-b bg-zinc-100/80">
                    <td colSpan={13} className="px-4 py-6">
                      <OrderInvoice order={order} />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
          {orders.length === 0 && (
            <p className="py-8 text-center text-slate-500">No orders yet.</p>
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
