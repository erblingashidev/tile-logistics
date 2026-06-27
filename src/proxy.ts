import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import type { EmployeeRole } from "@/lib/constants";
import {
  employeeLoginRedirect,
  isSalesStaff,
  isWarehouseStaff,
  WMS_STAFF_ROLES,
} from "@/lib/employee-categories";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/_next",
  "/favicon.ico",
];

const SALES_PREFIXES = [
  "/orders",
  "/dispatch",
  "/api/orders",
  "/api/locations",
  "/api/dashboard",
  "/api/dispatch",
];

function employeePathAllowed(pathname: string, roles: EmployeeRole[]) {
  if (pathname.startsWith("/api/auth")) return true;

  if (pathname.startsWith("/portal/no-access")) {
    return !isWarehouseStaff(roles) && !isSalesStaff(roles);
  }

  if (isSalesStaff(roles) && SALES_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true;
  }

  if (
    (pathname.startsWith("/portal/wms") || pathname.startsWith("/api/wms")) &&
    roles.some((r) => WMS_STAFF_ROLES.includes(r))
  ) {
    return true;
  }

  if (
    pathname.startsWith("/api/portal") ||
    (pathname.startsWith("/portal") && !pathname.startsWith("/portal/wms"))
  ) {
    return isWarehouseStaff(roles);
  }

  if (pathname.startsWith("/api/uploads") && isWarehouseStaff(roles)) {
    return true;
  }

  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.match(/\.(ico|svg|png|jpg|webp)$/)
  ) {
    return NextResponse.next();
  }

  if (pathname === "/api/auth/logout" || pathname === "/api/auth/me") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifySessionToken(token);

  if (!session) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(
          new URL(
            `/login?from=${encodeURIComponent(pathname)}`,
            request.url
          )
        );
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  if (session.role === "employee") {
    if (!employeePathAllowed(pathname, session.roles)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(
        new URL(employeeLoginRedirect(session.roles), request.url)
      );
    }
  }

  if (session.role === "admin" && pathname.startsWith("/portal")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|.*\\.(?:ico|svg|png|jpg|webp)$).*)",
  ],
};
