import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import {
  assignEmployeeToOrder,
  unassignEmployeeFromOrder,
} from "@/lib/services/employees";
import { getOrder } from "@/lib/services/orders";
import type { EmployeeRole } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json();
  const employeeId = Number(body.employeeId);
  const role = body.role as EmployeeRole;

  if (!employeeId || !role) {
    return NextResponse.json(
      { error: "employeeId and role are required" },
      { status: 400 }
    );
  }

  const result = await assignEmployeeToOrder(Number(id), employeeId, role);
  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(await getOrder(Number(id)));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const role = request.nextUrl.searchParams.get("role") as EmployeeRole;
  if (!role) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  await unassignEmployeeFromOrder(Number(id), role);
  return NextResponse.json(await getOrder(Number(id)));
}
