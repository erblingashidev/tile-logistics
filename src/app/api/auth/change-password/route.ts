import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { changeEmployeePassword } from "@/lib/services/employees";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireEmployee();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current and new password are required" },
      { status: 400 }
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { error: "New passwords do not match" },
      { status: 400 }
    );
  }

  const result = await changeEmployeePassword(
    session.employeeId,
    currentPassword,
    newPassword
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
