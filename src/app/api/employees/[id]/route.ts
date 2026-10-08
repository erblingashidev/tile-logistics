import { NextRequest, NextResponse } from "next/server";
import {
  deleteEmployee,
  EmployeeCredentialError,
  EmployeeVehicleError,
  getEmployee,
  updateEmployee,
  type EmployeePayload,
} from "@/lib/services/employees";
import { runApiCompanyAdmin } from "@/lib/auth/api-guard";
import { TenantRequiredError } from "@/lib/organizations/tenant-context";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return await runApiCompanyAdmin(async () => {
      const employee = await getEmployee(Number(id));
      if (!employee) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(employee);
    });
  } catch (err) {
    if (err instanceof TenantRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as Partial<EmployeePayload>;

  try {
    return await runApiCompanyAdmin(async () => {
      const employee = await updateEmployee(Number(id), body);
      if (!employee) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(employee);
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return runApiCompanyAdmin(async () => {
    const ok = await deleteEmployee(Number(id));
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  });
}
