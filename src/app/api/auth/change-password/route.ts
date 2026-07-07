import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin, requireEmployee } from "@/lib/auth";
import { changeAdminPassword } from "@/lib/services/admins";
import { changeEmployeePassword } from "@/lib/services/employees";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
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

  if (session.role === "admin") {
    if (session.adminId <= 0) {
      return NextResponse.json(
        {
          error:
            "This legacy admin account cannot change password here. Add a database admin account first.",
        },
        { status: 400 }
      );
    }

    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await changeAdminPassword(
      session.adminId,
      currentPassword,
      newPassword
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  try {
    const employeeSession = await requireEmployee();
    const result = await changeEmployeePassword(
      employeeSession.employeeId,
      currentPassword,
      newPassword
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
