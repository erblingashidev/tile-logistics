import fs from "fs";
import path from "path";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  employees,
  warehouseReportEditRequests,
  warehouseReportPhotos,
  warehouseReports,
  warehouseReportTags,
  warehouseReportZones,
} from "@/lib/db/schema";
import {
  WAREHOUSE_INCIDENT_CATEGORIES,
  WAREHOUSE_REPORT_TYPES,
  type EmployeeRole,
  type WarehouseIncidentCategory,
  type WarehouseReportScope,
  type WarehouseReportType,
} from "@/lib/constants";
import { getUploadRoot } from "@/lib/config/env";
import { logActivity } from "@/lib/logger";
import {
  getEmployee,
  listEmployees,
  updateEmployee,
} from "@/lib/services/employees";
import {
  getEmployeeWarehouseZones,
  listDistinctWarehouseZones,
  setEmployeeWarehouseZones,
} from "@/lib/services/warehouse-zones";
import {
  formatReportWeek,
  isWednesday,
  wednesdayLabel,
} from "@/lib/warehouse-report-week";

const UPLOAD_ROOT = getUploadRoot();

export interface SubmitWarehouseReportInput {
  employeeId: number;
  employeeRoles: EmployeeRole[];
  reportType: WarehouseReportType;
  category: string;
  body: string;
  zone?: string | null;
  zones?: string[];
  taggedLeaderIds?: number[];
  reportWeek?: string | null;
  photos?: Array<{ buffer: Buffer; mimeType: string }>;
}

function ensureReportUploadDir(reportId: number) {
  const dir = path.join(UPLOAD_ROOT, "warehouse-reports", String(reportId));
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error("[upload] ensureReportUploadDir failed:", err);
    throw err;
  }
  return dir;
}

export function saveWarehouseReportPhoto(
  reportId: number,
  file: Buffer,
  mimeType: string,
  index: number
): string | null {
  try {
    const ext =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const filename = `${Date.now()}-${index}.${ext}`;
    const dir = ensureReportUploadDir(reportId);
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, file);
    return path.join("warehouse-reports", String(reportId), filename);
  } catch (err) {
    console.error("[upload] saveWarehouseReportPhoto failed:", err);
    return null;
  }
}

function canSubmitReports(roles: EmployeeRole[]) {
  return roles.some(
    (r) =>
      r === "group_leader" ||
      r === "warehouse_reporter" ||
      r === "warehouse_admin" ||
      r === "picker" ||
      r === "unloader"
  );
}

function canSubmitWeeklyReports(roles: EmployeeRole[]) {
  return roles.some(
    (r) =>
      r === "group_leader" ||
      r === "warehouse_reporter" ||
      r === "warehouse_admin"
  );
}

function isWarehouseReporter(roles: EmployeeRole[]) {
  return roles.includes("warehouse_reporter") || roles.includes("warehouse_admin");
}

function isGroupLeader(roles: EmployeeRole[]) {
  return roles.includes("group_leader");
}

export async function getWarehouseReportPortalContext(employeeId: number) {
  const employee = await getEmployee(employeeId);
  if (!employee) return null;

  const zones = employee.warehouseZones ?? [];
  const reportWeek = formatReportWeek(new Date());
  const allLeaders = (await listEmployees("group_leader")).map((leader) => ({
    id: leader.id,
    name: leader.name,
    zones: leader.warehouseZones ?? [],
  }));

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      roles: employee.roles,
    },
    zones,
    allZones: await listDistinctWarehouseZones(),
    groupLeaders: allLeaders,
    reportWeek,
    isWednesday: isWednesday(),
    wednesdayLabel: wednesdayLabel(reportWeek),
    canReport: canSubmitReports(employee.roles),
    canSubmitWeekly: canSubmitWeeklyReports(employee.roles),
    canReportWholeWarehouse: isWarehouseReporter(employee.roles),
    isGroupLeader: isGroupLeader(employee.roles),
    incidentCategories: WAREHOUSE_INCIDENT_CATEGORIES,
    recentReports: await listEmployeeReports(employeeId, 10),
  };
}

export async function listEmployeeReports(employeeId: number, limit = 20) {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select()
      .from(warehouseReports)
      .where(eq(warehouseReports.employeeId, employeeId))
      .orderBy(desc(warehouseReports.createdAt))
      .limit(limit)
  );
  return Promise.all(rows.map((row) => enrichReport(row)));
}

