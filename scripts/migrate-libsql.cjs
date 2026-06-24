#!/usr/bin/env node
/**
 * One-time codemod: better-sqlite3 sync drizzle -> libsql async drizzle
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const FILES = [
  "src/lib/auth/index.ts",
  "src/lib/services/delivery-proofs.ts",
  "src/lib/dispatch/recommendations.ts",
  "src/lib/services/orders.ts",
  "src/app/api/orders/from-invoice/route.ts",
  "src/lib/dispatch/validate-assignment.ts",
  "src/lib/services/employees.ts",
  "src/lib/services/load-coordination.ts",
  "src/lib/services/order-status.ts",
  "src/lib/services/vehicles.ts",
  "src/lib/services/vehicle-defaults.ts",
  "src/lib/dispatch/apply.ts",
  "src/app/page.tsx",
  "src/lib/export/excel.ts",
];

function addQueryImport(src) {
  if (src.includes("@/lib/db/query")) return src;
  if (src.includes('from "@/lib/db"')) {
    return src.replace(
      /from "@\/lib\/db";/,
      'from "@/lib/db";\nimport { dbAll, dbOne } from "@/lib/db/query";'
    );
  }
  return src;
}

function migrateGetDb(src) {
  return src.replace(/\bgetDb\(\)/g, "await getDb()");
}

function migrateRunCalls(src) {
  // db.insert(...).run() -> await db.insert(...)
  return src.replace(/(\n\s+)(db\.(?:insert|update|delete)[^\n]*)\.run\(\);/g, "$1await $2;");
}

function migrateAllCalls(src) {
  // Chain ending in .all() -> await dbAll(...)
  // Handle multiline chains ending with .all()
  return src.replace(
    /(\n\s+)(return\s+)?((?:db|await db)\.[\s\S]*?)\.all\(\)/g,
    (match, indent, ret, chain) => {
      if (chain.includes("dbAll(") || chain.includes("dbOne(")) return match;
      const prefix = ret ? "return " : "";
      return `${indent}${prefix}await dbAll(${chain.trim()})`;
    }
  );
}

function migrateGetCalls(src) {
  // Add .limit(1) before .get() and wrap with dbOne
  let result = src;
  const getPattern =
    /(\n\s+)(return\s+)?((?:const|let)\s+\w+\s*=\s*)?((?:db|await db)\.[\s\S]*?)\.get\(\);/g;

  result = result.replace(getPattern, (match, indent, ret, decl, chain) => {
    if (chain.includes("dbOne(")) return match;
    let c = chain.trim();
    if (!c.includes(".limit(1)")) {
      c = c.replace(/\s*$/, "") + ".limit(1)";
    }
    const prefix = ret ? "return " : "";
    const declPart = decl ?? "";
    if (declPart) {
      return `${indent}${declPart}await dbOne(${c});`;
    }
    return `${indent}${prefix}await dbOne(${c});`;
  });

  // Inline .get() without declaration (e.g. return db.select...get())
  result = result.replace(
    /(\n\s+)return\s+((?:db|await db)\.[\s\S]*?)\.get\(\);/g,
    (match, indent, chain) => {
      if (chain.includes("dbOne(")) return match;
      let c = chain.trim();
      if (!c.includes(".limit(1)")) c += ".limit(1)";
      return `${indent}return await dbOne(${c});`;
    }
  );

  // Expression statements: db.select...get() as standalone
  result = result.replace(
    /(\n\s+)(await db\.[\s\S]*?)\.get\(\);/g,
    (match, indent, chain) => {
      if (chain.includes("dbOne(")) return match;
      let c = chain.trim();
      if (!c.includes(".limit(1)")) c += ".limit(1)";
      return `${indent}await dbOne(${c});`;
    }
  );

  return result;
}

function makeExportedFunctionsAsync(src) {
  const lines = src.split("\n");
  const out = [];
  let inAsyncFn = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const exportFn = line.match(
      /^export function (\w+)/
    );
    if (exportFn && !line.includes("async function")) {
      line = line.replace(/^export function /, "export async function ");
    }
    const fn = line.match(/^function (\w+)/);
    if (fn && !line.includes("async function") && usesAwaitInBlock(lines, i)) {
      line = line.replace(/^function /, "async function ");
    }
    out.push(line);
  }
  return out.join("\n");
}

function usesAwaitInBlock(lines, startIdx) {
  let depth = 0;
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!started) {
      if (line.includes("{")) {
        started = true;
        depth += (line.match(/{/g) || []).length;
        depth -= (line.match(/}/g) || []).length;
      }
      continue;
    }
    depth += (line.match(/{/g) || []).length;
    depth -= (line.match(/}/g) || []).length;
    if (/\bawait\b/.test(line)) return true;
    if (depth <= 0) break;
  }
  return false;
}

function addAwaitToKnownCalls(src) {
  const fns = [
    "getDb",
    "getOrder",
    "getEmployee",
    "getVehicle",
    "listOrders",
    "listVehicles",
    "listEmployees",
    "listEmployeesByRole",
    "listDeliveryProofs",
    "listLogs",
    "getOrderStaff",
    "getOrderAssignment",
    "getOrderLoadStatus",
    "getVehicleLoad",
    "getDriverForVehicle",
    "getDriverTruckGroups",
    "getTruckLoadStatus",
    "getTruckAssignmentForOrder",
    "syncTruckDriverOnAssignments",
    "assignEmployeeToOrder",
    "unassignEmployeeFromOrder",
    "updateOrderStatus",
    "updateEmployee",
    "createOrder",
    "createEmployee",
    "createVehicle",
    "deleteOrder",
    "deleteEmployee",
    "deleteVehicle",
    "assignOrderToVehicle",
    "assignOrderBundle",
    "unassignOrder",
    "clearOrderAssignments",
    "resetOrderDelivery",
    "deleteDeliveryProofsForOrder",
    "validateTruckForOrder",
    "generateDispatchPlan",
    "recommendOrderAssignment",
    "applyDispatchRecommendation",
    "applyDispatchPlan",
    "autoAssignPickerTeam",
    "findPickerTeamHelperIds",
    "getDashboardStats",
    "getReportData",
    "getRoutePlans",
    "assignRouteToVehicle",
    "listOrdersForEmployee",
    "getOrdersGroupedByLocation",
    "listOrderAssignmentTimeline",
    "submitDeliveryProof",
    "departTruckForOrder",
    "assertTruckReadyForDriverDeparture",
    "orderHasDeparted",
    "orderWasLoaded",
    "isDriverAuthorizedForOrder",
    "resolveDriverIdForOrder",
    "driverLinkedToVehicle",
    "pickerWorkload",
    "loadDispatchVehicles",
    "resolvePicker",
    "logActivity",
    "enrichEmployeeRow",
    "getEmployeeActiveAssignments",
    "setDriverVehicle",
    "insertProofRecord",
    "employeeCanSubmitPhase",
    "reconcileOrderStatusFromProofs",
    "getEmployeeByUsername",
    "updateEmployeeStatusSelf",
    "updateVehicle",
    "updateVehicleStatus",
    "bulkClearOrderAssignments",
  ];

  let result = src;
  for (const fn of fns) {
    const re = new RegExp(`(?<!await )\\b${fn}\\(`, "g");
    result = result.replace(re, `await ${fn}(`);
  }
  // Fix double await
  result = result.replace(/await await /g, "await ");
  return result;
}

function fixPageComponent(src) {
  if (!src.includes("export default function")) return src;
  return src
    .replace(
      /export default function (\w+)\(\)/,
      "export default async function $1()"
    )
    .replace(
      /export default async function (\w+)\(\)/,
      "export default async function $1()"
    );
}

function processFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    console.warn("Skip missing:", relPath);
    return;
  }
  let src = fs.readFileSync(full, "utf8");
  src = addQueryImport(src);
  src = migrateGetDb(src);
  src = migrateRunCalls(src);
  src = migrateAllCalls(src);
  src = migrateGetCalls(src);
  src = makeExportedFunctionsAsync(src);
  src = addAwaitToKnownCalls(src);
  src = fixPageComponent(src);
  fs.writeFileSync(full, src);
  console.log("Updated:", relPath);
}

for (const f of FILES) {
  processFile(f);
}

// Update all API routes
function walkApi(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkApi(p);
    else if (ent.name === "route.ts") processFile(path.relative(ROOT, p));
  }
}
walkApi(path.join(ROOT, "src/app/api"));

console.log("Done.");
