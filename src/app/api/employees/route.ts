import { NextRequest, NextResponse } from "next/server";
import {
  createEmployee,
  EmployeeCredentialError,
  EmployeeVehicleError,
  listEmployees,
  type EmployeePayload,
} from "@/lib/services/employees";
import type { EmployeeRole } from "@/lib/constants";
import {
  requireApiTenantSession,
  runApiCompanyAdmin,
  runApiWithTenant,
} from "@/lib/auth/api-guard";
import { isCashierStaff } from "@/lib/employee-categories";
import { TenantRequiredError } from "@/lib/organizations/tenant-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiTenantSession();
    if (!auth.ok) return auth.response;
    const cashier =
      auth.session.role === "employee" && isCashierStaff(auth.session.roles);
    if (auth.session.role !== "admin" && !cashier) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const role = request.nextUrl.searchParams.get("role") as EmployeeRole | null;
    return await runApiWithTenant(async () => {
      const rows = await listEmployees(role ?? undefined);
      if (!cashier) return NextResponse.json(rows);
      return NextResponse.json(
        rows.map((employee) => ({
          id: employee.id,
          name: employee.name,
          status: employee.status,
          roles: employee.roles,
        }))
      );
    });
  } catch (err) {
    if (err instanceof TenantRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to load employees";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as EmployeePayload;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.roles?.length) {
    return NextResponse.json(
      { error: "At least one role is required" },
      { status: 400 }
    );
  }

  try {
    return await runApiCompanyAdmin(async () => {
      const employee = await createEmployee(body);
      return NextResponse.json(employee, { status: 201 });
    });
  } catch (error) {
    if (
      error instanceof EmployeeCredentialError ||
      error instanceof EmployeeVehicleError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