async function enrichReport(row: typeof warehouseReports.$inferSelect) {
  const db = await getDb();
  const [author, photos, tags, zones, latestEditRequest] = await Promise.all([
    dbOne(
      db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.id, row.employeeId))
    ),
    dbAll(
      db
        .select()
        .from(warehouseReportPhotos)
        .where(eq(warehouseReportPhotos.reportId, row.id))
    ),
    dbAll(
      db
        .select({
          id: employees.id,
          name: employees.name,
        })
        .from(warehouseReportTags)
        .innerJoin(
          employees,
          eq(warehouseReportTags.taggedEmployeeId, employees.id)
        )
        .where(eq(warehouseReportTags.reportId, row.id))
    ),
    dbAll(
      db
        .select({ zone: warehouseReportZones.zone })
        .from(warehouseReportZones)
        .where(eq(warehouseReportZones.reportId, row.id))
    ),
    dbOne(
      db
        .select()
        .from(warehouseReportEditRequests)
        .where(eq(warehouseReportEditRequests.reportId, row.id))
        .orderBy(desc(warehouseReportEditRequests.createdAt))
        .limit(1)
    ),
  ]);

  return {
    id: row.id,
    employeeId: row.employeeId,
    reportType: row.reportType as WarehouseReportType,
    scope: row.scope as WarehouseReportScope,
    zone: row.zone,
    zones: zones.map((z) => z.zone),
    reportWeek: row.reportWeek,
    category: row.category,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    employee: author ?? { id: row.employeeId, name: "Unknown" },
    taggedLeaders: tags,
    photos: photos.map((p) => ({
      id: p.id,
      url: `/api/uploads/${p.photoPath}`,
    })),
    editRequest: latestEditRequest
      ? {
          id: latestEditRequest.id,
          status: latestEditRequest.status,
          proposedBody: latestEditRequest.proposedBody,
          reason: latestEditRequest.reason,
          adminNote: latestEditRequest.adminNote,
          createdAt: latestEditRequest.createdAt,
          reviewedAt: latestEditRequest.reviewedAt,
        }
      : null,
  };
}

export async function getWarehouseReport(id: number) {
  const row = await getReportRow(id);
  if (!row) return null;
  return enrichReport(row);
}

