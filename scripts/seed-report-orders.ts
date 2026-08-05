/**
 * Adds sample orders for daily report testing (prefix RPT-).
 * Does not wipe existing data. Safe to re-run — skips invoices that already exist.
 *
 *   npm run seed:reports:local
 *   npm run seed:reports
 */
import { eq } from "drizzle-orm";
import {
  configureScriptDatabase,
  describeScriptDatabaseTarget,
  printDatabaseMismatchHint,
} from "./db-target";
import { getDb } from "../src/lib/db";
import { dbOne } from "../src/lib/db/query";
import {
  employees,
  orders,
  vehicles,
} from "../src/lib/db/schema";
import type { EmployeeRole } from "../src/lib/constants";
import {
  KOSOVO_LOCATIONS,
  type LocationEntry,
} from "../src/lib/locations/kosovo-locations";
import {
  assignEmployeeToOrder,
  createEmployee,
} from "../src/lib/services/employees";
import {
  assignOrderBundle,
  createOrder,
} from "../src/lib/services/orders";
import { createVehicle } from "../src/lib/services/vehicles";
import { submitAdminDeliveryProof } from "../src/lib/services/delivery-proofs";
import type { DeliveryProofPhase } from "../src/lib/constants";

const DEMO_PASSWORD = "demo123";
const INVOICE_PREFIX = "RPT-";

configureScriptDatabase();
printDatabaseMismatchHint();

