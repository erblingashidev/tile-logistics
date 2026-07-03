import { NextRequest, NextResponse } from "next/server";
import {
  createEmployee,
  EmployeeCredentialError,
  listEmployees,
  type EmployeePayload,
} from "@/lib/services/employees";
import type { EmployeeRole } from "@/lib/constants";
import { requireApiAdmin } from "@/lib/auth/api-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const role = request.nextUrl.searchParams.get("role") as EmployeeRole | null;
  return NextResponse.json(await listEmployees(role ?? undefined));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

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
    const employee = await createEmployee(body);
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    if (error instanceof EmployeeCredentialError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