export async function submitWarehouseReport(input: SubmitWarehouseReportInput) {
  if (!canSubmitReports(input.employeeRoles)) {
    return { ok: false as const, error: "You cannot submit warehouse reports." };
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false as const, error: "Write a report description." };
  }

  if (!WAREHOUSE_REPORT_TYPES.includes(input.reportType)) {
    return { ok: false as const, error: "Invalid report type." };
  }

  const assignedZones = await getEmployeeWarehouseZones(input.employeeId);
  const reporter = isWarehouseReporter(input.employeeRoles);
  const leader = isGroupLeader(input.employeeRoles);

  let scope: WarehouseReportScope = "zone";
  let zone: string | null = null;
  let zones: string[] = [];
  let reportWeek: string | null = null;
  const db = await getDb();

  if (input.reportType === "weekly") {
    reportWeek = input.reportWeek?.trim() || formatReportWeek(new Date());
    if (input.reportType === "weekly" && !isWednesday()) {
      // Allow submit other days but nudge — still accept
    }

    if (reporter && input.zones && input.zones.length > 0) {
      scope = "warehouse";
      zones = input.zones;
    } else if (reporter) {
      scope = "warehouse";
      zones = await listDistinctWarehouseZones();
    } else if (leader) {
      scope = "zone";
      zones = assignedZones;
      if (zones.length === 0) {
        return {
          ok: false as const,
          error: "No warehouse zones assigned to you yet.",
        };
      }
    } else if (!canSubmitWeeklyReports(input.employeeRoles)) {
      return {
        ok: false as const,
        error: "Weekly reports require group leader or warehouse reporter role.",
      };
    }

    const existing = await dbOne(
      db
        .select({ id: warehouseReports.id })
        .from(warehouseReports)
        .where(
          and(
            eq(warehouseReports.employeeId, input.employeeId),
            eq(warehouseReports.reportType, "weekly"),
            eq(warehouseReports.reportWeek, reportWeek),
            eq(warehouseReports.scope, scope)
          )
        )
    );
    if (existing) {
      return {
        ok: false as const,
        error: `You already submitted the weekly report for ${wednesdayLabel(reportWeek)}.`,
      };
    }
  } else {
    if (!WAREHOUSE_INCIDENT_CATEGORIES.includes(input.category as WarehouseIncidentCategory)) {
      return { ok: false as const, error: "Invalid category." };
    }

    if (reporter && !input.zone) {
      scope = "warehouse";
    } else {
      scope = "zone";
      zone = input.zone?.trim() || null;
      if (!zone) {
        return { ok: false as const, error: "Select a zone." };
      }
      if (leader && assignedZones.length > 0 && !assignedZones.includes(zone)) {
        return {
          ok: false as const,
          error: "That zone is not assigned to you.",
        };
      }
      zones = [zone];
    }
  }

  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(warehouseReports)
      .values({
        employeeId: input.employeeId,
        reportType: input.reportType,
        scope,
        zone,
        reportWeek,
        category:
          input.reportType === "weekly" ? "weekly_summary" : input.category,
        body,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: warehouseReports.id })
  );

  if (!inserted) {
    return { ok: false as const, error: "Could not save report." };
  }

  const reportId = inserted.id;

  for (const z of zones) {
    await db.insert(warehouseReportZones).values({ reportId, zone: z });
  }

  if (reporter && input.taggedLeaderIds?.length) {
    const uniqueTags = [...new Set(input.taggedLeaderIds)];
    for (const taggedEmployeeId of uniqueTags) {
      const tagged = await getEmployee(taggedEmployeeId);
      if (tagged?.roles.includes("group_leader")) {
        await db.insert(warehouseReportTags).values({
          reportId,
          taggedEmployeeId,
        });
      }
    }
  }

  let photosSkipped = 0;
  if (input.photos?.length) {
    for (let i = 0; i < input.photos.length; i++) {
      const photo = input.photos[i];
      const photoPath = saveWarehouseReportPhoto(
        reportId,
        photo.buffer,
        photo.mimeType,
        i
      );
      if (!photoPath) {
        photosSkipped++;
        continue;
      }
      await db.insert(warehouseReportPhotos).values({
        reportId,
        photoPath,
        createdAt: now,
      });
    }
  }

  const employee = await getEmployee(input.employeeId);
  await logActivity(
    "create",
    "warehouse_report",
    reportId,
    `Warehouse ${input.reportType} report by ${employee?.name ?? input.employeeId}`,
    {
      category: "system",
      details: {
        reportType: input.reportType,
        scope,
        zone,
        zones,
        reportWeek,
      },
    }
  );

  const saved = await getReportRow(reportId);
  return {
    ok: true as const,
    report: await enrichReport(saved!),
    ...(photosSkipped > 0
      ? {
          photoWarning:
            photosSkipped === 1
              ? "Report saved but one photo could not be stored."
              : `Report saved but ${photosSkipped} photos could not be stored.`,
        }
      : {}),
  };
}

async function getReportRow(id: number) {
  const db = await getDb();
  return dbOne(
    db.select().from(warehouseReports).where(eq(warehouseReports.id, id))
  );
}

export async function listWarehouseReportsForWeek(reportWeek: string) {
  const weekStart = new Date(`${reportWeek}T12:00:00`);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  const db = await getDb();
  const allRows = await dbAll(
    db.select().from(warehouseReports).orderBy(desc(warehouseReports.createdAt))
  );

  const weekly = allRows.filter(
    (row) => row.reportType === "weekly" && row.reportWeek === reportWeek
  );
  const incidents = allRows.filter(
    (row) =>
      row.reportType === "incident" &&
      row.createdAt >= weekStartIso &&
      row.createdAt < weekEndIso
  );

  return {
    reportWeek,
    wednesdayLabel: wednesdayLabel(reportWeek),
    weekly: await Promise.all(weekly.map(enrichReport)),
    incidents: await Promise.all(incidents.map(enrichReport)),
    pendingEditRequests: await listPendingReportEditRequests(),
  };
}

