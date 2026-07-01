/**
 * Full demo dataset for end-to-end testing: staff, fleet, WMS, orders,
 * truck/round assignments, urgent scenarios, and picker workload spread.
 *
 *   npm run seed          → same database as npm run dev (.env.local)
 *   npm run seed:local    → force local SQLite (even without USE_LOCAL_DATABASE)
 */
import { eq, sql } from "drizzle-orm";
import {
  configureScriptDatabase,
  describeScriptDatabaseTarget,
  printDatabaseMismatchHint,
} from "./db-target";
import { resetOperationalData } from "./reset-data";
import { getDb } from "../src/lib/db";
import { dbOne } from "../src/lib/db/query";
import {
  employees,
  orders,
  vehicles,
  warehouseLocations,
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
import {
  createWarehouseLocation,
  receiveStock,
} from "../src/lib/services/stock";
import { startInventorySession } from "../src/lib/services/inventory";

const DEMO_PASSWORD = "demo123";

configureScriptDatabase();
printDatabaseMismatchHint();

function describeDbTarget(): string {
  return describeScriptDatabaseTarget();
}

function loc(id: string): LocationEntry {
  const found = KOSOVO_LOCATIONS.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown location id: ${id}`);
  return found;
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
  notes?: string;
  assignedVehicleId?: number;
}) {
  const existing = await findEmployeeByUsername(input.username);
  if (existing) return existing.id;
  const created = await createEmployee({
    ...input,
    password: DEMO_PASSWORD,
  });
  console.log(`  + ${input.name} (@${input.username})`);
  return created!.id;
}

async function ensureVehicle(input: {
  name: string;
  plateNumber: string;
  maxWeightKg: number;
  maxPallets: number;
  notes?: string;
}) {
  const db = await getDb();
  const existing = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.plateNumber, input.plateNumber))
  );
  if (existing) {
    console.log(`  · ${input.name} (${input.plateNumber})`);
    return existing.id;
  }
  const created = await createVehicle(input);
  console.log(`  + ${input.name} (${input.plateNumber})`);
  return created!.id;
}

async function ensureLocation(input: {
  code: string;
  zone?: string;
  label?: string;
  notes?: string;
}) {
  const db = await getDb();
  const existing = await dbOne(
    db
      .select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.code, input.code.toUpperCase()))
  );
  if (existing) return existing.id;
  const created = await createWarehouseLocation(input);
  console.log(`  + ${created!.code}`);
  return created!.id;
}

type OrderSpec = {
  invoice: string;
  customer: string;
  locationId: string;
  pallets: number;
  priority?: "normal" | "urgent";
  notes?: string;
  assign?: { vehiclePlate: string; round: number; pickerUsername: string };
};

const CUSTOMERS = [
  "Ceramic Home SH.P.K",
  "Bardhë & Stone",
  "Kosova Build",
  "Prishtina Tiles",
  "Dukagjini Construction",
  "Euro Tile Center",
  "Inter Fliesen",
  "Gjakova Marble & Tile",
  "Ferizaj Ceramic Depot",
  "Mitrovica Build Market",
];

const ORDER_SPECS: OrderSpec[] = [
  // DAF R1 — Prishtinë cluster (dispatch board / truck workspace)
  {
    invoice: "DEMO-1001",
    customer: CUSTOMERS[3],
    locationId: "prishtine-center",
    pallets: 3,
    assign: { vehiclePlate: "02-123-DAF", round: 1, pickerUsername: "picker" },
  },
  {
    invoice: "DEMO-1002",
    customer: CUSTOMERS[0],
    locationId: "dardania",
    pallets: 2,
    assign: { vehiclePlate: "02-123-DAF", round: 1, pickerUsername: "picker" },
  },
  {
    invoice: "DEMO-1003",
    customer: CUSTOMERS[1],
    locationId: "matiqan",
    pallets: 4,
    assign: { vehiclePlate: "02-123-DAF", round: 1, pickerUsername: "picker" },
  },
  // Atego R1 — Mitrovicë cluster (won't fit Ferizaj urgent)
  {
    invoice: "DEMO-1004",
    customer: CUSTOMERS[9],
    locationId: "mitrovice",
    pallets: 3,
    assign: { vehiclePlate: "03-456-ATE", round: 1, pickerUsername: "picker2" },
  },
  {
    invoice: "DEMO-1005",
    customer: CUSTOMERS[4],
    locationId: "vushtrri",
    pallets: 2,
    assign: { vehiclePlate: "03-456-ATE", round: 1, pickerUsername: "picker2" },
  },
  // DAF R2 — western Kosovo
  {
    invoice: "DEMO-1006",
    customer: CUSTOMERS[7],
    locationId: "peje",
    pallets: 3,
    assign: { vehiclePlate: "02-123-DAF", round: 2, pickerUsername: "picker" },
  },
  {
    invoice: "DEMO-1007",
    customer: CUSTOMERS[7],
    locationId: "gjakove",
    pallets: 2,
    assign: { vehiclePlate: "02-123-DAF", round: 2, pickerUsername: "picker" },
  },
  // Unassigned — ready for smart dispatch / routes page
  {
    invoice: "DEMO-1008",
    customer: CUSTOMERS[2],
    locationId: "lipjan",
    pallets: 3,
  },
  {
    invoice: "DEMO-1009",
    customer: CUSTOMERS[5],
    locationId: "fushë-kosove",
    pallets: 2,
  },
  {
    invoice: "DEMO-1010",
    customer: CUSTOMERS[6],
    locationId: "podujeve",
    pallets: 4,
  },
  {
    invoice: "DEMO-1011",
    customer: CUSTOMERS[0],
    locationId: "prizren",
    pallets: 3,
  },
  {
    invoice: "DEMO-1012",
    customer: CUSTOMERS[1],
    locationId: "gjilan",
    pallets: 2,
  },
  // Urgent — Ferizaj (test urgent routing vs Mitrovicë truck)
  {
    invoice: "DEMO-1013",
    customer: CUSTOMERS[8],
    locationId: "ferizaj",
    pallets: 2,
    priority: "urgent",
    notes: "URGENT — customer waiting · Ferizaj",
  },
  {
    invoice: "DEMO-1014",
    customer: CUSTOMERS[8],
    locationId: "ferizaj-industrial",
    pallets: 3,
    priority: "urgent",
    notes: "URGJENT — add to closest route today",
  },
  // Urgent near Prishtinë — could join DAF R1 if almost ready
  {
    invoice: "DEMO-1015",
    customer: CUSTOMERS[3],
    locationId: "gracanice",
    pallets: 2,
    priority: "urgent",
    notes: "Urgent — Prishtinë area",
  },
  // Future delivery date — excluded from dispatch until date
  {
    invoice: "DEMO-1016",
    customer: CUSTOMERS[2],
    locationId: "obiliq",
    pallets: 2,
    notes: "Scheduled +3 days",
  },
];

async function main() {
  console.log(`\n=== Tile Logistics demo seed → ${describeDbTarget()} ===\n`);

  console.log("Step 1 — Reset existing data…");
  await resetOperationalData();

  console.log("\nStep 2 — Staff…");
  const salesAdminId = await ensureEmployee({
    name: "Elira Hoxha",
    username: "salesadmin",
    roles: ["sales_admin"],
  });
  const salesAgentId = await ensureEmployee({
    name: "Arben Kelmendi",
    username: "agjenti",
    roles: ["sales_agent"],
  });
  {
    const db = await getDb();
    await db
      .update(employees)
      .set({ managerEmployeeId: salesAdminId })
      .where(eq(employees.id, salesAgentId));
  }
  await ensureEmployee({
    name: "Arta Mustafa",
    username: "showroom",
    roles: ["showroom_picker"],
  });

  const depoAdminId = await ensureEmployee({
    name: "Besnik Krasniqi",
    username: "depoadmin",
    roles: ["warehouse_admin"],
  });
  const pickerId = await ensureEmployee({
    name: "Esati Gashi",
    username: "picker",
    roles: ["picker"],
  });
  const picker2Id = await ensureEmployee({
    name: "Blerim Haliti",
    username: "picker2",
    roles: ["picker"],
  });
  await ensureEmployee({
    name: "Bekim Berisha",
    username: "helper",
    roles: ["unloader"],
  });
  await ensureEmployee({
    name: "Naim Rexhepi",
    username: "naim",
    roles: ["maintainer"],
  });
  await ensureEmployee({
    name: "Flutura Gashi",
    username: "pastrues",
    roles: ["cleaner"],
  });

  console.log("\nStep 3 — Fleet…");
  const dafId = await ensureVehicle({
    name: "DAF 55.250",
    plateNumber: "02-123-DAF",
    maxWeightKg: 5500,
    maxPallets: 12,
  });
  const ategoId = await ensureVehicle({
    name: "Atego",
    plateNumber: "03-456-ATE",
    maxWeightKg: 7500,
    maxPallets: 14,
  });
  await ensureVehicle({
    name: "Sprinter 313 CDI",
    plateNumber: "05-111-SPR",
    maxWeightKg: 1200,
    maxPallets: 4,
  });
  await ensureVehicle({
    name: "Volvo — crane",
    plateNumber: "06-222-VCR",
    maxWeightKg: 10000,
    maxPallets: 18,
    notes: "crane",
  });

  const driverId = await ensureEmployee({
    name: "Driton Morina",
    username: "driver",
    roles: ["driver"],
    assignedVehicleId: dafId,
  });

  const plateToVehicleId = new Map<string, number>([
    ["02-123-DAF", dafId],
    ["03-456-ATE", ategoId],
  ]);
  const pickerByUsername = new Map<string, number>([
    ["picker", pickerId],
    ["picker2", picker2Id],
  ]);

  console.log("\nStep 4 — Warehouse (WMS)…");
  const locA01 = await ensureLocation({
    code: "A-01",
    zone: "A",
    label: "Rreshti A — pozicioni 1",
  });
  const locA02 = await ensureLocation({
    code: "A-02",
    zone: "A",
    label: "Rreshti A — pozicioni 2",
  });
  const locB01 = await ensureLocation({
    code: "B-01",
    zone: "B",
    label: "Rreshti B — pllaka të mëdha",
  });

  for (const p of [
    {
      ean: "3830061234567",
      name: "AGIMI Porcelain 60×120",
      w: 60,
      h: 120,
      t: 2,
      m2: 92,
      locationId: locA01,
    },
    {
      ean: "3830061234574",
      name: "AGIMI Marble 120×120",
      w: 120,
      h: 120,
      t: 1,
      m2: 115,
      locationId: locA02,
    },
    {
      ean: "3830061234581",
      name: "AGIMI Stone 60×60",
      w: 60,
      h: 60,
      t: 1,
      m2: 54,
      locationId: locB01,
    },
  ]) {
    const result = await receiveStock({
      ean: p.ean,
      productName: p.name,
      tileWidthCm: p.w,
      tileHeightCm: p.h,
      tileThicknessCm: p.t,
      quantityM2: p.m2,
      locationId: p.locationId,
      employeeId: depoAdminId,
      notes: "Demo seed stock",
    });
    if (result.ok) console.log(`  + ${p.ean} → ${p.m2} m²`);
  }

  await startInventorySession({
    name: "Inventari demo 2026",
    employeeId: depoAdminId,
    notes: "Open session for portal WMS",
  });

  console.log("\nStep 5 — Orders & assignments…");
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + 3);

  let created = 0;
  let assigned = 0;

  for (let i = 0; i < ORDER_SPECS.length; i++) {
    const spec = ORDER_SPECS[i];
    const place = loc(spec.locationId);
    const orderDate = new Date(today);
    orderDate.setDate(today.getDate() - (ORDER_SPECS.length - i));

    const order = await createOrder({
      invoiceNumber: spec.invoice,
      customerName: spec.customer,
      location: place.name,
      locationId: place.id,
      region: place.region,
      city: place.city,
      lat: place.lat,
      lng: place.lng,
      price: Math.round(spec.pallets * 23.04 * 12.5 * 100) / 100,
      orderDate: orderDate.toISOString().slice(0, 10),
      requestedDeliveryDate:
        spec.invoice === "DEMO-1016"
          ? future.toISOString().slice(0, 10)
          : null,
      deliveryTimePreference: "flexible",
      status: spec.assign ? "assigned" : "pending",
      priority: spec.priority ?? "normal",
      notes: spec.notes ?? "Demo order",
      items: [
        {
          unit: "m2",
          productName: "AGIMI Porcelain 60×120",
          productEan: "3830061234567",
          tileWidthCm: 60,
          tileHeightCm: 120,
          tileThicknessCm: 2,
          quantityM2: spec.pallets * 23.04,
          manualPallets: spec.pallets,
        },
      ],
    });

    created++;
    console.log(
      `  + ${spec.invoice} · ${spec.pallets} plt · ${place.region}${
        spec.priority === "urgent" ? " · URGENT" : ""
      }`
    );

    if (spec.assign && order) {
      const vehicleId = plateToVehicleId.get(spec.assign.vehiclePlate);
      const picker = pickerByUsername.get(spec.assign.pickerUsername);
      if (vehicleId && picker) {
        await assignOrderBundle({
          orderId: order.id,
          vehicleId,
          deliveryRound: spec.assign.round,
          pickerId: picker,
          autoAssignTeam: true,
          ignoreWeightWarning: true,
        });
        await assignEmployeeToOrder(order.id, driverId, "driver");
        assigned++;
      }
    }
  }

  const urgentUnassigned = ORDER_SPECS.filter(
    (s) => s.priority === "urgent" && !s.assign
  ).length;

  console.log("\n=== Demo ready ===");
  console.log(`  ${created} orders · ${assigned} pre-assigned to trucks`);
  console.log(`  ${urgentUnassigned} urgent orders waiting on Dispatch board`);
  console.log(`  Picker workload skew: Esati (heavy) vs Blerim (lighter)`);
  console.log("\nLogins (password: demo123):");
  console.log("  Admin (env)     admin       → full access");
  console.log("  Sales           salesadmin  → /orders");
  console.log("  Warehouse admin depoadmin   → /portal + WMS");
  console.log("  Picker          picker      → /portal");
  console.log("  Picker 2        picker2     → /portal");
  console.log("  Driver          driver      → /portal (DAF only)");
  console.log("\nTry: /dispatch · /orders · /routes · Smart dispatch on unassigned\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
