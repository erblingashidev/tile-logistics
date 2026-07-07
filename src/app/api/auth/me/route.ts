import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAdmin } from "@/lib/services/admins";
import { getEmployee } from "@/lib/services/employees";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  if (session.role === "admin") {
    if (session.adminId > 0) {
      const profile = await getAdmin(session.adminId);
      if (profile) {
        return NextResponse.json({
          user: {
            role: "admin" as const,
            adminId: profile.id,
            name: profile.name,
            username: profile.username,
            title: profile.title,
            email: profile.email,
            isActive: profile.isActive,
            createdAt: profile.createdAt,
            lastLoginAt: profile.lastLoginAt,
          },
        });
      }
    }

    return NextResponse.json({
      user: {
        ...session,
        email: null,
        isActive: true,
        createdAt: null,
        lastLoginAt: null,
      },
    });
  }

  const profile = await getEmployee(session.employeeId);
  return NextResponse.json({
    user: {
      ...session,
      status: profile?.status ?? "available",
      username: profile?.username ?? null,
    },
  });
}
