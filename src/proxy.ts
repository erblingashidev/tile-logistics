import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import type { EmployeeRole } from "@/lib/constants";
import {
  employeeLoginRedirect,
  isSalesStaff,
  isWarehouseStaff,
  WMS_STAFF_ROLES,
  WAREHOUSE_REPORT_ROLES,
} from "@/lib/employee-categories";
import {
  isWmsAdminPath,
  isWmsApiPath,
  isWmsPortalPath,
} from "@/lib/features/wms-enabled";
import {
  FEATURE_FLAGS_COOKIE,
  parseFeatureFlagsCookie,
} from "@/lib/features/cookie";
import {
  platformAdminNeedsOrgPicker,
  platformOrgPickerPathAllowed,
} from "@/lib/auth/platform-admin";
import { isLegacyAgimiOrganization } from "@/lib/organizations/constants";
import {
  parseTenantPath,
  pathUsesTenantPrefix,
  resolveSessionTenantSlug,
  tenantPath,
  tenantPathForSession,
} from "@/lib/organizations/paths";
import {
  ORGANIZATION_ID_HEADER,
  resolveSessionOrganizationId,
} from "@/lib/organizations/tenant-context";
import type { SessionUser } from "@/lib/auth/session";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/_next",
  "/favicon.ico",
];

const ONBOARDING_ALLOWED_PREFIXES = [
  "/onboarding",
  "/api/onboarding",
  "/api/auth/refresh-session",
  "/api/auth/logout",
  "/api/auth/me",
];

const SALES_PREFIXES = ["/sales", "/api/sales"];

function employeePathAllowed(
  pathname: string,
  roles: EmployeeRole[],
  wmsEnabled: boolean
) {
  if (pathname.startsWith("/api/auth")) return true;

  if (pathname.startsWith("/portal/no-access")) {
    return !isWarehouseStaff(roles) && !isSalesStaff(roles);
  }

  if (isSalesStaff(roles) && SALES_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true;
  }

  const isDepotPage =
    pathname.startsWith("/portal/unload") ||
    pathname.startsWith("/portal/mapping") ||
    pathname.startsWith("/portal/inventory") ||
    pathname.startsWith("/portal/wms");

  if (!wmsEnabled && (isDepotPage || pathname.startsWith("/api/wms"))) {
    return false;
  }

  if (
    (isDepotPage || pathname.startsWith("/api/wms")) &&
    roles.some((r) => WMS_STAFF_ROLES.includes(r))
  ) {
    return true;
  }

  if (
    (pathname.startsWith("/portal/reports") ||
      pathname.startsWith("/api/portal/warehouse-reports")) &&
    wmsEnabled &&
    roles.some((r) => WAREHOUSE_REPORT_ROLES.includes(r))
  ) {
    return true;
  }

  if (
    pathname.startsWith("/api/portal") ||
    (pathname.startsWith("/portal") && !isDepotPage)
  ) {
    return isWarehouseStaff(roles);
  }

  if (pathname.startsWith("/api/uploads") && isWarehouseStaff(roles)) {
    return true;
  }

  return false;
}

function appUrl(request: NextRequest, session: SessionUser, internalPath: string) {
  return new URL(tenantPathForSession(session, internalPath), request.url);
}

async function resolveProxyOrganizationId(
  session: SessionUser,
  urlSlug: string | null
): Promise<number | null> {
  const fromSession = resolveSessionOrganizationId(session);
  if (fromSession) return fromSession;

  if (!urlSlug || session.role !== "admin") return null;
  const platformAdmin =
    session.adminId === 0 || session.isPlatformAdmin === true;
  if (!platformAdmin) return null;

  const { getOrganizationBySlug } = await import(
    "@/lib/services/organizations"
  );
  const org = await getOrganizationBySlug(urlSlug);
  return org?.status === "active" ? org.id : null;
}