function deleteReportPhotoFiles(photoPaths: string[]) {
  for (const relativePath of photoPaths) {
    const fullPath = path.join(UPLOAD_ROOT, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}

export async function deleteWarehouseReport(id: number) {
  const row = await getReportRow(id);
  if (!row) {
    return { ok: false as const, error: "Report not found" };
  }

  const db = await getDb();
  const photos = await dbAll(
    db
      .select({ photoPath: warehouseReportPhotos.photoPath })
      .from(warehouseReportPhotos)
      .where(eq(warehouseReportPhotos.reportId, id))
  );
  deleteReportPhotoFiles(photos.map((p) => p.photoPath));

  await db.delete(warehouseReports).where(eq(warehouseReports.id, id));

  const employee = await getEmployee(row.employeeId);
  await logActivity(
    "delete",
    "warehouse_report",
    id,
    `Deleted warehouse report by ${employee?.name ?? row.employeeId}`,
    { category: "system", details: { reportId: id } }
  );

  return { ok: true as const, id };
}

export async function updateWarehouseReportAdmin(
  id: number,
  input: {
    body?: string;
    category?: string;
    photos?: Array<{ buffer: Buffer; mimeType: string }>;
  }
) {
  const row = await getReportRow(id);
  if (!row) {
    return { ok: false as const, error: "Report not found" };
  }

  const body = input.body?.trim();
  if (body !== undefined && !body) {
    return { ok: false as const, error: "Report text cannot be empty." };
  }

  if (
    input.category &&
    row.reportType === "incident" &&
    !WAREHOUSE_INCIDENT_CATEGORIES.includes(
      input.category as WarehouseIncidentCategory
    )
  ) {
    return { ok: false as const, error: "Invalid category." };
  }

  const db = await getDb();
  const now = new Date().toISOString();
  await db
    .update(warehouseReports)
    .set({
      ...(body !== undefined ? { body } : {}),
      ...(input.category && row.reportType === "incident"
        ? { category: input.category }
        : {}),
      updatedAt: now,
    })
    .where(eq(warehouseReports.id, id));

  if (input.photos?.length) {
    const existingPhotos = await dbAll(
      db
        .select({ id: warehouseReportPhotos.id })
        .from(warehouseReportPhotos)
        .where(eq(warehouseReportPhotos.reportId, id))
    );
    for (let i = 0; i < input.photos.length; i++) {
      const photo = input.photos[i];
      const photoPath = saveWarehouseReportPhoto(
        id,
        photo.buffer,
        photo.mimeType,
        existingPhotos.length + i
      );
      if (!photoPath) continue;
      await db.insert(warehouseReportPhotos).values({
        reportId: id,
        photoPath,
        createdAt: now,
      });
    }
  }

  await logActivity(
    "update",
    "warehouse_report",
    id,
    `Admin updated warehouse report #${id}`,
    { category: "system", details: { reportId: id } }
  );

  const saved = await getReportRow(id);
  return { ok: true as const, report: await enrichReport(saved!) };
}

export async function requestReportEdit(input: {
  reportId: number;
  employeeId: number;
  proposedBody: string;
  reason?: string;
}) {
  const row = await getReportRow(input.reportId);
  if (!row) {
    return { ok: false as const, error: "Report not found" };
  }
  if (row.employeeId !== input.employeeId) {
    return { ok: false as const, error: "You can only request edits to your own reports." };
  }

  const proposedBody = input.proposedBody.trim();
  if (!proposedBody) {
    return { ok: false as const, error: "Write the corrected report text." };
  }

  const db = await getDb();
  const pending = await dbOne(
    db
      .select({ id: warehouseReportEditRequests.id })
      .from(warehouseReportEditRequests)
      .where(
        and(
          eq(warehouseReportEditRequests.reportId, input.reportId),
          eq(warehouseReportEditRequests.status, "pending")
        )
      )
  );
  if (pending) {
    return {
      ok: false as const,
      error: "An edit request is already waiting for admin approval.",
    };
  }

  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(warehouseReportEditRequests)
      .values({
        reportId: input.reportId,
        employeeId: input.employeeId,
        proposedBody,
        reason: input.reason?.trim() || null,
        status: "pending",
        createdAt: now,
      })
      .returning({ id: warehouseReportEditRequests.id })
  );

  await logActivity(
    "update",
    "warehouse_report",
    input.reportId,
    `Edit requested for warehouse report #${input.reportId}`,
    {
      category: "system",
      details: { requestId: inserted!.id, employeeId: input.employeeId },
    }
  );

  return {
    ok: true as const,
    requestId: inserted!.id,
    report: await getWarehouseReport(input.reportId),
  };
}

export async function listPendingReportEditRequests() {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        id: warehouseReportEditRequests.id,
        reportId: warehouseReportEditRequests.reportId,
        proposedBody: warehouseReportEditRequests.proposedBody,
        reason: warehouseReportEditRequests.reason,
        status: warehouseReportEditRequests.status,
        createdAt: warehouseReportEditRequests.createdAt,
        employeeId: employees.id,
        employeeName: employees.name,
        reportType: warehouseReports.reportType,
        reportBody: warehouseReports.body,
        reportCategory: warehouseReports.category,
        reportCreatedAt: warehouseReports.createdAt,
      })
      .from(warehouseReportEditRequests)
      .innerJoin(
        warehouseReports,
        eq(warehouseReportEditRequests.reportId, warehouseReports.id)
      )
      .innerJoin(employees, eq(warehouseReportEditRequests.employeeId, employees.id))
      .where(eq(warehouseReportEditRequests.status, "pending"))
      .orderBy(desc(warehouseReportEditRequests.createdAt))
  );

  return rows;
}

