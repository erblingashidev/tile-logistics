import { NextRequest, NextResponse } from "next/server";
import {
  deleteEmployee,
  EmployeeCredentialError,
  getEmployee,
  updateEmployee,
  type EmployeePayload,
} from "@/lib/services/employees";
import { requireApiAdmin } from "@/lib/auth/api-guard";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const employee = await getEmployee(Number(id));
  if (!employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(employee);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAdmin();
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
    if (error instanceof EmployeeCredentialError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ok = await deleteEmployee(Number(id));
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
