"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui";
import {
  useCompanyModules,
  useCompanyProfile,
} from "@/components/company/CompanyProfileProvider";
import { useFeatureFlags } from "@/components/features/FeatureFlagsProvider";
import { WAREHOUSE_SIDEBAR_LINKS } from "@/components/warehouse/WarehouseNav";
import { platformAdminNeedsOrgPicker } from "@/lib/auth/platform-admin";
import type { CompanyModuleFlags } from "@/lib/company-profile";
import type { FeatureFlags } from "@/lib/features/catalog";
import { useOrgPath } from "@/components/organization/OrgPathProvider";
import { GLOBAL_PATH_SEGMENTS } from "@/lib/organizations/paths";
import { useAdminSession } from "@/components/layout/AdminSessionProvider";
import { CashierPageFrame } from "@/components/layout/CashierPageFrame";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import type { AppMessages } from "@/lib/i18n/messages";

function warehouseNavLabels(t: AppMessages) {
  return WAREHOUSE_SIDEBAR_LINKS.map((item) => {
    const key = item.href as keyof AppMessages["nav"]["warehouse"];
    return {
      href: item.href,
      label: t.nav.warehouse[key] ?? item.label,
    };
  });
}

function buildNavGroups(
  flags: FeatureFlags,
  modules: CompanyModuleFlags,
  isPlatformAdmin: boolean,
  t: AppMessages
) {
  return [
    {
      label: t.nav.groups.operations,
      items: [
        { href: "/", label: t.nav.items.dashboard },
        { href: "/orders", label: t.nav.items.orders },
        ...(modules.returns
          ? [{ href: "/returns", label: t.nav.items.returns }]
          : []),
        ...(flags.operationsSuite
          ? [
              { href: "/dispatch", label: t.nav.items.dispatch },
              { href: "/map", label: t.nav.items.map },
            ]
          : []),
      ],
    },
    ...(modules.vehicles
      ? [
          {
            label: t.nav.groups.fleet,
            items: [
              { href: "/vehicles", label: t.nav.items.vehicles },
              { href: "/vehicles/maintenance", label: t.nav.items.maintenance },
            ],
          },
        ]
      : []),
    {
      label: t.nav.groups.people,
      items: [
        { href: "/employees", label: t.nav.items.employees },
        { href: "/admins", label: t.nav.items.admins },
      ],
    },
    ...(flags.warehouseWms
      ? [
          {
            label: t.nav.groups.warehouse,
            items: warehouseNavLabels(t),
          },
        ]
      : []),
    ...(modules.administration !== false
      ? [
          {
            label: t.nav.groups.administration,
            items: [
              { href: "/administration", label: t.nav.items.cashRegister },
              {
                href: "/administration/finance/reports",
                label: t.nav.items.financeReports,
              },
              { href: "/administration/finance/debts", label: t.nav.items.openDebts },
              {
                href: "/administration/finance/debts/by-agent",
                label: t.nav.items.debtsByAgent,
              },
              {
                href: "/administration/finance/debts/by-client",
                label: t.nav.items.debtsByClient,
              },
              { href: "/administration/finance", label: t.nav.items.registerLedger },
              {
                href: "/administration/finance/imports",
                label: t.nav.items.financeImport,
              },
              {
                href: "/administration/finance/settlements",
                label: t.nav.items.paymentStatus,
              },
            ],
          },
        ]
      : []),
    {
      label: t.nav.groups.system,
      items: [
        { href: "/reports", label: t.nav.items.reports },
        { href: "/logs", label: t.nav.items.logs },
        { href: "/settings", label: t.nav.items.settings },
        ...(isPlatformAdmin
          ? [
              { href: "/platform/companies", label: t.nav.items.companies },
              { href: "/platform/applications", label: t.nav.items.signupQueue },
            ]
          : []),
      ],
    },
  ];
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/vehicles") return pathname === "/vehicles";
  if (href === "/warehouse") return pathname === "/warehouse";
  if (href === "/administration") return pathname === "/administration";
  if (href === "/administration/finance") {
    return pathname === "/administration/finance";
  }
  if (href === "/administration/finance/debts") {
    return pathname === "/administration/finance/debts";
  }
  if (href === "/administration/finance/debts/by-agent") {
    return (
      pathname === "/administration/finance/debts/by-agent" ||
      pathname.startsWith("/administration/finance/debts/by-agent/")
    );
  }
  if (href === "/administration/finance/debts/by-client") {
    return (
      pathname === "/administration/finance/debts/by-client" ||
      pathname.startsWith("/administration/finance/debts/by-client/")
    );
  }
  if (href === "/administration/finance/reports") {
    return pathname.startsWith("/administration/finance/reports");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  onNavigate,
  mobile = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const flags = useFeatureFlags();
  const modules = useCompanyModules();
  const { orgPath } = useOrgPath();
  const adminSession = useAdminSession();
  const isPlatformAdmin = adminSession?.isPlatformAdmin ?? false;
  const t = useAppMessages();

  if (!adminSession) {
    return (
      <div className={mobile ? "mb-4 px-3" : "mb-3 px-3"} aria-hidden>
        <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
        <div className="mt-3 space-y-2">
          <div className="h-8 animate-pulse rounded bg-white/5" />
          <div className="h-8 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    );
  }

  const navGroups = buildNavGroups(flags, modules, isPlatformAdmin, t);
  return (
    <>
      {navGroups.map((group) => (
        <div key={group.label} className={mobile ? "mb-4" : "mb-3 last:mb-0"}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={orgPath(item.href)}
                onClick={onNavigate}
                className={`block rounded-md px-3 transition ${
                  mobile ? "py-3 text-base" : "py-2.5 text-[15px]"
                } ${
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      {open ? (
        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
      ) : (
        <>
          <path strokeLinecap="round" d="M4 7h16" />
          <path strokeLinecap="round" d="M4 12h16" />
          <path strokeLinecap="round" d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

function AdminAppShell({
  children,
  title,
  description,
  contentMaxWidth = "default",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  contentMaxWidth?: "default" | "wide" | "full";
}) {
  const mainMaxWidthClass =
    contentMaxWidth === "full"
      ? "max-w-none"
      : contentMaxWidth === "wide"
        ? "max-w-[min(100%,1680px)]"
        : "max-w-7xl";
  const pathname = usePathname();
  const router = useRouter();
  const t = useAppMessages();
  const { orgPath } = useOrgPath();
  const { organizationName } = useCompanyProfile();
  const adminSession = useAdminSession();
  const [userName, setUserName] = useState<string | null>(
    adminSession?.name ?? null
  );
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(
    adminSession?.isPlatformAdmin ?? false
  );
  const [organizationId, setOrganizationId] = useState<number | null>(
    adminSession?.organizationId ?? null
  );
  const [authLoaded, setAuthLoaded] = useState(adminSession != null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isPlatformPickerPage =
    pathname.startsWith("/platform/companies") ||
    pathname.startsWith("/platform/applications");

  useEffect(() => {
    if (adminSession) {
      setUserName(adminSession.name);
      setIsPlatformAdmin(adminSession.isPlatformAdmin);
      setOrganizationId(adminSession.organizationId);
      setAuthLoaded(true);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          const from = encodeURIComponent(pathname || "/");
          router.replace(`/login?from=${from}`);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setUserName(data?.user?.name ?? null);
        setIsPlatformAdmin(data?.user?.isPlatformAdmin === true);
        setOrganizationId(
          typeof data?.user?.organizationId === "number"
            ? data.user.organizationId
            : null
        );
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      })
      .finally(() => {
        if (!cancelled) setAuthLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adminSession, pathname, router]);

  const showCompanyNav =
    !isPlatformPickerPage &&
    (authLoaded
      ? !platformAdminNeedsOrgPicker(
          isPlatformAdmin
            ? {
                role: "admin",
                adminId: 0,
                name: "",
                username: "",
                organizationId,
                isPlatformAdmin: true,
              }
            : null
        )
      : true);

  async function openCompanyPicker() {
    if (isPlatformAdmin) {
      await fetch("/api/platform/leave-organization", { method: "POST" });
    }
    router.push("/platform/companies");
    router.refresh();
  }

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  /** Super-admin: URL slug implies active tenant — sync session for /api calls. */
  useEffect(() => {
    if (!authLoaded || !isPlatformAdmin || organizationId != null) return;
    if (isPlatformPickerPage) return;
    const slug = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (!slug || GLOBAL_PATH_SEGMENTS.has(slug)) return;

    let cancelled = false;
    fetch("/api/platform/switch-organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setOrganizationId(
          typeof data.organizationId === "number" ? data.organizationId : null
        );
        router.refresh();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    authLoaded,
    isPlatformAdmin,
    organizationId,
    isPlatformPickerPage,
    pathname,
    router,
  ]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="flex min-h-screen">
        {showCompanyNav && (
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 self-start flex-col bg-[var(--sidebar)] lg:flex">
          <div className="border-b border-white/10 px-5 py-6">
            <p className="text-[15px] font-semibold tracking-tight text-white">
              {organizationName ?? BRAND.name}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {organizationName ? BRAND.name : BRAND.tagline}
            </p>
          </div>
          <nav className="flex flex-1 flex-col overflow-y-auto p-3">
            <NavLinks pathname={pathname} />
          </nav>
          <div className="border-t border-white/10 p-3">
            <LanguageSwitcher compact className="mb-3 px-1" />
            {userName && (
              <p className="mb-2 truncate rounded px-3 py-2 text-xs text-zinc-400">
                {userName}
              </p>
            )}
            <button
              type="button"
              onClick={logout}
              className="w-full rounded px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              {t.common.logout}
            </button>
          </div>
        </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {isPlatformAdmin &&
            organizationId != null &&
            organizationName &&
            !isPlatformPickerPage && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 lg:px-8">
                {t.common.operatorMode} —{" "}
                <span className="font-semibold">{organizationName}</span>
              </div>
            )}
          <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
            <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8 lg:py-4">
              <div className="flex min-w-0 items-center gap-3 lg:hidden">
                {showCompanyNav ? (
                  <button
                    type="button"
                    aria-label={
                      mobileNavOpen ? t.common.closeMenu : t.common.openMenu
                    }
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-zinc-200 text-zinc-700"
                    onClick={() => setMobileNavOpen((open) => !open)}
                  >
                    <MenuIcon open={mobileNavOpen} />
                  </button>
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-zinc-900">
                    {title ?? BRAND.name}
                  </p>
                  {description ? (
                    <p className="truncate text-sm text-zinc-600">{description}</p>
                  ) : null}
                </div>
              </div>
              {title && (
                <div className="hidden min-w-0 lg:block">
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                    {title}
                  </h1>
                  {description ? (
                    <p className="mt-1 text-base text-zinc-600">{description}</p>
                  ) : null}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                {isPlatformAdmin && !isPlatformPickerPage && (
                  <button
                    type="button"
                    onClick={() => void openCompanyPicker()}
                    className="hidden text-xs text-zinc-500 hover:text-zinc-800 sm:inline"
                  >
                    {t.common.switchCompany}
                  </button>
                )}
                {userName && (
                  <span className="hidden max-w-[12rem] truncate text-xs text-zinc-500 sm:inline">
                    {userName}
                  </span>
                )}
                <Button
                  variant="ghost"
                  className="text-xs lg:hidden"
                  onClick={logout}
                >
                  {t.common.logout}
                </Button>
              </div>
            </div>
          </header>

          {showCompanyNav && mobileNavOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                aria-label={t.common.closeMenu}
                className="absolute inset-0 bg-black/40"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-[var(--sidebar)] shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {organizationName ?? BRAND.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {organizationName ? BRAND.name : BRAND.tagline}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t.common.closeMenu}
                    className="rounded p-2 text-zinc-400 hover:bg-white/5"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <MenuIcon open />
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto p-3">
                  <NavLinks
                    pathname={pathname}
                    mobile
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                </nav>
                <div className="border-t border-white/10 p-3">
                  <LanguageSwitcher compact className="mb-2 px-1" />
                  {userName && (
                    <p className="truncate px-3 py-2 text-xs text-zinc-400">
                      {userName}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full rounded px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
                  >
                    {t.common.logout}
                  </button>
                </div>
              </div>
            </div>
          )}

          <main
            className={`safe-bottom mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${mainMaxWidthClass}`}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/** Routes cashiers to a dedicated shell so admin nav never mounts. */
export function AppShell(
  props: {
    children: React.ReactNode;
    title?: string;
    description?: string;
    contentMaxWidth?: "default" | "wide" | "full";
  }
) {
  const session = useAdminSession();
  if (session?.shellMode === "cashier") {
    return <CashierPageFrame {...props} />;
  }
  if (session?.shellMode === "admin") {
    return <AdminAppShell {...props} />;
  }
  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <aside className="hidden w-56 shrink-0 bg-[var(--sidebar)] lg:block" />
      <main className="min-w-0 flex-1 px-4 py-6">{props.children}</main>
    </div>
  );
}