export async function approveReportEditRequest(
  requestId: number,
  adminNote?: string
) {
  const db = await getDb();
  const request = await dbOne(
    db
      .select()
      .from(warehouseReportEditRequests)
      .where(eq(warehouseReportEditRequests.id, requestId))
  );
  if (!request) {
    return { ok: false as const, error: "Edit request not found" };
  }
  if (request.status !== "pending") {
    return { ok: false as const, error: "This request was already reviewed." };
  }

  const now = new Date().toISOString();
  await db
    .update(warehouseReports)
    .set({ body: request.proposedBody, updatedAt: now })
    .where(eq(warehouseReports.id, request.reportId));

  await db
    .update(warehouseReportEditRequests)
    .set({
      status: "approved",
      adminNote: adminNote?.trim() || null,
      reviewedAt: now,
    })
    .where(eq(warehouseReportEditRequests.id, requestId));

  await logActivity(
    "update",
    "warehouse_report",
    request.reportId,
    `Approved edit request #${requestId}`,
    { category: "system", details: { requestId } }
  );

  return {
    ok: true as const,
    report: await getWarehouseReport(request.reportId),
  };
}

export async function rejectReportEditRequest(
  requestId: number,
  adminNote?: string
) {
  const db = await getDb();
  const request = await dbOne(
    db
      .select()
      .from(warehouseReportEditRequests)
      .where(eq(warehouseReportEditRequests.id, requestId))
  );
  if (!request) {
    return { ok: false as const, error: "Edit request not found" };
  }
  if (request.status !== "pending") {
    return { ok: false as const, error: "This request was already reviewed." };
  }

  const now = new Date().toISOString();
  await db
    .update(warehouseReportEditRequests)
    .set({
      status: "rejected",
      adminNote: adminNote?.trim() || null,
      reviewedAt: now,
    })
    .where(eq(warehouseReportEditRequests.id, requestId));

  return {
    ok: true as const,
    report: await getWarehouseReport(request.reportId),
  };
}

export async function assignGroupLeaderZones(input: {
  employeeId: number;
  zones: string[];
}) {
  const employee = await getEmployee(input.employeeId);
  if (!employee) {
    return { ok: false as const, error: "Employee not found" };
  }

  const roles = employee.roles.includes("group_leader")
    ? employee.roles
    : ([...employee.roles, "group_leader"] as EmployeeRole[]);

  if (!employee.roles.includes("group_leader")) {
    await updateEmployee(input.employeeId, { roles });
  }

  const zones = await setEmployeeWarehouseZones(
    input.employeeId,
    input.zones,
    employee.name
  );

  return {
    ok: true as const,
    employee: await getEmployee(input.employeeId),
    zones,
  };
}

export async function listGroupLeaderAssignments() {
  const leaders = await listEmployees("group_leader");
  return leaders.map((leader) => ({
    id: leader.id,
    name: leader.name,
    zones: leader.warehouseZones ?? [],
  }));
}
