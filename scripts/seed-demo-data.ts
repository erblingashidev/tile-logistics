/**
 * Seeds demo employees, vehicles, and orders for local testing.
 * Run: npm run seed
 */
import { createEmployee } from "../src/lib/services/employees";
import { createVehicle } from "../src/lib/services/vehicles";
import {
  assignOrderToVehicle,
  createOrder,
} from "../src/lib/services/orders";
import { assignEmployeeToOrder } from "../src/lib/services/employees";
import { getDb } from "../src/lib/db";
import { dbOne } from "../src/lib/db/query";
import { employees, vehicles, orders, assignments } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { KOSOVO_LOCATIONS } from "../src/lib/locations/kosovo-locations";
import type { EmployeeRole } from "../src/lib/constants";

const DEMO_PASSWORD = "demo123";

async function findEmployeeByUsername(username: string) {
  const db = await getDb();
  return dbOne(
    db
      .select()
      .from(employees)
      .where(eq(employees.username, username))
  );
}

async function findVehicleByPlate(plate: string) {
  const db = await getDb();
  return dbOne(
    db
      .select()
      .from(vehicles)
      .where(eq(vehicles.plateNumber, plate))
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
  if (existing) {
    console.log(`  · ${input.name} (@${input.username}) already exists`);
    return existing.id;
  }
  const created = await createEmployee({
    name: input.name,
    username: input.username,
    password: DEMO_PASSWORD,
    roles: input.roles,
    notes: input.notes,
    assignedVehicleId: input.assignedVehicleId,
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
  const existing = await findVehicleByPlate(input.plateNumber);
  if (existing) {
    console.log(`  · ${input.name} (${input.plateNumber}) already exists`);
    return existing.id;
  }
  const created = await createVehicle(input);
  console.log(`  + ${input.name} (${input.plateNumber})`);
  return created!.id;
}

const deliveryLocations = KOSOVO_LOCATIONS.filter(
  (l) => l.type !== "warehouse" && l.id !== "agimi-warehouse-shkabaj"
);

function pickLocation(index: number) {
  return deliveryLocations[index % deliveryLocations.length];
}

async function main() {
  console.log("\n=== Seeding demo data ===\n");

  console.log("Employees — support staff");
  await ensureEmployee({
    name: "Naim Krasniqi",
    username: "naim",
    roles: ["maintainer"],
    notes: "Warehouse equipment & facility maintenance",
  });
  await ensureEmployee({
    name: "Bekim Berisha",
    username: "bekim",
    roles: ["unloader"],
    notes: "Stock unloader — receives inbound pallets",
  });

  console.log("\nEmployees — picker teams (lead gets order assignments)");
  const esatiId = await ensureEmployee({
    name: "Esati Gashi",
    username: "esat",
    roles: ["picker"],
  });
  const esatHelpers = [
    await ensureEmployee({
      name: "Ardian Meta",
      username: "esat_h1",
      roles: ["unloader"],
      notes: "Picker team — assists Esati",
    }),
    await ensureEmployee({
      name: "Granit Kelmendi",
      username: "esat_h2",
      roles: ["unloader"],
      notes: "Picker team — assists Esati",
    }),
  ];

  const liridonId = await ensureEmployee({
    name: "Liridon Bajrami",
    username: "liridon",
    roles: ["picker"],
  });
  const liridonHelpers = [
    await ensureEmployee({
      name: "Endrit Morina",
      username: "lir_h1",
      roles: ["unloader"],
      notes: "Picker team — assists Liridon",
    }),
    await ensureEmployee({
      name: "Kushtrim Rexhepi",
      username: "lir_h2",
      roles: ["unloader"],
      notes: "Picker team — assists Liridon",
    }),
  ];

  const avniId = await ensureEmployee({
    name: "Avni Shala",
    username: "avni",
    roles: ["picker"],
  });
  const avniHelpers = [
    await ensureEmployee({
      name: "Elton Berisha",
      username: "avn_h1",
      roles: ["unloader"],
      notes: "Picker team — assists Avni",
    }),
    await ensureEmployee({
      name: "Fisnik Halimi",
      username: "avn_h2",
      roles: ["unloader"],
      notes: "Picker team — assists Avni",
    }),
  ];

  const pickerTeams = [
    { pickerId: esatiId, helperIds: esatHelpers },
    { pickerId: liridonId, helperIds: liridonHelpers },
    { pickerId: avniId, helperIds: avniHelpers },
  ];

  console.log("\nEmployees — showroom & cleaners");
  await ensureEmployee({
    name: "Arta Mustafa",
    username: "arta",
    roles: ["showroom_picker"],
  });
  await ensureEmployee({
    name: "Diellza Hoxha",
    username: "diellza",
    roles: ["showroom_picker"],
  });
  await ensureEmployee({
    name: "Flutura Gashi",
    username: "flutura",
    roles: ["cleaner"],
  });
  await ensureEmployee({
    name: "Miradije Krasniqi",
    username: "miradije",
    roles: ["cleaner"],
  });

  console.log("\nVehicles & drivers");
  const fleet: Array<{
    vehicle: {
      name: string;
      plateNumber: string;
      maxWeightKg: number;
      maxPallets: number;
      notes?: string;
    };
    driver: { name: string; username: string };
  }> = [
    {
      vehicle: {
        name: "DAF 55.250",
        plateNumber: "02-123-DAF",
        maxWeightKg: 5500,
        maxPallets: 12,
      },
      driver: { name: "Arben Berisha", username: "arben" },
    },
    {
      vehicle: {
        name: "Atego",
        plateNumber: "03-456-ATE",
        maxWeightKg: 7500,
        maxPallets: 14,
      },
      driver: { name: "Blerim Kastrati", username: "blerim" },
    },
    {
      vehicle: {
        name: "Atego 815",
        plateNumber: "04-789-A81",
        maxWeightKg: 8000,
        maxPallets: 15,
      },
      driver: { name: "Driton Morina", username: "driton" },
    },
    {
      vehicle: {
        name: "Sprinter 313 CDI",
        plateNumber: "05-111-SPR",
        maxWeightKg: 1200,
        maxPallets: 4,
      },
      driver: { name: "Fitim Gashi", username: "fitim" },
    },
    {
      vehicle: {
        name: "Volvo — crane",
        plateNumber: "06-222-VCR",
        maxWeightKg: 10000,
        maxPallets: 18,
        notes: "Volvo truck with crane behind",
      },
      driver: { name: "Gani Rexhepi", username: "gani" },
    },
    {
      vehicle: {
        name: "Iveco 60C15",
        plateNumber: "07-333-IVC",
        maxWeightKg: 6000,
        maxPallets: 11,
      },
      driver: { name: "Hysni Berisha", username: "hysni" },
    },
  ];

  const vehicleIds: number[] = [];
  for (const entry of fleet) {
    const vehicleId = await ensureVehicle(entry.vehicle);
    vehicleIds.push(vehicleId);
    await ensureEmployee({
      name: entry.driver.name,
      username: entry.driver.username,
      roles: ["driver"],
      assignedVehicleId: vehicleId,
    });
  }

  const krani = await findVehicleByPlate("01-394-MA");
  if (krani) {
    vehicleIds.unshift(krani.id);
    await ensureEmployee({
      name: "Visar Krasniqi",
      username: "visar",
      roles: ["driver"],
      assignedVehicleId: krani.id,
    });
  }

  console.log("\nOrders (12 demo deliveries)");
  const db = await getDb();
  const customers = [
    "Ceramic Home SH.P.K",
    "Bardhë & Stone",
    "Kosova Build",
    "Inter Fliesen",
    "Prishtina Tiles",
    "Dukagjini Construction",
    "Arberi Design Studio",
    "Euro Tile Center",
    "Gjakova Marble & Tile",
    "Peja Home Solutions",
    "Mitrovica Build Market",
    "Ferizaj Ceramic Depot",
  ];

  const orderSpecs: Array<{
    invoice: string;
    customerIndex: number;
    locationIndex: number;
    m2: number;
    status: "pending" | "assigned";
    vehicleIndex?: number;
    round?: number;
    pickerTeamIndex?: number;
  }> = [
    { invoice: "DEMO-1001", customerIndex: 0, locationIndex: 0, m2: 46, status: "pending" },
    { invoice: "DEMO-1002", customerIndex: 1, locationIndex: 3, m2: 23, status: "pending" },
    { invoice: "DEMO-1003", customerIndex: 2, locationIndex: 5, m2: 57, status: "pending" },
    {
      invoice: "DEMO-1004",
      customerIndex: 3,
      locationIndex: 7,
      m2: 34,
      status: "assigned",
      vehicleIndex: 0,
      round: 1,
      pickerTeamIndex: 0,
    },
    {
      invoice: "DEMO-1005",
      customerIndex: 4,
      locationIndex: 9,
      m2: 28,
      status: "assigned",
      vehicleIndex: 1,
      round: 1,
      pickerTeamIndex: 0,
    },
    {
      invoice: "DEMO-1006",
      customerIndex: 5,
      locationIndex: 11,
      m2: 41,
      status: "assigned",
      vehicleIndex: 1,
      round: 1,
      pickerTeamIndex: 1,
    },
    {
      invoice: "DEMO-1007",
      customerIndex: 6,
      locationIndex: 13,
      m2: 52,
      status: "assigned",
      vehicleIndex: 2,
      round: 1,
      pickerTeamIndex: 1,
    },
    {
      invoice: "DEMO-1008",
      customerIndex: 7,
      locationIndex: 15,
      m2: 18,
      status: "assigned",
      vehicleIndex: 3,
      round: 1,
      pickerTeamIndex: 2,
    },
    {
      invoice: "DEMO-1009",
      customerIndex: 8,
      locationIndex: 17,
      m2: 64,
      status: "assigned",
      vehicleIndex: 4,
      round: 1,
      pickerTeamIndex: 2,
    },
    {
      invoice: "DEMO-1010",
      customerIndex: 9,
      locationIndex: 19,
      m2: 36,
      status: "assigned",
      vehicleIndex: 5,
      round: 1,
      pickerTeamIndex: 0,
    },
    {
      invoice: "DEMO-1011",
      customerIndex: 10,
      locationIndex: 21,
      m2: 44,
      status: "assigned",
      vehicleIndex: 6,
      round: 1,
      pickerTeamIndex: 1,
    },
    {
      invoice: "DEMO-1012",
      customerIndex: 11,
      locationIndex: 23,
      m2: 30,
      status: "assigned",
      vehicleIndex: 2,
      round: 1,
      pickerTeamIndex: 2,
    },
  ];

  const today = new Date();
  let createdOrders = 0;

  for (let i = 0; i < orderSpecs.length; i++) {
    const spec = orderSpecs[i];
    const existing = await dbOne(
      db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.invoiceNumber, spec.invoice))
    );
    if (existing) {
      console.log(`  · ${spec.invoice} already exists`);
      if (spec.status === "assigned" && spec.vehicleIndex != null) {
        const orderRow = await dbOne(
          db
            .select({ id: orders.id })
            .from(orders)
            .where(eq(orders.invoiceNumber, spec.invoice))
        );
        if (orderRow) {
          const hasAssign = await dbOne(
            db
              .select({ id: assignments.id })
              .from(assignments)
              .where(eq(assignments.orderId, orderRow.id))
          );
          if (!hasAssign) {
            const vehicleId =
              vehicleIds[spec.vehicleIndex % vehicleIds.length];
            const assign = await assignOrderToVehicle(
              orderRow.id,
              vehicleId,
              spec.round ?? 1,
              true
            );
            if (assign.ok) {
              const team = pickerTeams[spec.pickerTeamIndex ?? 0];
              await assignEmployeeToOrder(orderRow.id, team.pickerId, "picker");
              for (const helperId of team.helperIds) {
                await assignEmployeeToOrder(orderRow.id, helperId, "unloader");
              }
              console.log(`    → assigned to truck`);
            }
          }
        }
      }
      continue;
    }

    const loc = pickLocation(spec.locationIndex);
    const orderDate = new Date(today);
    orderDate.setDate(today.getDate() - (orderSpecs.length - i));

    const order = await createOrder({
      invoiceNumber: spec.invoice,
      customerName: customers[spec.customerIndex],
      location: loc.name,
      locationId: loc.id,
      region: loc.region,
      city: loc.city,
      lat: loc.lat,
      lng: loc.lng,
      price: Math.round(spec.m2 * 12.5 * 100) / 100,
      orderDate: orderDate.toISOString().slice(0, 10),
      status: spec.status === "pending" ? "pending" : "assigned",
      notes: "Demo order for system testing",
      items: [
        {
          productType: "tile",
          productName: "AGIMI Porcelain 60×120",
          tileWidthCm: 60,
          tileHeightCm: 120,
          tileThicknessCm: 2,
          quantityM2: spec.m2,
        },
      ],
    });

    createdOrders++;
    console.log(`  + ${spec.invoice} → ${loc.name} (${spec.m2} m²)`);

    if (spec.status === "assigned" && spec.vehicleIndex != null) {
      const vehicleId = vehicleIds[spec.vehicleIndex % vehicleIds.length];
      const round = spec.round ?? 1;
      const assign = await assignOrderToVehicle(order!.id, vehicleId, round, true);
      if (!assign.ok) {
        console.warn(`    ! Could not assign to truck: ${assign.error}`);
      } else {
        const team = pickerTeams[spec.pickerTeamIndex ?? 0];
        await assignEmployeeToOrder(order!.id, team.pickerId, "picker");
        for (const helperId of team.helperIds) {
          await assignEmployeeToOrder(order!.id, helperId, "unloader");
        }
      }
    }
  }

  console.log("\n=== Done ===");
  console.log(`Created ${createdOrders} new orders.`);
  console.log(`Portal login: any username above / password: ${DEMO_PASSWORD}`);
  console.log("Admin login: admin / admin\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
