import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import {
  loginAdmin,
  loginEmployee,
  employeeLoginRedirect,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  const user =
    (await loginAdmin(username, password)) ??
    (await loginEmployee(username, password));

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken(user);
  const redirect =
    user.role === "admin" ? "/" : employeeLoginRedirect(user.roles);

  const response = NextResponse.json({
    user: {
      role: user.role,
      name: user.name,
      employeeId: user.role === "employee" ? user.employeeId : undefined,
      roles: user.role === "employee" ? user.roles : undefined,
    },
    redirect,
  });

  response.cookies.set(
    sessionCookieOptions().name,
    token,
    sessionCookieOptions()
  );

  return response;
}
