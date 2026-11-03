"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui";
import { useCompanyProfile } from "@/components/company/CompanyProfileProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { CashierNavLinks } from "@/components/layout/CashierNavLinks";
import type { AdminShellSession } from "@/components/layout/AdminSessionProvider";

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

export function CashierAppShell({
  session,
  children,
}: {
  session: AdminShellSession;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useAppMessages();
  const { organizationName: profileOrgName } = useCompanyProfile();
  const organizationName = session.organizationName ?? profileOrgName;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 self-start flex-col bg-[var(--sidebar)] lg:flex">
          <div className="border-b border-white/10 px-5 py-6">
            <p className="text-[15px] font-semibold tracking-tight text-white">
              {organizationName ?? BRAND.name}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {t.nav.groups.invoicingOffice}
            </p>
          </div>
          <nav className="flex flex-1 flex-col overflow-y-auto p-3">
            <CashierNavLinks pathname={pathname} />
          </nav>
          <div className="border-t border-white/10 p-3">
            <LanguageSwitcher compact className="mb-3 px-1" />
            <p className="mb-2 truncate rounded px-3 py-2 text-xs text-zinc-400">
              {session.name}
            </p>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full rounded px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              {t.common.logout}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
            <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8 lg:py-4">
              <div className="flex min-w-0 items-center gap-3 lg:hidden">
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {organizationName ?? BRAND.name}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {t.nav.groups.invoicingOffice}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden max-w-[12rem] truncate text-xs text-zinc-500 sm:inline">
                  {session.name}
                </span>
                <Button
                  variant="ghost"
                  className="text-xs lg:hidden"
                  onClick={() => void logout()}
                >
                  {t.common.logout}
                </Button>
              </div>
            </div>
          </header>

          {mobileNavOpen ? (
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
                      {t.nav.groups.invoicingOffice}
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
                  <CashierNavLinks
                    pathname={pathname}
                    mobile
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                </nav>
                <div className="border-t border-white/10 p-3">
                  <LanguageSwitcher compact className="mb-2 px-1" />
                  <p className="truncate px-3 py-2 text-xs text-zinc-400">
                    {session.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="w-full rounded px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
                  >
                    {t.common.logout}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <main className="safe-bottom mx-auto w-full flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
