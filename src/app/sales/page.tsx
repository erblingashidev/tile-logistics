"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderInvoice, type OrderInvoiceData } from "@/components/OrderInvoice";
import {
  PortalCard,
  PortalChip,
  PortalSectionTitle,
} from "@/components/portal/PortalShell";
import { Alert, Badge, EmptyState, Input, Select } from "@/components/ui";
import { readJsonListWithError } from "@/lib/api/read-json-list";
import { formatDeliverySchedule } from "@/lib/delivery-schedule";
import {
  isOrderOnTheWay,
  isOrderWaitingToSend,
  orderStageBadgeTone,
  salesQueueCounts,
  type OrderDisplayStage,
} from "@/lib/order-display";

type SalesFilter = "active" | "waiting" | "on_the_way" | "delivered" | "all";

interface SalesOrder {
  id: number;
  invoiceNumber: string;
  customerName: string;
  region?: string | null;
  city?: string | null;
  location: string;
  orderDate: string;
  requestedDeliveryDate?: string | null;
  deliveryTimePreference?: string | null;
  status: string;
  notes?: string | null;
  totalM2: number;
  totalPallets: number;
  totalPieces: number;
  totalWeightKg: number;
  price: number;
  deliveryStage?: OrderDisplayStage;
  deliveryStageLabel?: string;
  salesAgentDisplayName?: string | null;
  loadStatus?: "pending" | "loaded" | "load_skipped";
  loadNotes?: string | null;
  assignment?: {
    vehicleName: string;
    plateNumber: string;
    deliveryRound: number;
  } | null;
  staff?: {
    picker?: { employeeName: string } | null;
    driver?: { employeeName: string } | null;
  };
  items?: OrderInvoiceData["items"];
  proofs?: OrderInvoiceData["proofs"];
}

interface SalesAgent {
  id: number;
  name: string;
}

function phoneFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Phone:\s*([^\n·]+)/i);
  return match?.[1]?.trim() ?? null;
}

function matchesFilter(order: SalesOrder, filter: SalesFilter): boolean {
  const stage = order.deliveryStage ?? "pending";
  if (filter === "all") return true;
  if (filter === "delivered") return stage === "delivered";
  if (filter === "waiting") return isOrderWaitingToSend(stage);
  if (filter === "on_the_way") return isOrderOnTheWay(stage);
  return stage !== "delivered" && stage !== "cancelled";
}

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [agentId, setAgentId] = useState("");
  const [filter, setFilter] = useState<SalesFilter>("active");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const roles: string[] = data?.user?.roles ?? [];
        setIsAdmin(roles.includes("sales_admin"));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void fetch("/api/sales/orders?view=agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data);
      })
      .catch(() => undefined);
  }, [isAdmin]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (isAdmin && agentId) params.set("salesAgentId", agentId);

    const res = await fetch(`/api/sales/orders?${params}`, { cache: "no-store" });
    const payload = await readJsonListWithError<SalesOrder>(res);
    setOrders(payload.data);
    setError(payload.error ?? "");
    setLastRefreshed(new Date());
    setLoading(false);
  }, [agentId, isAdmin, search]);

  useEffect(() => {
    setLoading(true);
    void load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const counts = useMemo(() => salesQueueCounts(orders), [orders]);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (!matchesFilter(order, filter)) return false;
      if (!term) return true;
      return (
        order.invoiceNumber.toLowerCase().includes(term) ||
        order.customerName.toLowerCase().includes(term) ||
        order.location.toLowerCase().includes(term) ||
        (order.region ?? "").toLowerCase().includes(term) ||
        (order.salesAgentDisplayName ?? "").toLowerCase().includes(term)
      );
    });
  }, [filter, orders, search]);

  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PortalCard className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Waiting to send
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{counts.waiting}</p>
        </PortalCard>
        <PortalCard className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            On the way
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{counts.onTheWay}</p>
        </PortalCard>
        <PortalCard className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Delivered
          </p>
          <p className="mt-1 text-2xl font-bold text-green-700">{counts.delivered}</p>
        </PortalCard>
        <PortalCard className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Active total
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{counts.active}</p>
        </PortalCard>
      </div>

      <PortalCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Search client or invoice"
            placeholder="Invoice, customer, agent…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {isAdmin && (
            <Select
              label="Sales agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">All agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={String(agent.id)}>
                  {agent.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["active", "Active"],
              ["waiting", "Waiting"],
              ["on_the_way", "On the way"],
              ["delivered", "Delivered"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <PortalChip
              key={id}
              selected={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </PortalChip>
          ))}
        </div>
        {lastRefreshed && (
          <p className="mt-3 text-xs text-zinc-500">
            Updated {lastRefreshed.toLocaleTimeString()} · refreshes every 30s
          </p>
        )}
      </PortalCard>

      <section>
        <PortalSectionTitle className="mb-3">
          {isAdmin
            ? agentId
              ? "Orders for selected agent"
              : "All orders"
            : "My orders"}
        </PortalSectionTitle>

        {loading ? (
          <PortalCard>
            <p className="text-sm text-zinc-500">Loading orders…</p>
          </PortalCard>
        ) : visibleOrders.length === 0 ? (
          <PortalCard>
            <EmptyState title="No orders match this view." />
          </PortalCard>
        ) : (
          <div className="space-y-3">
            {visibleOrders.map((order) => {
              const stage = order.deliveryStage ?? "pending";
              const phone = phoneFromNotes(order.notes);
              const expanded = expandedId === order.id;

              return (
                <PortalCard key={order.id} className="overflow-hidden">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() =>
                      setExpandedId(expanded ? null : order.id)
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-zinc-900">
                          {order.invoiceNumber}
                        </p>
                        <p className="text-sm text-zinc-700">
                          {order.customerName}
                        </p>
                        {phone && (
                          <p className="mt-1 text-sm font-medium text-zinc-800">
                            {phone}
                          </p>
                        )}
                        {isAdmin && order.salesAgentDisplayName && (
                          <p className="mt-1 text-xs font-medium text-zinc-600">
                            Agent: {order.salesAgentDisplayName}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-zinc-500">
                          {[order.region, order.location].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDeliverySchedule(order)}
                        </p>
                        {order.assignment && (
                          <p className="mt-1 text-xs text-zinc-600">
                            Truck: {order.assignment.vehicleName} (round{" "}
                            {order.assignment.deliveryRound})
                          </p>
                        )}
                      </div>
                      <Badge tone={orderStageBadgeTone(stage)}>
                        {order.deliveryStageLabel ?? stage}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                      <span>{order.totalPallets} pallets</span>
                      <span>{order.totalM2.toFixed(1)} m²</span>
                      {order.staff?.picker?.employeeName && (
                        <span>Picker: {order.staff.picker.employeeName}</span>
                      )}
                      {order.staff?.driver?.employeeName && (
                        <span>Driver: {order.staff.driver.employeeName}</span>
                      )}
                    </div>

                    <p className="mt-2 text-xs font-medium text-zinc-500">
                      {expanded ? "Hide details ▲" : "Client details ▼"}
                    </p>
                  </button>

                  {expanded && (
                    <div className="mt-4 border-t border-zinc-100 pt-4">
                      <OrderInvoice
                        order={
                          {
                            ...order,
                            items: order.items ?? [],
                          } satisfies OrderInvoiceData
                        }
                      />
                    </div>
                  )}
                </PortalCard>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