function loc(id: string): LocationEntry {
  const found = KOSOVO_LOCATIONS.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown location id: ${id}`);
  return found;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function findEmployeeByUsername(username: string) {
  const db = await getDb();
  return dbOne(
    db.select().from(employees).where(eq(employees.username, username))
  );
}

async function ensureEmployee(input: {
  name: string;
  username: string;
  roles: EmployeeRole[];
}) {
  const existing = await findEmployeeByUsername(input.username);
  if (existing) return existing.id;
  const created = await createEmployee({
    ...input,
    password: DEMO_PASSWORD,
  });
  console.log(`  + staff ${input.name} (@${input.username})`);
  return created!.id;
}

async function ensureVehicle(plate: string, input: {
  name: string;
  maxWeightKg: number;
  maxPallets: number;
}) {
  const db = await getDb();
  const existing = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.plateNumber, plate))
  );
  if (existing) return existing.id;
  const created = await createVehicle({ ...input, plateNumber: plate });
  console.log(`  + truck ${created!.name}`);
  return created!.id;
}

async function orderExists(invoiceNumber: string) {
  const db = await getDb();
  return dbOne(
    db.select({ id: orders.id }).from(orders).where(eq(orders.invoiceNumber, invoiceNumber))
  );
}

function item(pallets: number) {
  return [
    {
      unit: "m2" as const,
      productName: "AGIMI Porcelain 60×120",
      productEan: "3830061234567",
      tileWidthCm: 60,
      tileHeightCm: 120,
      tileThicknessCm: 2,
      quantityM2: pallets * 23.04,
      manualPallets: pallets,
    },
  ];
}

function price(pallets: number) {
  return Math.round(pallets * 23.04 * 12.5 * 100) / 100;
}


async function runProofs(
  orderId: number,
  phases: DeliveryProofPhase[],
  pickerId: number,
  driverId: number,
  options?: { partialPallets?: number; partialM2?: number }
) {
  for (const phase of phases) {
    const isLoaderPhase =
      phase === "prepared" ||
      phase === "loaded" ||
      phase === "load_skipped";
    const result = await submitAdminDeliveryProof({
      orderId,
      phase,
      employeeId: isLoaderPhase ? pickerId : driverId,
      force:
        phase === "loaded" ||
        phase === "departed" ||
        phase === "delivered" ||
        phase === "partial_delivery",
      allowDeliveredWithoutPhoto:
        phase === "delivered" || phase === "partial_delivery",
      notes:
        phase === "delivered" || phase === "partial_delivery"
          ? "Report test — phone confirmation"
          : undefined,
      sentPallets:
        phase === "partial_delivery" ? options?.partialPallets : undefined,
      sentM2: phase === "partial_delivery" ? options?.partialM2 : undefined,
    });
    if (!result.ok) {
      throw new Error(`${phase} failed for order ${orderId}: ${result.error}`);
    }
  }
}

type Scenario = {
  invoice: string;
  customer: string;
  locationId: string;
  pallets: number;
  orderDate: string;
  requestedDeliveryDate?: string | null;
  priority?: "normal" | "urgent";
  notes?: string;
  assign?: { picker: "a" | "b"; round: number; truck: "a" | "b" };
  proofs?: DeliveryProofPhase[];
  partial?: { pallets: number; m2: number };
};

const SCENARIOS: Scenario[] = [
  {
    invoice: `${INVOICE_PREFIX}1001`,
    customer: "Drita Construction",
    locationId: "prishtine-center",
    pallets: 2,
    orderDate: today(),
    notes: "Unassigned — waiting",
  },
  {
    invoice: `${INVOICE_PREFIX}1002`,
    customer: "Euro Build SHPK",
    locationId: "ferizaj",
    pallets: 3,
    orderDate: today(),
    priority: "urgent",
    notes: "Urgent — not assigned yet",
  },
  {
    invoice: `${INVOICE_PREFIX}1003`,
    customer: "Graniti & Co",
    locationId: "peje",
    pallets: 2,
    orderDate: today(),
    assign: { picker: "a", round: 1, truck: "a" },
    notes: "Assigned — picker A",
  },
  {
    invoice: `${INVOICE_PREFIX}1004`,
    customer: "Tile House Prishtina",
    locationId: "dardania",
    pallets: 4,
    orderDate: today(),
    assign: { picker: "b", round: 2, truck: "a" },
    notes: "Assigned — picker B",
  },
  {
    invoice: `${INVOICE_PREFIX}1005`,
    customer: "M&M Renovations",
    locationId: "gjilan",
    pallets: 3,
    orderDate: today(),
    assign: { picker: "a", round: 3, truck: "a" },
    proofs: ["prepared", "loaded", "departed"],
    notes: "In transit — picker A",
  },
  {
    invoice: `${INVOICE_PREFIX}1006`,
    customer: "Bardhi Interiors",
    locationId: "mitrovice",
    pallets: 2,
    orderDate: today(),
    assign: { picker: "b", round: 4, truck: "a" },
    proofs: ["prepared", "loaded", "departed"],
    notes: "In transit — picker B",
  },
  {
    invoice: `${INVOICE_PREFIX}1007`,
    customer: "Lux Home Design",
    locationId: "ulpiana",
    pallets: 5,
    orderDate: today(),
    assign: { picker: "a", round: 5, truck: "a" },
    proofs: ["prepared", "loaded", "departed", "delivered"],
    notes: "Delivered today — picker A",
  },
  {
    invoice: `${INVOICE_PREFIX}1008`,
    customer: "Studio Arka",
    locationId: "prizren",
    pallets: 3,
    orderDate: today(),
    assign: { picker: "b", round: 1, truck: "b" },
    proofs: ["prepared", "loaded", "departed", "delivered"],
    notes: "Delivered today — picker B",
  },
  {
    invoice: `${INVOICE_PREFIX}1009`,
    customer: "Nexa Tiles Retail",
    locationId: "fushë-kosove",
    pallets: 4,
    orderDate: today(),
    assign: { picker: "a", round: 2, truck: "b" },
    proofs: ["prepared", "loaded", "departed", "delivered"],
    notes: "Delivered today — picker A (2nd)",
  },
  {
    invoice: `${INVOICE_PREFIX}1010`,
    customer: "Partial Delivery Test",
    locationId: "obiliq",
    pallets: 4,
    orderDate: today(),
    assign: { picker: "b", round: 3, truck: "b" },
    proofs: ["prepared", "loaded", "departed", "partial_delivery"],
    partial: { pallets: 2, m2: 46.08 },
    notes: "Partial delivery — picker B",
  },
  {
    invoice: `${INVOICE_PREFIX}1011`,
    customer: "Overdue Project Alpha",
    locationId: "lipjan",
    pallets: 2,
    orderDate: daysAgo(5),
    requestedDeliveryDate: daysAgo(5),
    assign: { picker: "a", round: 4, truck: "b" },
    notes: "Delayed — 5 days overdue",
  },
  {
    invoice: `${INVOICE_PREFIX}1012`,
    customer: "Overdue Project Beta",
    locationId: "shtime",
    pallets: 3,
    orderDate: daysAgo(3),
    requestedDeliveryDate: daysAgo(3),
    assign: { picker: "b", round: 5, truck: "b" },
    notes: "Delayed — 3 days overdue",
  },
  {
    invoice: `${INVOICE_PREFIX}1013`,
    customer: "Future Schedule Ltd",
    locationId: "malisheve",
    pallets: 2,
    orderDate: today(),
    requestedDeliveryDate: daysAhead(3),
    notes: "Scheduled +3 days",
  },
  {
    invoice: `${INVOICE_PREFIX}1014`,
    customer: "Completed Yesterday Co",
    locationId: "rahovec",
    pallets: 2,
    orderDate: daysAgo(1),
    assign: { picker: "a", round: 1, truck: "b" },
    proofs: ["prepared", "loaded", "departed", "delivered"],
    notes: "Delivered (assigned yesterday)",
  },
];

async function main() {
  console.log(`\n=== Report test orders → ${describeScriptDatabaseTarget()} ===\n`);

  console.log("Ensuring staff & truck…");
  const pickerAId = await ensureEmployee({
    name: "Esati Gashi",
    username: "picker",
    roles: ["picker", "group_leader"],
  });
  const pickerBId = await ensureEmployee({
    name: "Blerim Haliti",
    username: "picker2",
    roles: ["picker"],
  });
  const driverId = await ensureEmployee({
    name: "Ardian Berisha",
    username: "driver1",
    roles: ["driver"],
  });
  const truckAId = await ensureVehicle("02-123-DAF", {
    name: "DAF 55.250",
    maxWeightKg: 5500,
    maxPallets: 12,
  });
  const truckBId = await ensureVehicle("03-456-ATE", {
    name: "Atego",
    maxWeightKg: 7500,
    maxPallets: 14,
  });

  const pickerIds = { a: pickerAId, b: pickerBId };
  const truckIds = { a: truckAId, b: truckBId };

  let created = 0;
  let skipped = 0;

  console.log("\nCreating orders…");
  for (const spec of SCENARIOS) {
    if (await orderExists(spec.invoice)) {
      console.log(`  · ${spec.invoice} (exists)`);
      skipped++;
      continue;
    }

    const place = loc(spec.locationId);
    const order = await createOrder({
      invoiceNumber: spec.invoice,
      customerName: spec.customer,
      location: place.name,
      locationId: place.id,
      region: place.region,
      city: place.city,
      lat: place.lat,
      lng: place.lng,
      price: price(spec.pallets),
      orderDate: spec.orderDate,
      requestedDeliveryDate: spec.requestedDeliveryDate ?? null,
      deliveryTimePreference: "flexible",
      status: spec.assign ? "assigned" : "pending",
      priority: spec.priority ?? "normal",
      notes: spec.notes,
      items: item(spec.pallets),
    });

    if (!order) {
      console.error(`  ✗ ${spec.invoice} — create failed`);
      continue;
    }

    if (spec.assign) {
      const pickerId = pickerIds[spec.assign.picker];
      const vehicleId = truckIds[spec.assign.truck];
      const bundle = await assignOrderBundle({
        orderId: order.id,
        vehicleId,
        deliveryRound: spec.assign.round,
        pickerId,
        autoAssignTeam: true,
        ignoreWeightWarning: true,
      });
      if (!bundle.ok) {
        throw new Error(`${spec.invoice} truck assign failed: ${bundle.error}`);
      }
      await assignEmployeeToOrder(order.id, pickerId, "picker");
      await assignEmployeeToOrder(order.id, driverId, "driver");
      await assignEmployeeToOrder(order.id, pickerAId, "group_leader");
    }

    if (spec.proofs?.length) {
      const pickerId = spec.assign
        ? pickerIds[spec.assign.picker]
        : pickerAId;
      await runProofs(order.id, spec.proofs, pickerId, driverId, {
        partialPallets: spec.partial?.pallets,
        partialM2: spec.partial?.m2,
      });
    }

    created++;
    console.log(`  + ${spec.invoice} · ${spec.pallets} plt · €${price(spec.pallets)}`);
  }

  console.log("\n=== Done ===");
  console.log(`  ${created} created · ${skipped} skipped (already exist)`);
  console.log(`  Open Reports → Daily report → Download Excel for ${today()}`);
  console.log("  Staff logins (password: demo123): picker, picker2, driver1\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