async function forwardWithTenantHeaders(
  request: NextRequest,
  session: SessionUser,
  urlSlug: string | null,
  init: { rewrite?: URL } = {}
): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers);
  const orgId = await resolveProxyOrganizationId(session, urlSlug);
  if (orgId) {
    requestHeaders.set(ORGANIZATION_ID_HEADER, String(orgId));
  }
  if (init.rewrite) {
    return NextResponse.rewrite(init.rewrite, {
      request: { headers: requestHeaders },
    });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function proxy(request: NextRequest) {
  const rawPathname = request.nextUrl.pathname;
  const { tenantSlug: urlSlug, pathname } = parseTenantPath(rawPathname);

  if (request.nextUrl.searchParams.has("_r")) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("_r");
    return NextResponse.redirect(clean);
  }

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
    loginUrl.searchParams.set("from", rawPathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifySessionToken(token);
  const sessionSlug = session ? resolveSessionTenantSlug(session) : null;
  const wmsEnabled = parseFeatureFlagsCookie(
    request.cookies.get(FEATURE_FLAGS_COOKIE)?.value
  ).warehouseWms;

  if (!session) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(
          new URL(
            `/login?from=${encodeURIComponent(rawPathname)}`,
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

  if (
    !pathname.startsWith("/api/") &&
    pathUsesTenantPrefix(pathname) &&
    sessionSlug
  ) {
    if (!urlSlug) {
      return NextResponse.redirect(
        new URL(tenantPath(sessionSlug, pathname), request.url)
      );
    }
    if (urlSlug !== sessionSlug) {
      return NextResponse.redirect(
        new URL(tenantPath(sessionSlug, pathname), request.url)
      );
    }
  }

  if (session.role === "employee") {
    if (!employeePathAllowed(pathname, session.roles, wmsEnabled)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(
        appUrl(request, session, employeeLoginRedirect(session.roles))
      );
    }
  }

  if (session.role === "admin" && pathname.startsWith("/portal")) {
    return NextResponse.redirect(appUrl(request, session, "/"));
  }

  if (session.role === "admin") {
    const platformAdmin =
      session.adminId === 0 || session.isPlatformAdmin === true;

    if (
      (pathname.startsWith("/platform") ||
        pathname.startsWith("/api/platform")) &&
      !platformAdmin
    ) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(appUrl(request, session, "/"));
    }

    if (platformAdmin && platformAdminNeedsOrgPicker(session)) {
      if (!platformOrgPickerPathAllowed(pathname)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Select a company first." },
            { status: 403 }
          );
        }
        return NextResponse.redirect(
          new URL("/platform/companies", request.url)
        );
      }
    }

    if (
      !platformAdmin &&
      session.onboardingComplete === false &&
      !isLegacyAgimiOrganization(session.organizationId)
    ) {
      const allowed = ONBOARDING_ALLOWED_PREFIXES.some((p) =>
        pathname.startsWith(p)
      );
      if (!allowed) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Complete company setup first." },
            { status: 403 }
          );
        }
        return NextResponse.redirect(appUrl(request, session, "/onboarding"));
      }
    }

    if (platformAdmin && pathname.startsWith("/onboarding")) {
      const target = platformAdminNeedsOrgPicker(session)
        ? "/platform/companies"
        : "/";
      return NextResponse.redirect(
        target.startsWith("/platform")
          ? new URL(target, request.url)
          : appUrl(request, session, target)
      );
    }

    if (session.onboardingComplete && pathname.startsWith("/onboarding")) {
      return NextResponse.redirect(appUrl(request, session, "/"));
    }
  }

  if (!wmsEnabled) {
    if (session.role === "admin" && isWmsAdminPath(pathname)) {
      return NextResponse.redirect(appUrl(request, session, "/orders"));
    }
    if (session.role === "employee" && isWmsPortalPath(pathname)) {
      return NextResponse.redirect(appUrl(request, session, "/portal"));
    }
    if (pathname.startsWith("/api/") && isWmsApiPath(pathname)) {
      return NextResponse.json({ error: "Warehouse module is turned off" }, { status: 403 });
    }
  }

  if (urlSlug) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathname;
    return forwardWithTenantHeaders(request, session, urlSlug, {
      rewrite: rewriteUrl,
    });
  }

  return forwardWithTenantHeaders(request, session, null);
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|.*\\.(?:ico|svg|png|jpg|webp)$).*)",
  ],
};
