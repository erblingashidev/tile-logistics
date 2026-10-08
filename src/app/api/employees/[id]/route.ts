import { NextRequest, NextResponse } from "next/server";
import {
  deleteEmployee,
  EmployeeCredentialError,
  EmployeeVehicleError,
  getEmployee,
  updateEmployee,
  type EmployeePayload,
} from "@/lib/services/employees";
import { requireApiCompanyAdmin } from "@/lib/auth/api-guard";
import { TenantRequiredError } from "@/lib/organizations/tenant-context";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiCompanyAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let employee;
  try {
    employee = await getEmployee(Number(id));
  } catch (err) {
    if (err instanceof TenantRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(employee);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiCompanyAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json()) as Partial<EmployeePayload>;

  try {
    const employee = await updateEmployee(Number(id), body);
    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(employee);
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
  const auth = await requireApiCompanyAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ok = await deleteEmployee(Number(id));
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
