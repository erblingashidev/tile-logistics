"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/dispatch", label: "Dispatch" },
  { href: "/warehouse", label: "Warehouse" },
  { href: "/routes", label: "Routes" },
  { href: "/vehicles", label: "Vehicles" },
  { href: "/vehicles/maintenance", label: "Maintenance" },
  { href: "/employees", label: "Employees" },
  { href: "/logs", label: "Logs" },
  { href: "/reports", label: "Reports" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/vehicles") return pathname === "/vehicles";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          const from = encodeURIComponent(pathname || "/");
          router.replace(`/login?from=${from}`);
          return null;
        }
        return r.json();
      })
      .then((data) => setUserName(data?.user?.name ?? null))
      .catch(() => {
        router.replace("/login");
      });
  }, [pathname, router]);

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
        <aside className="sticky top-0 hidden h-screen w-52 shrink-0 self-start flex-col bg-[var(--sidebar)] lg:flex">
          <div className="border-b border-white/10 px-5 py-6">
            <p className="text-[15px] font-semibold tracking-tight text-white">
              {BRAND.name}
            </p>
            <p className="mt-1 text-xs text-zinc-400">{BRAND.tagline}</p>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded px-3 py-2 text-sm transition ${
                    active
                      ? "bg-white/10 font-medium text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-3">
            {userName && (
              <p className="mb-2 truncate px-3 text-xs text-zinc-400">
                {userName}
              </p>
            )}
            <button
              type="button"
              onClick={logout}
              className="w-full rounded px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              Log out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8 lg:py-4">
              <div className="flex min-w-0 items-center gap-3 lg:hidden">
                <button
                  type="button"
                  aria-label="Open menu"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-zinc-200 text-zinc-700"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <span className="text-lg leading-none">☰</span>
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {title ?? BRAND.name}
                  </p>
                  {description ? (
                    <p className="truncate text-xs text-zinc-500">{description}</p>
                  ) : null}
                </div>
              </div>
              {title && (
                <div className="hidden min-w-0 lg:block">
                  <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
                  {description ? (
                    <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
                  ) : null}
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
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
                  Log out
                </Button>
              </div>
            </div>
          </header>

          {mobileNavOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 bg-black/40"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-[var(--sidebar)] shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{BRAND.name}</p>
                    <p className="text-xs text-zinc-400">{BRAND.tagline}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-zinc-400"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto p-3">
                  {nav.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`mb-1 block rounded px-3 py-3 text-sm ${
                          active
                            ? "bg-white/10 font-medium text-white"
                            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
                {userName && (
                  <p className="border-t border-white/10 px-4 py-3 text-xs text-zinc-400">
                    {userName}
                  </p>
                )}
              </div>
            </div>
          )}

          <main className="safe-bottom mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
