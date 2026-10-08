import { NextRequest, NextResponse } from "next/server";
import {
  createEmployee,
  EmployeeCredentialError,
  EmployeeVehicleError,
  listEmployees,
  type EmployeePayload,
} from "@/lib/services/employees";
import type { EmployeeRole } from "@/lib/constants";
import { runApiCompanyAdmin } from "@/lib/auth/api-guard";
import { TenantRequiredError } from "@/lib/organizations/tenant-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const role = request.nextUrl.searchParams.get("role") as EmployeeRole | null;
    return await runApiCompanyAdmin(async () =>
      NextResponse.json(await listEmployees(role ?? undefined))
    );
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
