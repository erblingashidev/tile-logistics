import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { requireApiAdmin } from "@/lib/auth/api-guard";
import {
  AdminCredentialError,
  getAdmin,
  resolveAdminIdForSession,
  updateAdmin,
  type AdminPayload,
} from "@/lib/services/admins";
import { inferEmployeeRoleForAdmin } from "@/lib/admin-roles";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const adminId = await resolveAdminIdForSession({
    adminId: auth.session.adminId,
    username: auth.session.username,
  });
  if (!adminId) {
    return NextResponse.json(
      {
        error:
          "No database profile linked to this session. Log out and log in again.",
      },
      { status: 404 }
    );
  }

  const admin = await getAdmin(adminId);
  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }
  return NextResponse.json(admin);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const adminId = await resolveAdminIdForSession({
    adminId: auth.session.adminId,
    username: auth.session.username,
  });
  if (!adminId) {
    return NextResponse.json(
      {
        error:
          "No database profile linked to this session. Log out and log in again.",
      },
      { status: 404 }
    );
  }

  const body = (await request.json()) as Partial<
    Pick<AdminPayload, "name" | "username" | "title" | "email" | "isActive" | "employeeRole">
  >;

  if (body.isActive !== undefined) {
    return NextResponse.json(
      { error: "Use Admin users to change account status" },
      { status: 400 }
    );
  }

  try {
    const admin = await updateAdmin(adminId, {
      ...body,
      employeeRole: inferEmployeeRoleForAdmin(body.title, body.employeeRole),
    }, {
      actorAdminId: adminId,
    });
    if (!admin) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    await setSessionCookie({
      role: "admin",
      adminId: admin.id,
      name: admin.name,
      username: admin.username,
      title: admin.title,
    });

    return NextResponse.json(admin);
  } catch (err) {
    if (err instanceof AdminCredentialError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
